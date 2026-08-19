/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  P0 — UN JOUEUR POUVAIT RÉCLAMER LE LOT D'UN AUTRE RESTAURANT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LE DÉFAUT, PROUVÉ SUR CIBLE SYNTHÉTIQUE ───
 *
 * `register_win(p_game_id, p_prize_id, …)` chargeait le lot ainsi :
 *
 *     select * into v_prize from prizes where id = p_prize_id;
 *
 * Sans jamais vérifier que ce lot appartient au jeu passé en paramètre. Le
 * décrément de stock héritait du même défaut.
 *
 * `registerWinnerAction` est l'action publique du parcours joueur — sans
 * garde de rôle, à raison : un client anonyme enregistre son gain. Elle
 * transmet `data.prize_id` VERBATIM depuis le navigateur, à la clé de
 * service. La fonction n'est exécutable ni par `anon` ni par `authenticated`,
 * ce qui ne protège rien : la Server Action est la porte.
 *
 * Mesuré, deux restaurants synthétiques, lot à stock limité chez chacun,
 * appel avec le jeu de A et le lot de B :
 *
 *     appel accepte ............................ true
 *     stock du confrere .................... 3 -> 2
 *     libelle fige sur le ticket ....... « MAGNUM DE CHAMPAGNE (lot de B) »
 *     le ticket appartient au restaurant ....... A
 *
 * ─── POURQUOI UN PATCH DYNAMIQUE, ET PAS UNE DÉFINITION COMPLÈTE ───
 *
 * Signalé, à raison : la version précédente de ce fichier ne vérifiait que
 * l'unicité de deux sous-chaînes. Ça ne prouve RIEN du reste du corps — la
 * même migration pouvait produire des fonctions différentes selon
 * l'environnement.
 *
 * J'ai écarté l'autre option proposée — inscrire ici la définition complète
 * et canonique — et voici pourquoi. Une définition complète ÉCRASE ce qui est
 * déployé. Si la production porte le moindre écart avec ce que j'ai audité,
 * un `create or replace` intégral remplace silencieusement son comportement
 * par le mien, sur une fonction qui porte le rejeu, les quotas, les stocks,
 * les contacts et les séquences d'action. Le mode d'échec d'un patch borné,
 * lui, est un REFUS.
 *
 * Sur une fonction de ce calibre, en production, je préfère un correctif qui
 * refuse de s'appliquer à un correctif qui écrase.
 *
 * Le patch est donc conservé, mais BORNÉ PAR L'EMPREINTE DU CORPS ENTIER :
 *
 *   PRÉIMAGE  sha256(prosrc) = 374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3
 *             3552 caractères — mesurée sur la production le 19/08/2026
 *   POSTIMAGE sha256(prosrc) = 32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442
 *             3600 caractères — calculée en LECTURE SEULE, sans aucune mutation
 *
 * `length` compte des CARACTÈRES, pas des octets : le corps est multioctet
 * (3600 caractères pour 3604 octets sur le corrigé). L'autorité sur l'identité
 * reste le SHA-256, jamais la longueur.
 *
 * L'empreinte porte sur `prosrc` — le corps tel que stocké — et non sur
 * `pg_get_functiondef`, dont le formatage peut varier d'une version de
 * serveur à l'autre. Elle est donc stable et vérifiable partout.
 *
 * ─── MACHINE D'ÉTAT : DEUX ÉTATS CONNUS, TOUT LE RESTE REFUSE ───
 *
 *     empreinte = PRÉIMAGE   -> vulnérable exact  -> on applique
 *     empreinte = POSTIMAGE  -> corrigé exact     -> no-op strict
 *     toute autre empreinte  -> inconnu           -> REFUS, sans modification
 *
 * Un état partiel, mixte ou dupliqué n'a par construction ni l'une ni l'autre
 * empreinte : il tombe dans « inconnu » et se fait refuser. C'est ce que le
 * comptage de fragments ne savait pas faire.
 *
 * Les attributs sont vérifiés séparément, avant ET après : signature,
 * `SECURITY DEFINER`, `search_path`, volatilité, propriétaire. Le corps n'est
 * pas la fonction.
 *
 * ─── ⚠️ APRÈS MISE EN PRODUCTION, NE PAS ROLLBACK À L'AVEUGLE ───
 *
 * Le rollback restaure exactement la préimage — donc RÉOUVRE LE P0, exposant
 * de nouveau les clients. Une fois ce correctif en service, la bonne réponse
 * à un problème est une correction FORWARD, ou la neutralisation temporaire
 * du parcours d'enregistrement, pas un retour en arrière.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer et prouver, puis ATTENDRE son accord
 * avant toute application réelle.
 *
 * MIGRATION ADDITIVE au sens des données : aucune table, aucune colonne,
 * aucune ligne touchée. Seul le corps d'une fonction change.
 */

do $$
declare
  v_n      int;
  v_oid    oid;
  v_src    text;
  v_h      text;
  v_def    text;
  v_new    text;
  v_manif  text;
  v_manif2 text;

  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_preimage  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_postimage constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_owner     constant text := 'postgres';
  c_acl       constant text := 'postgres=X/postgres service_role=X/postgres';

  c_lot_avant   constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_lot_apres   constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_stock_avant constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
  c_stock_apres constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
begin
  /*
   * ─── PRÉCONDITIONS COMPLÈTES, DANS LA TRANSACTION ───
   *
   * Le préflight reste obligatoire, mais ce script NE LUI FAIT PAS CONFIANCE
   * pour ses préconditions de sécurité. Entre les deux, quelques secondes
   * suffisent à ce qu'un changement privilégié de propriétaire ou une
   * permission supplémentaire apparaisse. Sans contrôle ici, le `revoke`/
   * `grant` la NORMALISERAIT en silence — et le contrôle post ne la verrait
   * qu'une fois la transaction validée, donc trop tard.
   *
   * Le manifeste est donc relu ICI, entier, avant la moindre mutation.
   */
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_n = 0 then
    raise exception using errcode = 'P0130',
      message = 'register_win absente : ce n''est pas un patch qui échoue, c''est la cible qui manque.';
  end if;
  if v_n > 1 then
    raise exception using errcode = 'P0130',
      message = format('%s fonctions public.register_win (surcharges) : on ne saurait pas laquelle patcher.', v_n);
  end if;

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

  -- Le manifeste attendu, en un seul morceau : tout écart lève.
  if v_manif is distinct from
     c_signature || ' | owner=' || c_owner || ' | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode = 'P0130',
      message = 'Manifeste NON CONFORME avant mutation.' || chr(10)
             || '    observé : ' || v_manif || chr(10)
             || '    attendu : ' || c_signature || ' | owner=' || c_owner
             || ' | secdef=true | config=search_path=public | vol=v | acl=' || c_acl;
  end if;

  -- Droits effectifs : positif ET négatifs, en plus du manifeste.
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0130', message = 'service_role n''a pas EXECUTE : le parcours joueur est déjà cassé.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0130', message = 'anon ou authenticated peut exécuter register_win.';
  end if;

  -- ── Machine d'état : deux empreintes connues, tout le reste refuse ──
  if v_h = c_postimage then
    raise notice 'ISOLATION LOT/JEU : déjà appliqué (empreinte corrigée exacte). Aucune modification.';
    return;
  end if;
  if v_h <> c_preimage then
    raise exception using errcode = 'P0130',
      message = format('Préimage NON AUTORISÉE : empreinte %s (%s caractères). Le corps déployé n''est ni la version vulnérable auditée, ni la version corrigée. Correctif refusé — un état inconnu ne se patche pas.',
                       v_h, length(v_src));
  end if;

  -- ── Les deux fragments, chacun exactement une fois DANS LE CORPS ──
  v_n := (length(v_src) - length(replace(v_src, c_lot_avant, ''))) / length(c_lot_avant);
  if v_n <> 1 then
    raise exception using errcode = 'P0130', message = format('Chargement du lot : %s occurrence(s), 1 exigée.', v_n);
  end if;
  v_n := (length(v_src) - length(replace(v_src, c_stock_avant, ''))) / length(c_stock_avant);
  if v_n <> 1 then
    raise exception using errcode = 'P0130', message = format('Décrément de stock : %s occurrence(s), 1 exigée.', v_n);
  end if;

  /*
   * Le DDL exécuté est celui que PostgreSQL a lui-même rendu — guillemets,
   * attributs et `search_path` compris — avec les deux seuls remplacements.
   */
  v_new := replace(replace(v_def, c_lot_avant, c_lot_apres), c_stock_avant, c_stock_apres);
  execute v_new;

  -- ── Postimage : le corps ET le manifeste, relus dans le catalogue ──
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

  if v_h is distinct from c_postimage then
    raise exception using errcode = 'P0130',
      message = format('Postimage inattendu : %s au lieu de %s. Transaction annulée.', v_h, c_postimage);
  end if;
  if v_manif2 is distinct from v_manif then
    raise exception using errcode = 'P0130',
      message = 'Le manifeste a changé pendant le remplacement.' || chr(10)
             || '    avant : ' || v_manif || chr(10)
             || '    après : ' || v_manif2;
  end if;

  raise notice 'ISOLATION LOT/JEU : appliqué. Empreinte % -> %, manifeste inchangé.', c_preimage, c_postimage;
end $$;

/*
 * ACL reposée explicitement : `create or replace` la conserve, mais une
 * fonction dont les droits dépendent d'une migration antérieure est une
 * fonction qui les perd le jour où cette antérieure bouge.
 */
revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
