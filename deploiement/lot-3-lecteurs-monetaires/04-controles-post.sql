/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 — CONTRÔLES APRÈS APPLICATION, LECTURE SEULE, FAIL-CLOSED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUCUNE écriture. Lève au premier écart.
 *
 * ─── EN CAS D'ANOMALIE : NE PAS JOUER LE RETOUR ARRIÈRE PAR RÉFLEXE ───
 *
 *   1. ARRÊT IMMÉDIAT — ne rien relancer, ne rien « réessayer ».
 *   2. CONSERVER LES PREUVES — sortie observée, empreintes, heure.
 *   3. NEUTRALISER LE PARCOURS si l'émission des tickets devient incohérente
 *      (hors service est moins grave qu'incohérent).
 *   4. CORRECTION FORWARD en priorité.
 *   5. RETOUR ARRIÈRE EN DERNIER RECOURS, et uniquement sur décision explicite
 *      de Samy, après avoir établi que l'incident vient de CE lot.
 *
 * Et JAMAIS le rollback de l'étape 2 : il supprime les colonnes, donc les
 * conditions figées de tous les tickets émis depuis.
 */

do $post$
declare
  r record; v_attendu text;
  c_play_post constant text := '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d';
  c_reg_post  constant text := '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd';
  c_acl       constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  -- ── Le contrat monétaire, en entier ──
  for r in
    select 'public.centimes_depuis_saisie(text)' as sig
    union all select 'public.minimum_effectif_centimes(integer,integer,text)'
    union all select 'public.minimum_effectif_du_ticket(uuid)'
  loop
    if to_regprocedure(r.sig) is null then
      raise exception 'CONTROLE ARRET : % absente. ARRET IMMEDIAT.', r.sig;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='games' and column_name='min_spend_cents') then
    raise exception 'CONTROLE ARRET : games.min_spend_cents absente. ARRET IMMEDIAT.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then
    raise exception 'CONTROLE ARRET : winners.min_spend_cents_snapshot absente. ARRET IMMEDIAT.';
  end if;

  -- ── Les deux lecteurs : corps, manifeste, droits ──
  for r in
    select p.oid, p.proname, encode(digest(p.prosrc,'sha256'),'hex') as h,
           pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
             || ' | secdef=' || p.prosecdef::text
             || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
             || ' | vol=' || p.provolatile::text
             || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                       from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)') as manif
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in ('play_game','register_win')
  loop
    v_attendu := case r.proname when 'play_game' then c_play_post else c_reg_post end;
    if r.h is distinct from v_attendu then
      raise exception 'CONTROLE ARRET : empreinte de % = % au lieu de %.', r.proname, r.h, v_attendu;
    end if;
    if r.manif not like '% | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
      raise exception 'CONTROLE ARRET : manifeste de % non conforme -> %', r.proname, r.manif;
    end if;
    if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'CONTROLE ARRET : service_role a PERDU EXECUTE sur % — le parcours joueur est casse.', r.proname;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception 'CONTROLE ARRET : anon ou authenticated a acquis EXECUTE sur %.', r.proname;
    end if;
  end loop;

  -- ── L'isolation lot/jeu du hotfix doit être intacte ──
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='register_win'
      and position('and game_id = p_game_id;' in p.prosrc) > 0
      and position('and game_id = p_game_id and quantity > 0;' in p.prosrc) > 0
  ) then
    raise exception 'CONTROLE ARRET : l''isolation lot/jeu a DISPARU de register_win. ARRET IMMEDIAT — un P0 de securite est rouvert.';
  end if;

  -- ── Le contrat répond juste, sur les formes qui portent le défaut ──
  if public.centimes_depuis_saisie('5,90') is distinct from 590 then
    raise exception 'CONTROLE ARRET : « 5,90 » ne vaut pas 590 centimes.';
  end if;
  if public.minimum_effectif_centimes(null, null, 'abc') is not null then
    raise exception 'CONTROLE ARRET : un montant illisible ne rend pas NULL.';
  end if;
  if public.minimum_effectif_centimes(590, 1200, '99') is distinct from 590 then
    raise exception 'CONTROLE ARRET : le snapshot ne prime pas sur le jeu.';
  end if;

  raise notice 'CONTROLE OK : contrat, lecteurs, manifestes, droits et isolation lot/jeu conformes.';
end $post$;

/*
 * ─── OBSERVATION, NON CONCLUANTE ET VOLONTAIREMENT NON BLOQUANTE ───
 *
 * Sur une production active, de vrais joueurs font varier ces totaux entre deux
 * lectures. Un écart ne signale pas le lot, et une absence d'écart ne
 * l'innocente pas. Ces chiffres sont là pour l'œil de l'opérateur.
 *
 * La ligne qui compte vraiment est la dernière : à partir du `commit` de
 * l'étape 3, les tickets NOUVEAUX doivent porter un snapshot. Elle ne vaut donc
 * que si des gains ont eu lieu depuis.
 */
select (select count(*) from public.games)   as jeux,
       (select count(*) from public.prizes)  as lots,
       (select count(*) from public.winners) as tickets,
       (select count(*) from public.winners where min_spend_cents_snapshot is not null) as tickets_avec_snapshot,
       'observation non concluante — ne pas en faire un critere' as portee;
