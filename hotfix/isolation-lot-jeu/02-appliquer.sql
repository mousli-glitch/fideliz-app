/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOTFIX ISOLATION LOT/JEU — APPLICATION, ATOMIQUE ET FAIL-CLOSED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NE PAS EXÉCUTER SANS L'ACCORD EXPLICITE DE SAMY, ET SANS UN PRÉFLIGHT
 *    (`01-preflight-production.sql`) ENTIÈREMENT VERT.
 *
 * ─── POURQUOI UNE TRANSACTION EXPLICITE ───
 *
 * La version précédente enchaînait le bloc `DO`, les `REVOKE`, le `GRANT` et
 * le `NOTIFY` sans transaction englobante. Elle DÉPENDAIT donc du
 * comportement de l'outil qui l'exécute — éditeur SQL, `psql`, `execute_sql`.
 * Une interruption entre le `REVOKE` et le `GRANT` laissait la fonction
 * corrigée mais SANS DROIT D'EXÉCUTION : le parcours joueur cassé, en
 * production, par un correctif de sécurité.
 *
 * Ce fichier ne dépend plus de rien : il ouvre sa propre transaction. Tout
 * échec avant le `commit` restaure l'état précédent, ACL comprises.
 *
 * ─── POURQUOI DES DÉLAIS BORNÉS ───
 *
 * `create or replace function` prend un verrou sur la fonction. Sur une
 * production active, attendre indéfiniment derrière une transaction longue,
 * c'est bloquer le parcours joueur pendant tout ce temps. Le hotfix REFUSE
 * plutôt que d'attendre.
 *
 * ─── POURQUOI UN VERROU CONSULTATIF ───
 *
 * Deux applications concurrentes liraient toutes deux la préimage, et la
 * seconde échouerait à la vérification de postimage — sans dégât, mais avec
 * une erreur incompréhensible. Le verrou consultatif les sérialise
 * proprement : la seconde attend, voit le postimage, et sort en no-op.
 *
 * ─── CE QU'IL NE FAIT PAS ───
 *
 * Aucun `insert`, `update`, `delete` sur une table métier. Aucune donnée :
 * ni jeu, ni lot, ni ticket, ni contact, ni compte. Seul le corps d'une
 * fonction change, plus ses droits — qui sont reposés à l'identique.
 */

begin;

/*
 * Délais bornés. `lock_timeout` : on refuse plutôt que d'attendre derrière
 * une transaction longue. `statement_timeout` : filet de sécurité global.
 * `set local` : ne survit pas à la transaction.
 */
set local lock_timeout = '5s';
set local statement_timeout = '30s';

/*
 * Verrou consultatif transactionnel : sérialise deux applications
 * concurrentes. Relâché automatiquement au commit ou au rollback.
 */
select pg_advisory_xact_lock(hashtext('hotfix:isolation-lot-jeu'));

do $$
declare
  v_src   text;
  v_h     text;
  v_def   text;
  v_new   text;
  v_hnew  text;
  v_sig   text;
  v_secdef boolean;
  v_config text;
  v_owner  text;
  v_vol    "char";
  v_n     int;

  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_preimage  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_postimage constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';

  c_lot_avant   constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_lot_apres   constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_stock_avant constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
  c_stock_apres constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
begin
  select p.prosrc,
         encode(digest(p.prosrc, 'sha256'), 'hex'),
         pg_get_functiondef(p.oid),
         pg_get_function_identity_arguments(p.oid),
         p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), ''),
         pg_get_userbyid(p.proowner),
         p.provolatile
    into v_src, v_h, v_def, v_sig, v_secdef, v_config, v_owner, v_vol
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'register_win'
    and pg_get_function_identity_arguments(p.oid) = c_signature;

  if v_src is null then
    raise exception using errcode = 'P0130',
      message = 'register_win introuvable avec la signature attendue. Ce n''est pas un patch qui échoue, c''est le point de départ qui manque.';
  end if;

  -- ── Attributs exigés AVANT toute décision ──
  if not v_secdef then
    raise exception using errcode = 'P0130', message = 'register_win n''est plus SECURITY DEFINER : correctif refusé.';
  end if;
  if v_config is distinct from 'search_path=public' then
    raise exception using errcode = 'P0130',
      message = format('search_path inattendu (« %s ») : correctif refusé.', v_config);
  end if;
  if v_vol <> 'v' then
    raise exception using errcode = 'P0130', message = 'volatilité inattendue : correctif refusé.';
  end if;

  -- ── Machine d'état : deux empreintes connues, tout le reste refuse ──
  if v_h = c_postimage then
    raise notice 'ISOLATION LOT/JEU : déjà appliqué (empreinte corrigée exacte). Aucune modification.';
    return;
  end if;

  if v_h <> c_preimage then
    raise exception using errcode = 'P0130',
      message = format('Préimage NON AUTORISÉE : empreinte %s (%s octets). Le corps déployé n''est ni la version vulnérable auditée, ni la version corrigée. Correctif refusé — un état inconnu ne se patche pas.',
                       v_h, length(v_src));
  end if;

  -- ── Les deux fragments, chacun présent exactement une fois DANS LE CORPS ──
  v_n := (length(v_src) - length(replace(v_src, c_lot_avant, ''))) / length(c_lot_avant);
  if v_n <> 1 then
    raise exception using errcode = 'P0130',
      message = format('Chargement du lot : %s occurrence(s), 1 exigée.', v_n);
  end if;
  v_n := (length(v_src) - length(replace(v_src, c_stock_avant, ''))) / length(c_stock_avant);
  if v_n <> 1 then
    raise exception using errcode = 'P0130',
      message = format('Décrément de stock : %s occurrence(s), 1 exigée.', v_n);
  end if;

  /*
   * Le DDL exécuté est celui que PostgreSQL a lui-même rendu — guillemets,
   * attributs et `search_path` compris — avec les deux seuls remplacements.
   * On ne réécrit pas l'enveloppe, on n'en touche que l'intérieur.
   */
  v_new := replace(replace(v_def, c_lot_avant, c_lot_apres), c_stock_avant, c_stock_apres);
  execute v_new;

  -- ── Vérification du POSTIMAGE, relu dans le catalogue ──
  select encode(digest(p.prosrc, 'sha256'), 'hex'),
         pg_get_function_identity_arguments(p.oid), p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), ''), pg_get_userbyid(p.proowner)
    into v_hnew, v_sig, v_secdef, v_config, v_owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win'
    and pg_get_function_identity_arguments(p.oid) = c_signature;

  if v_hnew is distinct from c_postimage then
    raise exception using errcode = 'P0130',
      message = format('Postimage inattendu : %s au lieu de %s. La transaction est annulée, la fonction reste inchangée.', v_hnew, c_postimage);
  end if;
  if not v_secdef or v_config is distinct from 'search_path=public' then
    raise exception using errcode = 'P0130',
      message = 'Les attributs ont changé pendant l''application : transaction annulée.';
  end if;

  raise notice 'ISOLATION LOT/JEU : appliqué. Empreinte % -> %.', c_preimage, c_postimage;
end $$;

/*
 * ACL reposée explicitement : `create or replace` la conserve, mais une
 * fonction dont les droits dépendent d'une migration antérieure est une
 * fonction qui les perd le jour où cette antérieure bouge.
 */
revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';

/*
 * VÉRIFICATION FINALE, DANS LA MÊME TRANSACTION.
 *
 * Les droits sont relus APRÈS le `grant` : si `service_role` avait perdu
 * `EXECUTE`, ou si `anon` en avait acquis un, on lève — et le `commit`
 * n'arrive jamais. C'est le scénario que l'absence de transaction rendait
 * possible.
 */
do $$
declare v_n int; v_h text;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';
  if v_n <> 1 then
    raise exception 'HOTFIX : % fonction(s) register_win apres application, 1 attendue.', v_n;
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';
  if v_h <> '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442' then
    raise exception 'HOTFIX : postimage inattendu (%). Transaction annulee.', v_h;
  end if;

  if not has_function_privilege('service_role',
       'public.register_win(uuid,uuid,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'HOTFIX : service_role a PERDU EXECUTE. Transaction annulee — le parcours joueur serait casse.';
  end if;
  if has_function_privilege('anon',
       'public.register_win(uuid,uuid,text,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.register_win(uuid,uuid,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'HOTFIX : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;

  raise notice 'HOTFIX : postimage et droits verifies dans la transaction.';
end $$;

commit;
