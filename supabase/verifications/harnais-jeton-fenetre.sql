/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — une fenêtre de suppression appartient à UNE opération
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819040000_jeton_de_fenetre_suppression.sql`.
 *  `harnais-fenetre-suppression.sql` éprouve la barrière (écrivain ↔
 *  suppression) ; celui-ci éprouve la propriété de la fenêtre (suppression ↔
 *  suppression).
 *
 *  ─── LA COURSE QU'ON FERME ───
 *
 *  Signalé le 19/08/2026. `on conflict do update` laissait deux suppressions
 *  du même compte « ouvrir » la même fenêtre et poursuivre en parallèle. La
 *  première à finir la refermait — rouvrant les rattachements alors que la
 *  seconde n'avait pas atteint son irréversible.
 *
 *  Cas 2 et 4 : l'ouverture concurrente est refusée (P0105), la fermeture
 *  étrangère aussi (P0106) et la fenêtre reste en place.
 *
 *  ─── LE PIÈGE QUE CE HARNAIS A ATTRAPÉ ───
 *
 *  `create or replace function` avec un paramètre de plus ne remplace pas :
 *  il crée une SURCHARGE. Les deux versions coexistaient, un appel à deux
 *  arguments résolvait encore vers l'ancienne — celle qui écrase la fenêtre
 *  d'autrui — et un appel ambigu échouait en `42725 function is not unique`.
 *  Le fichier de migration seul ne le disait pas ; le jouer, si.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Une transaction, annulée à la fin. Garde de cible synthétique avant toute
 *  mutation. Aucune donnée réelle : seuls des UUID synthétiques.
 *
 *  ATTENDU : 10 cas, tous conformes. Le verdict LÈVE sinon.
 *
 *  Joué le 19/08/2026 sur la branche de test synthétique — les 10 cas
 *  conformes, dont « 2e operation -> P0105 », « fermeture etrangere -> P0106,
 *  fenetre toujours la : 1 » et « reparation : retiree=true, jeton rendu ».
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare v_u int;
begin
  select count(*) into v_u from auth.users;
  if v_u > 0 then
    raise exception 'HARNAIS REFUSÉ : % utilisateur(s) Auth — cible non confirmée synthétique.', v_u;
  end if;
end $$;

-- Garde anti-dérive : exactement une signature de chaque, aucune surcharge.
do $$
declare v_n int;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('ouvrir_fenetre_suppression','fermer_fenetre_suppression','forcer_fermeture_fenetre');
  if v_n <> 3 then
    raise exception 'HARNAIS INAPPLICABLE : % fonction(s) de fenêtre, 3 attendues. Une SURCHARGE laisserait vivre l''ancienne version, celle qui écrase la fenêtre d''autrui.', v_n;
  end if;
end $$;

create temp table _jt (ordre int, cas text, conforme boolean, detail text) on commit drop;

do $$
declare
  c1 uuid := '00000000-0000-4000-8000-00000000c001';
  c2 uuid := '00000000-0000-4000-8000-00000000c002';
  j1 uuid; j2 uuid; v_code text; v_ok boolean; v_res jsonb; v_n int;
begin
  j1 := public.ouvrir_fenetre_suppression(c1, null);
  insert into _jt values (1,'ouverture rend un jeton', j1 is not null,
    case when j1 is null then 'null' else 'jeton present' end);

  -- LA COURSE : une SECONDE opération ne doit pas pouvoir ouvrir.
  begin
    j2 := public.ouvrir_fenetre_suppression(c1, null);
    insert into _jt values (2,'2e operation sur le meme compte -> refus', false,
      'ACCEPTE : la course suppression <-> suppression est toujours ouverte');
  exception when others then
    v_code := sqlstate;
    insert into _jt values (2,'2e operation sur le meme compte -> refus', v_code = 'P0105', 'sqlstate='||v_code);
  end;

  -- Reprise EXPLICITE de la MÊME opération : acceptée, même jeton.
  begin
    j2 := public.ouvrir_fenetre_suppression(c1, null, j1);
    insert into _jt values (3,'reprise avec le bon jeton -> acceptee', j2 = j1,
      'jeton identique='||(j2 = j1)::text);
  exception when others then
    insert into _jt values (3,'reprise avec le bon jeton -> acceptee', false, sqlstate||' '||sqlerrm);
  end;

  -- Fermer la fenêtre d'autrui : refusé, ET la fenêtre reste.
  begin
    v_ok := public.fermer_fenetre_suppression(c1, gen_random_uuid());
    insert into _jt values (4,'fermeture avec un jeton etranger -> refus', false,
      'ACCEPTE : une operation pouvait fermer celle d''une autre');
  exception when others then
    v_code := sqlstate;
    select count(*) into v_n from public.comptes_en_suppression where user_id = c1;
    insert into _jt values (4,'fermeture avec un jeton etranger -> refus',
      v_code = 'P0106' and v_n = 1, format('sqlstate=%s ; fenetre toujours la : %s', v_code, v_n));
  end;

  -- Sans jeton non plus : c'est ce que permettait l'ancienne signature.
  begin
    v_ok := public.fermer_fenetre_suppression(c1);
    insert into _jt values (5,'fermeture sans jeton -> refus', false, 'ACCEPTE');
  exception when others then
    insert into _jt values (5,'fermeture sans jeton -> refus', sqlstate = 'P0106', 'sqlstate='||sqlstate);
  end;

  v_ok := public.fermer_fenetre_suppression(c1, j1);
  select count(*) into v_n from public.comptes_en_suppression where user_id = c1;
  insert into _jt values (6,'fermeture avec son jeton -> fenetre retiree', v_ok and v_n = 0,
    format('retour=%s ; restant=%s', v_ok, v_n));

  -- Une reprise ne doit pas échouer sur une fenêtre déjà fermée.
  begin
    v_ok := public.fermer_fenetre_suppression(c1, j1);
    insert into _jt values (7,'fermer une fenetre absente : sans erreur', v_ok = false, 'retour='||v_ok::text);
  exception when others then
    insert into _jt values (7,'fermer une fenetre absente : sans erreur', false, sqlstate);
  end;

  j1 := public.ouvrir_fenetre_suppression(c1, null);
  j2 := public.ouvrir_fenetre_suppression(c2, null);
  insert into _jt values (8,'deux comptes distincts : deux fenetres', j1 is distinct from j2, 'jetons distincts');

  -- Réparation : elle retire, ET elle rend ce qu'elle a retiré. Une
  -- réparation qui ne laisse aucune trace ne vaut pas mieux qu'un DELETE
  -- dans une console.
  v_res := public.forcer_fermeture_fenetre(c2);
  select count(*) into v_n from public.comptes_en_suppression where user_id = c2;
  insert into _jt values (9,'reparation : retire et rend la ligne',
    (v_res->>'retiree')::boolean and (v_res->>'jeton') is not null and v_n = 0,
    format('retiree=%s ; jeton rendu=%s ; restant=%s', v_res->>'retiree', (v_res->>'jeton') is not null, v_n));

  v_res := public.forcer_fermeture_fenetre(c2);
  insert into _jt values (10,'reparation sur fenetre absente : retiree=false',
    (v_res->>'retiree')::boolean = false, 'retiree='||(v_res->>'retiree'));

  perform public.fermer_fenetre_suppression(c1, j1);
end $$;

do $$
declare v_n int; v_e int; v_l text;
begin
  select count(*) into v_n from _jt;
  if v_n <> 10 then raise exception 'HARNAIS JETON : % cas enregistre(s), 10 attendus.', v_n; end if;
  select count(*), string_agg(ordre||'. '||cas||' - '||detail, E'\n' order by ordre)
    into v_e, v_l from _jt where conforme is distinct from true;
  if v_e > 0 then raise exception E'HARNAIS JETON : % cas NON CONFORME(S).\n%', v_e, v_l; end if;
  raise notice 'HARNAIS JETON : les 10 cas sont conformes.';
end $$;

select ordre, cas, conforme, detail from _jt order by ordre;

rollback;
