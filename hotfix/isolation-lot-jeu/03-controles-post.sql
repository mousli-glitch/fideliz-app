/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOTFIX ISOLATION LOT/JEU — CONTRÔLES APRÈS APPLICATION, LECTURE SEULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aucune écriture. Aucune donnée métier, aucun identifiant client. Bornés aux
 * métadonnées techniques et à des comptages agrégés.
 *
 * DÉCISION : si une seule ligne rend `verdict <> 'OK'`, jouer
 * `04-retour-arriere.sql` APRÈS avoir lu sa politique de sécurité — elle
 * réouvre le P0.
 */

select
  case encode(digest(p.prosrc,'sha256'),'hex')
    when '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442' then 'OK : postimage exact'
    else 'ANOMALIE : empreinte inattendue' end                                  as verdict_empreinte,
  left(encode(digest(p.prosrc,'sha256'),'hex'),16) || '...'                     as empreinte,
  length(p.prosrc)                                                             as longueur,
  case when p.prosecdef then 'OK' else 'ANOMALIE' end                           as verdict_security_definer,
  case when coalesce(array_to_string(p.proconfig,','),'') = 'search_path=public'
       then 'OK' else 'ANOMALIE' end                                            as verdict_search_path,
  pg_get_userbyid(p.proowner)                                                  as proprietaire,
  case when has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       then 'ANOMALIE' else 'OK' end                                            as verdict_droits
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'register_win';

/*
 * Preuve que RIEN de métier n'a bougé : ces comptages doivent être identiques
 * à ceux relevés avant l'application. Aucun identifiant, aucun montant, aucune
 * ligne brute — uniquement des totaux.
 */
select (select count(*) from public.games)     as jeux,
       (select count(*) from public.prizes)    as lots,
       (select count(*) from public.winners)   as tickets,
       (select count(*) from public.contacts)  as contacts,
       (select coalesce(sum(quantity),0) from public.prizes where quantity is not null) as somme_des_stocks;
