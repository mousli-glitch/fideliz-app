/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — créer un jeu est un seul acte, ou rien
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819090000_creation_atomique_du_jeu.sql`.
 *
 *  ─── CE QUE CE HARNAIS REPRODUIT ───
 *
 *  L'ancien `createGameAction` faisait cinq requêtes séparées à la clé de
 *  service, plusieurs erreurs non lues. Un échec tardif laissait, en
 *  production : les anciens jeux TERMINÉS et le nouveau jamais créé — un
 *  restaurant sans jeu, et son QR imprimé qui ne mène nulle part — ou un jeu
 *  créé SANS AUCUN LOT.
 *
 *  Les cas 2 à 9 provoquent des refus à des profondeurs différentes et
 *  vérifient à chaque fois que l'AGRÉGAT ENTIER est intact : design du
 *  restaurant, jeux, statuts, lots. Le cas 7 vérifie nommément que l'ancien
 *  jeu est TOUJOURS ACTIF après un refus — c'est lui qui porte le QR imprimé.
 *
 *  Les cas 11 et 12 vérifient qu'une création chez A ne touche jamais B.
 *
 *  ATTENDU : 13 cas conformes. Joué le 19/08/2026 — 13/13.
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;
do $$ declare v_u int; v_r int; begin
  select count(*) into v_u from auth.users; select count(*) into v_r from public.restaurants;
  if v_u <> 0 or v_r <> 0 then
    raise exception 'HARNAIS REFUSÉ : cible non vierge (% Auth, % restaurants).', v_u, v_r; end if;
end $$;

do $$
begin
  if to_regprocedure('public.creer_jeu_et_lots(uuid,jsonb,jsonb,jsonb)') is null then
    raise exception 'HARNAIS INAPPLICABLE : migration 20260819090000 non appliquée.';
  end if;
end $$;

create temp table _cj (ordre int, cas text, attendu text, obtenu text, conforme boolean) on commit drop;

do $$
declare
  rA uuid := '00000000-0000-4000-8000-00000000c001';
  rB uuid := '00000000-0000-4000-8000-00000000c002';
  gAnc uuid := '00000000-0000-4000-8000-00000000c003';
  jeu jsonb := jsonb_build_object('name','nouveau','active_action','wheel',
    'action_url','https://exemple.invalid','validity_days',7,'min_spend','5,90');
  bons jsonb := jsonb_build_array(
    jsonb_build_object('label','L1','weight','60'), jsonb_build_object('label','L2','weight','40'));
  v_res jsonb; v_emp text; v_emp2 text; v_code text; v_n int; s text;
begin
  insert into public.restaurants (id,name,slug,primary_color) values
    (rA,'resto-a','resto-a','#000000'), (rB,'resto-b','resto-b','#111111');
  insert into public.games (id,restaurant_id,name,active_action,status,min_spend)
    values (gAnc,rA,'ancien','wheel','active','5');
  insert into public.prizes (id,game_id,label,weight) values (gen_random_uuid(),gAnc,'lot-ancien',100);

  v_res := public.creer_jeu_et_lots(rA, jeu, bons, jsonb_build_object('primary_color','#222222'));
  insert into _cj select 1,'nominal : jeu cree, ancien termine, 2 lots, 590 centimes',
    'actif=1 ended=1 lots=2 cents=590',
    format('actif=%s ended=%s lots=%s cents=%s',
      (select count(*) from public.games where restaurant_id=rA and status='active'),
      (select count(*) from public.games where restaurant_id=rA and status='ended'),
      (select count(*) from public.prizes where game_id=(v_res->>'game_id')::uuid),
      (select min_spend_cents from public.games where id=(v_res->>'game_id')::uuid)),
    (select count(*) from public.games where restaurant_id=rA and status='active')=1
      and (select count(*) from public.games where restaurant_id=rA and status='ended')=1
      and (select count(*) from public.prizes where game_id=(v_res->>'game_id')::uuid)=2
      and (select min_spend_cents from public.games where id=(v_res->>'game_id')::uuid)=590;

  select md5(string_agg(x, '|' order by x)) into v_emp from (
    select g.id::text||g.status||g.name||coalesce(g.min_spend,'')||coalesce(g.min_spend_cents::text,'') as x
      from public.games g where g.restaurant_id=rA
    union all select r.primary_color from public.restaurants r where r.id=rA
    union all select p.id::text||p.label from public.prizes p
      join public.games g2 on g2.id=p.game_id where g2.restaurant_id=rA) t;

  foreach s in array array['abc','-3','5abc','1e3','5.999'] loop
    begin
      perform public.creer_jeu_et_lots(rA, jeu || jsonb_build_object('min_spend', s, 'name','NE-DOIT-PAS-PASSER'),
        bons, jsonb_build_object('primary_color','#ffffff'));
      insert into _cj values (2,'montant « '||s||' » -> refus','lève P0120','ACCEPTE',false);
    exception when others then
      v_code := sqlstate;
      select md5(string_agg(x, '|' order by x)) into v_emp2 from (
        select g.id::text||g.status||g.name||coalesce(g.min_spend,'')||coalesce(g.min_spend_cents::text,'') as x
          from public.games g where g.restaurant_id=rA
        union all select r.primary_color from public.restaurants r where r.id=rA
        union all select p.id::text||p.label from public.prizes p
          join public.games g2 on g2.id=p.game_id where g2.restaurant_id=rA) t;
      insert into _cj values (2,'montant « '||s||' » -> refus, agregat intact',
        'P0120 + empreinte identique', v_code||' + '||(v_emp=v_emp2)::text,
        v_code='P0120' and v_emp=v_emp2);
    end;
  end loop;

  begin
    perform public.creer_jeu_et_lots(rA, jeu,
      jsonb_build_array(jsonb_build_object('label','L','weight','abc')), '{}'::jsonb);
    insert into _cj values (7,'poids « abc » -> refus','lève','ACCEPTE',false);
  exception when others then
    insert into _cj values (7,'poids « abc » -> refus, jeu actif conserve','P0113 + 1 actif',
      sqlstate||' + '||(select count(*) from public.games where restaurant_id=rA and status='active')::text||' actif',
      sqlstate='P0113' and (select count(*) from public.games where restaurant_id=rA and status='active')=1);
  end;

  begin
    perform public.creer_jeu_et_lots(rA, jeu || jsonb_build_object('is_stock_limit_active',true),
      jsonb_build_array(jsonb_build_object('label','L','weight','100','quantity','beaucoup')), '{}'::jsonb);
    insert into _cj values (8,'stock « beaucoup » -> refus','lève','ACCEPTE',false);
  exception when others then
    insert into _cj values (8,'stock « beaucoup » -> refus, jamais illimite','P0113',sqlstate,sqlstate='P0113');
  end;

  begin
    perform public.creer_jeu_et_lots(rA, jeu, jsonb_build_array(jsonb_build_object('label','L','weight','3')), '{}'::jsonb);
    insert into _cj values (9,'total <> 100 -> refus','lève','ACCEPTE',false);
  exception when others then
    insert into _cj values (9,'total <> 100 -> refus','P0114',sqlstate,sqlstate='P0114');
  end;

  begin
    perform public.creer_jeu_et_lots(gen_random_uuid(), jeu, bons, '{}'::jsonb);
    insert into _cj values (10,'restaurant inexistant -> refus','lève','ACCEPTE',false);
  exception when others then
    insert into _cj values (10,'restaurant inexistant -> refus','P0111',sqlstate,sqlstate='P0111');
  end;

  select count(*) into v_n from public.games where restaurant_id=rB;
  insert into _cj values (11,'le confrere B n''a recu aucun jeu','0',v_n::text,v_n=0);
  insert into _cj select 12,'le design de B est intact','#111111',
    (select primary_color from public.restaurants where id=rB),
    (select primary_color from public.restaurants where id=rB)='#111111';
  insert into _cj select 13,'texte historique derive des centimes','5.90',
    (select min_spend from public.games where restaurant_id=rA and status='active'),
    (select min_spend from public.games where restaurant_id=rA and status='active')='5.90';
end $$;

do $$ declare v_e int; v_l text; v_n int; begin
  select count(*) into v_n from _cj;
  if v_n <> 13 then raise exception 'HARNAIS CREATION : % cas, 13 attendus.', v_n; end if;
  select count(*), string_agg(cas||' : attendu '||attendu||', obtenu '||obtenu, E'\n')
    into v_e, v_l from _cj where conforme is distinct from true;
  if v_e > 0 then raise exception E'HARNAIS CREATION : % cas NON CONFORME(S).\n%', v_e, v_l; end if;
  raise notice 'HARNAIS CREATION : les 13 cas sont conformes.';
end $$;

select ordre, cas, obtenu, conforme from _cj order by ordre, cas;
rollback;
