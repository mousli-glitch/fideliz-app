/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — isolation lot/jeu dans register_win
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── ⚠️ AVERTISSEMENT, À LIRE AVANT D'EXÉCUTER ───
 *
 * Ce rollback RÉOUVRE LE P0. Un joueur anonyme pourra de nouveau poster son
 * jeu avec le lot d'un CONFRÈRE : stock de l'autre restaurant décrémenté,
 * ticket émis chez l'attaquant portant le libellé d'une enseigne qui ne l'a
 * jamais offert.
 *
 * Une fois le correctif en service, ce fichier N'EST PAS la bonne réponse à
 * un incident. La bonne réponse est une correction FORWARD, ou la
 * neutralisation temporaire du parcours d'enregistrement. Un rollback aveugle
 * réexpose les clients pour régler un problème qui n'est probablement pas
 * celui-là.
 *
 * Il existe pour la complétude et la réversibilité de la chaîne, et pour être
 * joué sur cible SYNTHÉTIQUE. Sur une base en service, il demande une
 * décision explicite.
 *
 * ─── MACHINE D'ÉTAT, SYMÉTRIQUE DE LA MIGRATION ───
 *
 *     empreinte = POSTIMAGE  -> corrigé exact    -> on restaure
 *     empreinte = PRÉIMAGE   -> déjà vulnérable  -> no-op strict
 *     toute autre empreinte  -> inconnu          -> REFUS, sans modification
 *
 * La version précédente ne vérifiait que l'occurrence du prédicat de
 * CHARGEMENT, jamais celle du décrément : un état partiellement corrigé
 * pouvait être transformé au lieu d'être rejeté. Signalé, et c'était exact.
 * L'empreinte du corps ENTIER supprime la classe entière de ce défaut : un
 * état partiel n'a ni l'une ni l'autre empreinte.
 *
 * Le rollback restaure donc la PRÉIMAGE EXACTE — vérifiée par empreinte après
 * exécution — pas « deux lignes ressemblantes ».
 *
 * ─── TRANSACTION EXPLICITE ───
 *
 * Le fichier ouvre la sienne : il ne dépend pas de l'outil qui l'exécute.
 * Tout échec avant le `commit` restaure l'état précédent, ACL comprises —
 * sans quoi une interruption entre le `revoke` et le `grant` laisserait la
 * fonction sans droit d'exécution.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtext('hotfix:isolation-lot-jeu'));

do $$
declare
  v_n int; v_oid oid; v_src text; v_h text; v_def text; v_new text;
  v_manif text; v_manif2 text;
  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_preimage  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_postimage constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_owner constant text := 'postgres';
  c_acl   constant text := 'postgres=X/postgres service_role=X/postgres';
  c_lot_apres   constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_lot_avant   constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_stock_apres constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
  c_stock_avant constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
begin
  /*
   * Mêmes préconditions que l'application, et pour la même raison : ce script
   * ne fait confiance à aucun contrôle qui l'aurait précédé. Le manifeste
   * entier — signature, propriétaire, ACL, attributs — est relu avant toute
   * mutation, et confronté à nouveau avant le commit.
   */
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';
  if v_n = 0 then raise exception 'ROLLBACK REFUSÉ : register_win absente.'; end if;
  if v_n > 1 then raise exception 'ROLLBACK REFUSÉ : % surcharges de register_win.', v_n; end if;

  select p.oid, p.prosrc, encode(digest(p.prosrc,'sha256'),'hex'), pg_get_functiondef(p.oid),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_src, v_h, v_def, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_manif is distinct from
     c_signature || ' | owner=' || c_owner || ' | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    /*
     * Message construit par CONCATÉNATION, pas par les paramètres de RAISE.
     * Un double signe pourcent n'est pas un paramètre : c'est un pourcent
     * littéral. La version
     * précédente fournissait donc trois arguments pour deux emplacements, et
     * PostgreSQL refusait le bloc À LA COMPILATION (42601) — le rollback ne
     * démarrait même pas.
     */
    raise exception 'ROLLBACK REFUSÉ : manifeste non conforme.%',
      chr(10) || '    observé : ' || v_manif || chr(10)
      || '    attendu : ' || c_signature || ' | owner=' || c_owner
      || ' | secdef=true | config=search_path=public | vol=v | acl=' || c_acl;
  end if;

  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'ROLLBACK REFUSÉ : service_role n''a pas EXECUTE.'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'ROLLBACK REFUSÉ : anon ou authenticated peut exécuter register_win.'; end if;

  if v_h = c_preimage then
    raise notice 'ROLLBACK : déjà à la préimage — rien à annuler.';
    return;
  end if;
  if v_h <> c_postimage then
    raise exception 'ROLLBACK REFUSÉ : empreinte % — ni le corrigé exact, ni la préimage. Un état inconnu ne se dépatche pas.', v_h;
  end if;

  v_n := (length(v_src) - length(replace(v_src, c_lot_apres, ''))) / length(c_lot_apres);
  if v_n <> 1 then raise exception 'ROLLBACK REFUSÉ : chargement, % occurrence(s) du prédicat corrigé, 1 exigée.', v_n; end if;
  v_n := (length(v_src) - length(replace(v_src, c_stock_apres, ''))) / length(c_stock_apres);
  if v_n <> 1 then raise exception 'ROLLBACK REFUSÉ : décrément, % occurrence(s) du prédicat corrigé, 1 exigée.', v_n; end if;

  v_new := replace(replace(v_def, c_lot_apres, c_lot_avant), c_stock_apres, c_stock_avant);
  execute v_new;

  select encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_h, v_manif2
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_h is distinct from c_preimage then
    raise exception 'ROLLBACK REFUSÉ : préimage restaurée incorrecte (% au lieu de %). Transaction annulée.', v_h, c_preimage;
  end if;
  if v_manif2 is distinct from v_manif then
    raise exception 'ROLLBACK REFUSÉ : le manifeste a changé pendant la restauration.%',
      chr(10) || '    avant : ' || v_manif || chr(10) || '    après : ' || v_manif2;
  end if;

  raise notice 'ROLLBACK : préimage exacte restaurée, manifeste inchangé. LE P0 EST DE NOUVEAU OUVERT.';
end $$;

revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

do $$
declare v_manif text; v_oid oid;
  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_owner constant text := 'postgres';
  c_acl   constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  select p.oid,
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_manif is distinct from
     c_signature || ' | owner=' || c_owner || ' | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception 'ROLLBACK : manifeste non conforme apres les droits (%). Transaction annulee.', v_manif;
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'ROLLBACK : service_role a perdu EXECUTE. Transaction annulee.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'ROLLBACK : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
