/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOTFIX ISOLATION LOT/JEU — PRÉFLIGHT, LECTURE SEULE ET FAIL-CLOSED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUCUNE écriture : ni `insert`, `update`, `delete`, `alter`, `create`,
 * `grant`. Uniquement des métadonnées techniques — empreintes, attributs,
 * droits. Aucune donnée métier, aucun identifiant client, aucune adresse,
 * aucun corps de fonction n'en sort.
 *
 * ─── POURQUOI IL LÈVE AU LIEU D'AFFICHER ───
 *
 * La version précédente était un simple `SELECT`. Deux trous :
 *
 *   — FONCTION ABSENTE : zéro ligne rendue. Zéro ligne ne contient aucun
 *     verdict rouge, et un opérateur pressé y lit « rien à signaler ». Un
 *     préflight qui se tait quand la cible manque est pire qu'absent.
 *
 *   — SURCHARGES : plusieurs lignes rendues, une verte et une rouge, sans que
 *     rien ne dise laquelle sera patchée.
 *
 * Ce fichier LÈVE au premier écart. Il n'y a rien à interpréter : soit il
 * passe, soit il s'arrête.
 *
 * ─── SUR LES TAILLES ───
 *
 * Les longueurs sont exprimées en CARACTÈRES (`length`), pas en octets : le
 * corps contient du multioctet (mesuré : 3600 caractères pour 3604 octets sur
 * le corrigé). L'autorité sur l'identité du corps reste le SHA-256.
 *
 * ISSUES POSSIBLES :
 *   « PREFLIGHT OK »        -> on peut jouer 02-appliquer.sql
 *   « DEJA APPLIQUE »       -> ne rien faire, le correctif est en place
 *   toute exception         -> ARRÊT. Ne pas continuer.
 */

do $$
declare
  v_n       int;
  v_oid     oid;
  v_src     text;
  v_h       text;
  v_secdef  boolean;
  v_config  text;
  v_vol     "char";
  v_owner   text;
  v_acl     text;
  v_frag    int;

  c_signature constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_preimage  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_postimage constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_acl_attendue constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  -- 1. UNE fonction de ce nom, exactement. Zéro ou plusieurs : arrêt.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_n = 0 then
    raise exception 'PREFLIGHT ARRET : aucune fonction public.register_win. La cible du hotfix n''existe pas — ne rien appliquer.';
  end if;
  if v_n > 1 then
    raise exception 'PREFLIGHT ARRET : % fonctions public.register_win (surcharges). Le hotfix ne saurait pas laquelle patcher.', v_n;
  end if;

  select p.oid, p.prosrc, encode(digest(p.prosrc,'sha256'),'hex'), p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),''), p.provolatile,
         pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proacl::text[],' '),'(defaut)')
    into v_oid, v_src, v_h, v_secdef, v_config, v_vol, v_owner, v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  -- 2. Signature exacte.
  if pg_get_function_identity_arguments(v_oid) is distinct from c_signature then
    raise exception 'PREFLIGHT ARRET : signature inattendue (« % »).', pg_get_function_identity_arguments(v_oid);
  end if;

  -- 3. Attributs. Le corps n'est pas la fonction.
  if not v_secdef then
    raise exception 'PREFLIGHT ARRET : register_win n''est plus SECURITY DEFINER.';
  end if;
  if v_config is distinct from 'search_path=public' then
    raise exception 'PREFLIGHT ARRET : search_path inattendu (« % »).', v_config;
  end if;
  if v_vol <> 'v' then
    raise exception 'PREFLIGHT ARRET : volatilite inattendue (%).', v_vol;
  end if;
  if v_owner is distinct from 'postgres' then
    raise exception 'PREFLIGHT ARRET : proprietaire inattendu (%).', v_owner;
  end if;

  -- 4. Droits : positifs ET négatifs.
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'PREFLIGHT ARRET : service_role n''a pas EXECUTE — le parcours joueur est deja casse.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'PREFLIGHT ARRET : anon peut executer register_win.';
  end if;
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'PREFLIGHT ARRET : authenticated peut executer register_win.';
  end if;
  -- Manifeste ACL canonique : c'est lui qui autorise à dire « ACL identiques ».
  if v_acl is distinct from c_acl_attendue then
    raise exception 'PREFLIGHT ARRET : ACL inattendue (« % »), attendue « % ».', v_acl, c_acl_attendue;
  end if;

  -- 5. L'état du corps.
  if v_h = c_postimage then
    raise notice 'DEJA APPLIQUE : empreinte corrigee exacte (%). NE RIEN EXECUTER.', c_postimage;
    return;
  end if;
  if v_h is distinct from c_preimage then
    raise exception 'PREFLIGHT ARRET : corps inconnu (empreinte %, % caracteres). Ni la preimage auditee, ni le corrige. NE PAS PATCHER.', v_h, length(v_src);
  end if;

  -- 6. Les deux fragments, chacun exactement une fois.
  v_frag := (length(v_src) - length(replace(v_src, 'select * into v_prize from prizes where id = p_prize_id;', '')))
            / length('select * into v_prize from prizes where id = p_prize_id;');
  if v_frag <> 1 then
    raise exception 'PREFLIGHT ARRET : fragment de chargement present % fois, 1 exigee.', v_frag;
  end if;
  v_frag := (length(v_src) - length(replace(v_src, 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;', '')))
            / length('update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;');
  if v_frag <> 1 then
    raise exception 'PREFLIGHT ARRET : fragment de decrement present % fois, 1 exigee.', v_frag;
  end if;

  raise notice 'PREFLIGHT OK : preimage vulnerable confirmee (%, % caracteres), signature, attributs, proprietaire et ACL conformes. 02-appliquer.sql peut etre joue.', v_h, length(v_src);
end $$;
