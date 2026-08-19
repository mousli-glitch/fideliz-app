/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — l'agrégat complet, et aucune saisie invalide devenue valeur
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819050000_agregat_jeu_complet.sql`.
 *  `harnais-enregistrement-jeu.sql` éprouve l'isolation inter-tenant et la
 *  conservation des lots ; celui-ci éprouve les deux défauts suivants.
 *
 *  ─── 1. L'ACTION COMPLÈTE N'ÉTAIT PAS ATOMIQUE ───
 *
 *  Le couple jeu+lots l'était, mais le design du restaurant s'écrivait AVANT
 *  l'appel. Un refus rendait `success: false` alors que couleur et logo
 *  avaient déjà changé. Le cas 2 prend l'empreinte de l'AGRÉGAT ENTIER —
 *  restaurant, jeu, lots — avant, provoque un refus tardif, et exige la même
 *  empreinte après. Un état partiel serait rouge.
 *
 *  ─── 2. UNE SAISIE INVALIDE DEVENAIT UNE VALEUR MÉTIER VALIDE ───
 *
 *  `Number("abc")` vaut `NaN`, `JSON.stringify(NaN)` vaut `"null"`, et pour
 *  `quantity` `null` signifie « stock illimité ». Les cas 3 à 11 envoient
 *  neuf saisies invalides et exigent un refus pour chacune. Chaque cas
 *  vérifie aussi ce qui a été ENREGISTRÉ : un `NULL` en base voudrait dire
 *  « illimité », c'est-à-dire exactement le défaut.
 *
 *  ─── LA DISTINCTION QUI COMPTE ───
 *
 *  Cas 12 : une saisie BLANCHE vaut « rien de saisi », donc illimité. Ce
 *  n'est pas un contournement — « abc » est une valeur qui n'est pas un
 *  nombre, « » n'est pas une valeur. Cas 13 : « 0 » est accepté et vaut
 *  ZÉRO, pas NULL : un stock épuisé n'est pas un stock illimité.
 *
 *  Ces deux cas étaient rouges au premier passage, et ce sont MES ASSERTIONS
 *  qui étaient fausses, pas le code. Corrigées ici, avec leur justification.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Une transaction, annulée à la fin. Garde de cible synthétique avant toute
 *  mutation. Aucune adresse réelle : domaine réservé `.invalid` (RFC 2606).
 *
 *  ATTENDU : 19 cas, tous conformes. Le verdict LÈVE sinon.
 *  Joué le 19/08/2026 sur la branche de test synthétique — 19/19 conformes,
 *  dont « refus tardif : empreinte identique=t ».
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare v_u int; v_r int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_r from public.restaurants;
  if v_u > 0 or v_r > 500 then
    raise exception 'HARNAIS REFUSÉ : cible non synthétique (% users, % restos). Aucune mutation.', v_u, v_r;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.enregistrer_jeu_et_lots(uuid,uuid,jsonb,jsonb,jsonb)') is null then
    raise exception 'HARNAIS INAPPLICABLE : signature à cinq arguments absente. Migration 20260819050000 non appliquée.';
  end if;
end $$;

create temp table _ag (ordre int, cas text, conforme boolean, detail text) on commit drop;

do $$
declare
  vA uuid := '00000000-0000-4000-8000-0000000000a1';
  gA uuid := '00000000-0000-4000-8000-0000000000a2';
  jeu jsonb := jsonb_build_object('name','jeu-modifie','active_action','wheel',
    'action_url','https://exemple.invalid','validity_days',7,'min_spend','0');
  design jsonb := jsonb_build_object('primary_color','#111111','logo_url','https://exemple.invalid/l.png');
  bons jsonb := jsonb_build_array(
    jsonb_build_object('label','Lot 1','weight','60'),
    jsonb_build_object('label','Lot 2','weight','40'));
  v_emp_avant text; v_emp_apres text; v_n int; v_q int; v_code text; i int := 0;
  v_saisie text; v_lots jsonb; v_logo_avant text;
  /*
   * « abc » et « NaN » sont des VALEURS qui ne sont pas des nombres : refus.
   * Une saisie vide ou blanche n'est pas une valeur, c'est « rien de saisi »,
   * donc « illimité » par la règle — elle n'a pas sa place dans cette liste
   * et fait l'objet du cas 12.
   */
  saisies text[] := array['abc','-3','5.5','1e3','9999999999','NaN','Infinity','0x10','١٢٣'];
begin
  insert into public.restaurants (id,name,slug,primary_color,logo_url)
    values (vA,'resto-a','resto-a','#000000','origine.png');
  insert into public.games (id,restaurant_id,name,active_action,status)
    values (gA,vA,'jeu-a','wheel','active');
  insert into public.prizes (id,game_id,label,weight) values (gen_random_uuid(),gA,'origine-a',100);

  -- Empreinte de l'AGRÉGAT : restaurant + jeu + lots, pas seulement les lots.
  select md5(r.primary_color||'|'||r.logo_url||'|'||g.name||'|'||
             (select coalesce(string_agg(p.label||':'||p.weight, ',' order by p.label), 'aucun')
                from public.prizes p where p.game_id = gA))
    into v_emp_avant from public.restaurants r, public.games g where r.id=vA and g.id=gA;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, bons, design);
    select count(*) into v_n from public.prizes where game_id = gA;
    insert into _ag values (1,'nominal : design + jeu + lots', v_n = 2 and
      (select primary_color from public.restaurants where id=vA) = '#111111',
      format('%s lot(s), couleur=%s', v_n, (select primary_color from public.restaurants where id=vA)));
  exception when others then
    insert into _ag values (1,'nominal : design + jeu + lots', false, sqlstate||' '||sqlerrm);
  end;

  update public.restaurants set primary_color='#000000', logo_url='origine.png' where id=vA;
  update public.games set name='jeu-a' where id=gA;
  delete from public.prizes where game_id=gA;
  insert into public.prizes (id,game_id,label,weight) values (gen_random_uuid(),gA,'origine-a',100);

  -- LE CAS QUI COMPTE : un refus tardif ne doit RIEN avoir changé, y compris
  -- le design du restaurant, qui s'écrivait avant l'appel.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Trop peu','weight','3')), design);
    insert into _ag values (2,'refus tardif : agregat entier inchange (design compris)', false, 'accepte');
  exception when others then
    v_code := sqlstate;
    select md5(r.primary_color||'|'||r.logo_url||'|'||g.name||'|'||
               (select coalesce(string_agg(p.label||':'||p.weight, ',' order by p.label), 'aucun')
                  from public.prizes p where p.game_id = gA))
      into v_emp_apres from public.restaurants r, public.games g where r.id=vA and g.id=gA;
    insert into _ag values (2,'refus tardif : agregat entier inchange (design compris)',
      v_code='P0114' and v_emp_avant = v_emp_apres,
      format('sqlstate=%s ; empreinte identique=%s', v_code, v_emp_avant = v_emp_apres));
  end;

  -- LA COERCITION : chaque saisie invalide REFUSÉE, jamais repliée sur illimité.
  foreach v_saisie in array saisies loop
    i := i + 1;
    v_lots := jsonb_build_array(jsonb_build_object('label','Lot','weight','100','quantity',v_saisie));
    begin
      perform public.enregistrer_jeu_et_lots(gA, vA, jeu, v_lots, design);
      select quantity into v_q from public.prizes where game_id=gA limit 1;
      insert into _ag values (2+i, format('stock « %s » -> refus', v_saisie), false,
        format('ACCEPTE ; quantity enregistree = %s', coalesce(v_q::text,'NULL (illimite !)')));
    exception when others then
      insert into _ag values (2+i, format('stock « %s » -> refus', v_saisie),
        sqlstate = 'P0113', 'sqlstate='||sqlstate);
    end;
  end loop;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Lot','weight','100','quantity','   ')), design);
    select quantity into v_q from public.prizes where game_id=gA limit 1;
    insert into _ag values (12,'stock blanc = illimite (regle, pas contournement)', v_q is null,
      format('quantity=%s', coalesce(v_q::text,'NULL')));
  exception when others then
    insert into _ag values (12,'stock blanc = illimite (regle, pas contournement)', false, sqlstate||' '||sqlerrm);
  end;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Epuise','weight','100','quantity','0')), design);
    select quantity into v_q from public.prizes where game_id=gA limit 1;
    insert into _ag values (13,'stock « 0 » accepte, et vaut 0 (epuise) pas NULL', v_q = 0,
      format('quantity=%s', coalesce(v_q::text,'NULL')));
  exception when others then
    insert into _ag values (13,'stock « 0 » accepte, et vaut 0 (epuise) pas NULL', false, sqlstate||' '||sqlerrm);
  end;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Lot','weight','101')), design);
    insert into _ag values (14,'poids > 100 -> refus', false, 'accepte');
  exception when others then
    insert into _ag values (14,'poids > 100 -> refus', sqlstate='P0113', 'sqlstate='||sqlstate);
  end;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA,
      jeu || jsonb_build_object('is_date_limit_active', true,
        'start_date','2026-03-01T00:00:00Z','end_date','2026-01-01T00:00:00Z'), bons, design);
    insert into _ag values (15,'fin avant debut -> refus', false, 'accepte');
  exception when others then
    insert into _ag values (15,'fin avant debut -> refus', sqlstate='P0117', 'sqlstate='||sqlstate);
  end;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA,
      jeu || jsonb_build_object('is_date_limit_active', true), bons, design);
    insert into _ag values (16,'limite active sans dates -> refus', false, 'accepte');
  exception when others then
    insert into _ag values (16,'limite active sans dates -> refus', sqlstate='P0117', 'sqlstate='||sqlstate);
  end;

  begin
    perform public.enregistrer_jeu_et_lots(gA, vA,
      jeu || jsonb_build_object('validity_days', 0), bons, design);
    insert into _ag values (17,'validite < 1 jour -> refus', false, 'accepte');
  exception when others then
    insert into _ag values (17,'validite < 1 jour -> refus', sqlstate='P0117', 'sqlstate='||sqlstate);
  end;

  -- WHITELIST : rien d'autre que les deux champs autorisés n'atteint la table.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, bons,
      jsonb_build_object('primary_color','#222222','slug','vole','is_blocked',true));
    insert into _ag values (18,'whitelist : slug/is_blocked ignores',
      (select slug from public.restaurants where id=vA) = 'resto-a'
      and (select is_blocked from public.restaurants where id=vA) is not true,
      format('slug=%s', (select slug from public.restaurants where id=vA)));
  exception when others then
    insert into _ag values (18,'whitelist : slug/is_blocked ignores', false, sqlstate||' '||sqlerrm);
  end;

  -- Comparaison à la valeur RÉELLEMENT en place juste avant, pas à celle de
  -- départ : les cas précédents l'ont déjà modifiée. (Mon assertion initiale
  -- comparait à « origine.png » et était fausse pour cette raison.)
  select logo_url into v_logo_avant from public.restaurants where id=vA;
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, bons,
      jsonb_build_object('primary_color','#333333'));
    insert into _ag values (19,'champ omis : logo conserve, pas efface',
      (select logo_url from public.restaurants where id=vA) is not distinct from v_logo_avant,
      format('avant=%s apres=%s', coalesce(v_logo_avant,'NULL'),
             coalesce((select logo_url from public.restaurants where id=vA),'NULL')));
  exception when others then
    insert into _ag values (19,'champ omis : logo conserve, pas efface', false, sqlstate||' '||sqlerrm);
  end;
end $$;

do $$
declare v_n int; v_e int; v_l text;
begin
  select count(*) into v_n from _ag;
  if v_n <> 19 then raise exception 'HARNAIS AGREGAT : % cas enregistre(s), 19 attendus.', v_n; end if;
  select count(*), string_agg(ordre||'. '||cas||' - '||detail, E'\n' order by ordre)
    into v_e, v_l from _ag where conforme is distinct from true;
  if v_e > 0 then raise exception E'HARNAIS AGREGAT : % cas NON CONFORME(S).\n%', v_e, v_l; end if;
  raise notice 'HARNAIS AGREGAT : les 19 cas sont conformes.';
end $$;

select ordre, cas, conforme, detail from _ag order by ordre;

rollback;
