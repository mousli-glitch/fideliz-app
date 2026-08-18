/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LES QUATRE TABLES DE SAUVEGARDE RESTENT FERMÉES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Elles portent 133 lignes de données personnelles réelles en production —
 * 16 comptes fantômes, 1 orphelin, 52 contacts, 64 tickets — vestiges d'un
 * nettoyage du 06/06/2026.
 *
 * Leur protection ne vient PAS d'une absence de droits : `anon` et
 * `authenticated` détiennent bien SELECT, INSERT, UPDATE et DELETE dessus,
 * hérités des privilèges par défaut. Elle vient de la RLS activée SANS
 * AUCUNE POLICY — configuration qui refuse tout par défaut.
 *
 * Deux façons de la défaire sans s'en apercevoir : désactiver la RLS, ou
 * ajouter une policy permissive. Cette sonde surveille les deux.
 *
 * À exécuter sur la production comme sur la branche. Elle ne lit que des
 * catalogues : aucune donnée personnelle n'en sort.
 */
select c.relname as table_de_sauvegarde,
       c.relrowsecurity as rls_activee,
       (select count(*) from pg_policies p
         where p.schemaname = 'coalesce_public' or (p.schemaname='public' and p.tablename=c.relname)) as policies,
       case
         when not c.relrowsecurity then 'ANOMALIE — RLS désactivée, les grants DML deviennent effectifs'
         when (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) > 0
           then 'ANOMALIE — une policy est apparue'
         else 'fermée'
       end as verdict
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like '%backup%'
order by 1;
