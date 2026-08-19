/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 — PRÉFLIGHT PRODUCTION, LECTURE SEULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUCUNE écriture. Uniquement des métadonnées et des agrégats. Aucun montant
 * individuel, aucun identifiant client, aucune donnée personnelle.
 *
 * Lève au premier écart : zéro ligne rendue par un `SELECT` ne contient aucun
 * verdict rouge et se lit comme un succès.
 *
 * ─── CE QU'IL DÉTERMINE ───
 *
 * Quelles étapes sont nécessaires, en lisant l'état réel :
 *
 *   ETAPES 2 ET 3 REQUISES  le contrat monétaire est absent
 *   ETAPE 3 REQUISE         le contrat est là, les lecteurs sont d'origine
 *   DEJA APPLIQUE           les deux lecteurs portent le corps corrigé
 *
 * Tout autre état lève.
 *
 * ─── UNE PRÉCONDITION QUI N'EST PAS NÉGOCIABLE ───
 *
 * `register_win` doit porter l'isolation lot/jeu du hotfix du 19/08/2026. Si
 * la production portait encore le corps baseline, le préflight s'arrête : il
 * faudrait d'abord rejouer `hotfix/isolation-lot-jeu/`. Appliquer le lot 3
 * par-dessus une base non corrigée écraserait un correctif de sécurité par un
 * correctif d'affichage.
 */

do $preflight$
declare
  v_h text; v_n int; v_manif text; v_oid oid;
  v_contrat int := 0;
  v_etat text;

  c_play_pre  constant text := 'bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2';
  c_play_post constant text := '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d';
  c_reg_pre   constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_reg_post  constant text := '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd';
  c_play_sig  constant text := 'p_game_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_reg_sig   constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_acl       constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  -- ── Les deux fonctions cibles existent, une seule fois chacune ──
  for v_etat in select unnest(array['play_game','register_win']) loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_etat;
    if v_n <> 1 then
      raise exception using errcode = 'P0134',
        message = format('PREFLIGHT ARRET : %s fonction(s) public.%s, 1 attendue.', v_n, v_etat);
    end if;
  end loop;

  -- ── play_game : signature, manifeste, corps connu ──
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'play_game';

  if v_manif is distinct from c_play_sig || ' | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : manifeste de play_game inattendu -> ' || v_manif;
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : service_role n''a pas EXECUTE sur play_game.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : anon ou authenticated peut executer play_game.';
  end if;
  if v_h not in (c_play_pre, c_play_post) then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : corps de play_game inconnu (empreinte %s). Ni la version auditee, ni la corrigee.', v_h);
  end if;
  v_etat := case when v_h = c_play_post then 'corrige' else 'origine' end;

  -- ── register_win : idem, PLUS l'isolation lot/jeu obligatoire ──
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_manif is distinct from c_reg_sig || ' | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : manifeste de register_win inattendu -> ' || v_manif;
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : service_role n''a pas EXECUTE sur register_win.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : anon ou authenticated peut executer register_win.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'register_win'
      and position('and game_id = p_game_id;' in p.prosrc) > 0
      and position('and game_id = p_game_id and quantity > 0;' in p.prosrc) > 0
  ) then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : register_win ne porte PAS l''isolation lot/jeu. Rejouer d''abord hotfix/isolation-lot-jeu/. Le lot 3 ne doit jamais recouvrir un correctif de securite manquant.';
  end if;

  if v_h not in (c_reg_pre, c_reg_post) then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : corps de register_win inconnu (empreinte %s).', v_h);
  end if;

  -- Les deux lecteurs doivent être dans le MÊME état.
  if (v_h = c_reg_post) <> (v_etat = 'corrige') then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : play_game est %s mais register_win ne l''est pas. Etat mixte — ne rien appliquer sans comprendre pourquoi.', v_etat);
  end if;

  -- ── Le contrat monétaire : présent en entier, ou absent en entier ──
  if to_regprocedure('public.centimes_depuis_saisie(text)') is not null then v_contrat := v_contrat + 1; end if;
  if to_regprocedure('public.minimum_effectif_centimes(integer,integer,text)') is not null then v_contrat := v_contrat + 1; end if;
  if to_regprocedure('public.minimum_effectif_du_ticket(uuid)') is not null then v_contrat := v_contrat + 1; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='min_spend_cents') then v_contrat := v_contrat + 1; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then v_contrat := v_contrat + 1; end if;

  if v_contrat not in (0, 5) then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : contrat monetaire PARTIEL (%s/5 objets). Un demi-contrat ne se complete pas a l''aveugle.', v_contrat);
  end if;

  if v_contrat = 0 and v_etat = 'corrige' then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : les lecteurs sont corriges mais le contrat monetaire est absent. Etat impossible — play_game appellerait une fonction inexistante.';
  end if;

  if v_etat = 'corrige' then
    raise notice 'DEJA APPLIQUE : les deux lecteurs portent le corps corrige. NE RIEN EXECUTER.';
  elsif v_contrat = 5 then
    raise notice 'ETAPE 3 REQUISE : le contrat monetaire est en place, les lecteurs sont d''origine. Jouer 03-appliquer-lecteurs.sql.';
  else
    raise notice 'ETAPES 2 ET 3 REQUISES : contrat monetaire absent, lecteurs d''origine. Jouer 02 puis 03.';
  end if;
end $preflight$;

/*
 * VERDICT LISIBLE.
 *
 * `RAISE NOTICE` n'est pas rendu par tous les outils — l'editeur SQL de
 * Supabase, notamment, n'affiche que le dernier jeu de resultats. Ce SELECT
 * dit la meme chose, en lecture seule, sous une forme que tout le monde voit.
 */
select case
         when (select encode(digest(p.prosrc,'sha256'),'hex') from pg_proc p
               join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='play_game') = '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d'
           then 'DEJA APPLIQUE — ne rien executer'
         when exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='games' and column_name='min_spend_cents')
           then 'ETAPE 3 REQUISE — jouer 03-appliquer-lecteurs.sql'
         else 'ETAPES 2 ET 3 REQUISES — jouer 02 puis 03'
       end as verdict,
       (select left(encode(digest(p.prosrc,'sha256'),'hex'),12) || '...' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='play_game') as play_game,
       (select left(encode(digest(p.prosrc,'sha256'),'hex'),12) || '...' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_win') as register_win,
       (select count(*) from information_schema.columns
        where table_schema='public'
          and ((table_name='games' and column_name='min_spend_cents')
            or (table_name='winners' and column_name='min_spend_cents_snapshot'))) as colonnes_contrat;
