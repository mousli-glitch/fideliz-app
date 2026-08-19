/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOTFIX ISOLATION LOT/JEU — PRÉFLIGHT, STRICTEMENT EN LECTURE SEULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier ne contient AUCUNE écriture. Aucun `insert`, `update`, `delete`,
 * `alter`, `create` ni `grant`. Il ne lit que des métadonnées techniques :
 * empreintes, attributs, droits. Aucune donnée métier, aucun identifiant
 * client, aucune adresse, aucun corps de fonction n'en sort.
 *
 * À jouer EN PREMIER, et à relire avant d'autoriser quoi que ce soit.
 *
 * DÉCISION : si une seule ligne rend `verdict <> 'OK'`, ARRÊT IMMÉDIAT. Ne
 * pas jouer `02-appliquer.sql`.
 */

select
  -- 1. La fonction existe-t-elle avec la signature exacte auditée ?
  case when pg_get_function_identity_arguments(p.oid)
            = 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean'
       then 'OK' else 'ARRET : signature inattendue' end                       as verdict_signature,

  -- 2. L'état du corps : vulnérable attendu, corrigé = déjà fait, sinon ARRÊT.
  case encode(digest(p.prosrc,'sha256'),'hex')
    when '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3' then 'OK : preimage vulnerable attendue'
    when '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442' then 'DEJA APPLIQUE : ne rien faire'
    else 'ARRET : corps inconnu, ne pas patcher' end                           as verdict_empreinte,

  left(encode(digest(p.prosrc,'sha256'),'hex'), 16) || '...'                    as empreinte_observee,
  length(p.prosrc)                                                             as longueur_corps,

  -- 3. Attributs : le corps n'est pas la fonction.
  case when p.prosecdef then 'OK' else 'ARRET : plus SECURITY DEFINER' end      as verdict_security_definer,
  case when coalesce(array_to_string(p.proconfig,','),'') = 'search_path=public'
       then 'OK' else 'ARRET : search_path inattendu' end                       as verdict_search_path,
  case when p.provolatile = 'v' then 'OK' else 'ARRET : volatilite inattendue' end as verdict_volatilite,
  pg_get_userbyid(p.proowner)                                                  as proprietaire,

  -- 4. Droits effectifs : personne d'autre que service_role ne doit exécuter.
  case when has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       then 'ARRET : anon ou authenticated peut executer'
       when not has_function_privilege('service_role', p.oid, 'EXECUTE')
       then 'ARRET : service_role ne peut plus executer'
       else 'OK' end                                                           as verdict_droits,

  -- 5. Les deux fragments, chacun présent exactement une fois.
  case when (length(p.prosrc) - length(replace(p.prosrc,
              'select * into v_prize from prizes where id = p_prize_id;','')))
            / length('select * into v_prize from prizes where id = p_prize_id;') = 1
       then 'OK' else 'ARRET : fragment de chargement non unique' end           as verdict_fragment_chargement,
  case when (length(p.prosrc) - length(replace(p.prosrc,
              'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;','')))
            / length('update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;') = 1
       then 'OK' else 'ARRET : fragment de decrement non unique' end            as verdict_fragment_decrement

from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'register_win';
