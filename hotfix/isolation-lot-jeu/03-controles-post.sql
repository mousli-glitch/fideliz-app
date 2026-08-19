/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOTFIX ISOLATION LOT/JEU — CONTRÔLES APRÈS APPLICATION, FAIL-CLOSED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUCUNE écriture. Uniquement des métadonnées techniques. Aucune donnée
 * métier, aucun identifiant client, aucune donnée personnelle.
 *
 * Lève au premier écart, pour les mêmes raisons que le préflight : zéro ligne
 * rendue par un `SELECT` ne contient aucun verdict rouge et se lit comme un
 * succès.
 *
 * ─── EN CAS D'ANOMALIE : NE PAS JOUER LE ROLLBACK PAR RÉFLEXE ───
 *
 * La version précédente de ce fichier renvoyait vers `04-retour-arriere.sql`.
 * C'était contradictoire avec la politique du README : ce rollback RÉOUVRE
 * le P0 et réexpose les clients.
 *
 * La marche à suivre en cas d'anomalie est, dans cet ordre :
 *
 *   1. ARRÊT IMMÉDIAT — ne rien relancer, ne rien « réessayer ».
 *   2. CONSERVER LES PREUVES — la sortie de ce script, l'empreinte observée,
 *      l'heure. Ne rien nettoyer.
 *   3. NEUTRALISER LE PARCOURS si l'anomalie casse l'enregistrement des gains
 *      (le mettre hors service est moins grave que de le laisser incohérent).
 *   4. CORRECTION FORWARD en priorité : un correctif qui avance.
 *   5. ROLLBACK EN DERNIER RECOURS, et UNIQUEMENT sur décision explicite de
 *      Samy, après avoir établi que l'incident est causé par CE correctif —
 *      pas par autre chose qui se serait produit au même moment.
 */

do $$
declare
  v_n int; v_oid oid; v_h text; v_secdef boolean; v_config text;
  v_vol "char"; v_owner text; v_acl text; v_src text;

  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_postimage constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_acl_attendue constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_n = 0 then
    raise exception 'CONTROLE ARRET : plus aucune fonction public.register_win. ARRET IMMEDIAT.';
  end if;
  if v_n > 1 then
    raise exception 'CONTROLE ARRET : % fonctions public.register_win (surcharge creee ?). ARRET IMMEDIAT.', v_n;
  end if;

  select p.oid, p.prosrc, encode(digest(p.prosrc,'sha256'),'hex'), p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),''), p.provolatile,
         pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proacl::text[],' '),'(defaut)')
    into v_oid, v_src, v_h, v_secdef, v_config, v_vol, v_owner, v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if pg_get_function_identity_arguments(v_oid) is distinct from c_signature then
    raise exception 'CONTROLE ARRET : signature alteree (« % »).', pg_get_function_identity_arguments(v_oid);
  end if;
  if v_h is distinct from c_postimage then
    raise exception 'CONTROLE ARRET : empreinte % au lieu du postimage attendu %.', v_h, c_postimage;
  end if;
  if not v_secdef then
    raise exception 'CONTROLE ARRET : SECURITY DEFINER perdu.';
  end if;
  if v_config is distinct from 'search_path=public' then
    raise exception 'CONTROLE ARRET : search_path altere (« % »).', v_config;
  end if;
  if v_vol <> 'v' then
    raise exception 'CONTROLE ARRET : volatilite alteree (%).', v_vol;
  end if;
  if v_owner is distinct from 'postgres' then
    raise exception 'CONTROLE ARRET : proprietaire altere (%).', v_owner;
  end if;

  -- Droit POSITIF : sans lui, le parcours joueur est casse.
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'CONTROLE ARRET : service_role a PERDU EXECUTE — le parcours joueur est casse. Neutraliser puis corriger en avant.';
  end if;
  -- Droits NEGATIFS.
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'CONTROLE ARRET : anon ou authenticated a acquis EXECUTE.';
  end if;
  if v_acl is distinct from c_acl_attendue then
    raise exception 'CONTROLE ARRET : ACL « % » au lieu de « % ».', v_acl, c_acl_attendue;
  end if;

  raise notice 'CONTROLE OK : postimage exact (%, % caracteres), signature, attributs, proprietaire et ACL conformes.', v_h, length(v_src);
end $$;

/*
 * ─── OBSERVATION NON CONCLUANTE, VOLONTAIREMENT NON BLOQUANTE ───
 *
 * Ces totaux ne prouvent RIEN sur une production active : de vrais joueurs et
 * de vrais restaurateurs les font varier légitimement entre deux lectures. Un
 * écart ne signale pas le hotfix, et une absence d'écart ne l'innocente pas —
 * deux variations opposées se compensent.
 *
 * La preuve que ce hotfix ne touche aucune donnée est ailleurs, et elle est
 * plus solide : le script ne contient aucun DML sur une table métier (lisible
 * dans `02-appliquer.sql`), il s'exécute dans une transaction bornée, il ne
 * vérifie que des métadonnées de fonction, et son comportement est prouvé sur
 * cible synthétique.
 *
 * Ces chiffres sont donc là pour l'œil de l'opérateur, pas comme critère.
 */
select (select count(*) from public.games)   as jeux,
       (select count(*) from public.prizes)  as lots,
       (select count(*) from public.winners) as tickets,
       'observation non concluante — ne pas en faire un critere' as portee;
