/*
 * ═══════════════════════════════════════════════════════════════════════
 *  EMPREINTES CANONIQUES — une ligne par dimension, un hachage par ligne
 * ═══════════════════════════════════════════════════════════════════════
 *
 * À exécuter tel quel sur la production ET sur la branche. Deux sorties
 * identiques ligne à ligne = états équivalents sur les dimensions couvertes.
 *
 * ─── Pourquoi ce fichier existe ───
 *
 * Ces requêtes vivaient dans mes appels, pas dans le dépôt. Conséquence :
 * leur périmètre n'était vérifiable par personne, et il était faux. Mon
 * empreinte des triggers ne regardait que le schéma `public` ; les cinq
 * triggers de `public` concordaient, j'ai écrit « triggers identiques », et
 * `on_auth_user_created` sur `auth.users` manquait à la baseline. Une base
 * reconstruite sans lui ne crée aucun profil au premier compte.
 *
 * Une mesure dont on ne peut pas relire le périmètre n'est pas une preuve.
 *
 * ─── Le périmètre, énoncé plutôt que supposé ───
 *
 * « Objet du projet » = tout ce qui vit dans le schéma `public`, PLUS tout
 * trigger dont la FONCTION est dans `public`, quel que soit le schéma de sa
 * table. C'est cette seconde moitié qui manquait, et c'est elle qui attrape
 * les triggers posés sur `auth.users` ou `storage.objects`.
 *
 * Les objets de `cron`, `realtime`, `storage`, `vault` appartiennent à la
 * plateforme Supabase, qui les pose et les met à jour elle-même. Les
 * comparer produirait du bruit à chaque mise à jour de Supabase.
 *
 * ─── Normalisation de `prosrc` ───
 *
 * Comparer `prosrc` brut fait diverger deux fonctions strictement
 * équivalentes pour un espace ou un saut de ligne. Les blancs consécutifs
 * sont donc réduits à un seul. Rien d'autre n'est touché : ni la casse, ni la
 * ponctuation — un littéral de chaîne qui change EST une différence.
 */

with
-- ────────────────────────────────────────────────────────── colonnes
colonnes as (
  select 'colonnes' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select c.table_name||'.'||c.column_name||' '||c.data_type
           ||' null='||c.is_nullable
           ||' def='||coalesce(c.column_default,'-') as t
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and tb.table_type = 'BASE TABLE'
  ) s
),
-- ─────────────────────────────────────────────────────── contraintes
contraintes as (
  select 'contraintes' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select con.conrelid::regclass::text||' '||con.conname||' '
           ||pg_get_constraintdef(con.oid) as t
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  ) s
),
-- ───────────────────────────────────────────────────────── fonctions
fonctions as (
  select 'fonctions' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
           ||' sec='||case when p.prosecdef then 'definer' else 'invoker' end
           ||' vol='||p.provolatile::text
           ||' cfg='||coalesce(array_to_string(p.proconfig,','),'-')
           ||' src='||regexp_replace(p.prosrc, '\s+', ' ', 'g') as t
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ) s
),
-- ───────────────────────────────────────────────────────────── index
index_ as (
  select 'index' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select indexdef as t from pg_indexes where schemaname = 'public'
  ) s
),
-- ────────────────────────────────────────────────────────── policies
policies as (
  select 'policies' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select tablename||' '||policyname||' '||cmd||' '||permissive||' '||roles::text
           ||' using='||coalesce(qual,'-')||' check='||coalesce(with_check,'-') as t
    from pg_policies where schemaname = 'public'
  ) s
),
-- ─────────────────────────────────────────────────────────────── rls
rls as (
  select 'rls' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select c.relname||' rls='||c.relrowsecurity::text||' force='||c.relforcerowsecurity::text as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ) s
),
/*
 * ────────────────────────────────────────────────────────── triggers
 * TOUS schémas confondus dès lors que la fonction appelée est dans
 * `public`. C'est la ligne qui manquait.
 */
triggers as (
  select 'triggers' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select pg_get_triggerdef(tg.oid)||' enabled='||tg.tgenabled::text as t
    from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace np on np.oid = p.pronamespace
    where not tg.tgisinternal and np.nspname = 'public'
  ) s
),
-- ────────────────────────────────────────────────────────────── vues
vues as (
  select 'vues' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select c.relname||' owner='||pg_get_userbyid(c.relowner)
           ||' opt='||coalesce(array_to_string(c.reloptions,','),'-')
           ||' def='||regexp_replace(pg_get_viewdef(c.oid, true), '\s+', ' ', 'g') as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  ) s
),
/*
 * ───────────────────────────────────────────────── ACL des relations
 * TOUS les bénéficiaires. La version précédente filtrait sur `anon`,
 * `authenticated` et `service_role` : elle aurait laissé passer une
 * différence sur `postgres`. Même faute de périmètre que pour les triggers.
 */
acl_relations as (
  select 'acl_relations' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select c.relname||' '||coalesce(a.grantee,'-')||'='||coalesce(a.privs,'-') as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join lateral (
      select g.grantee, string_agg(distinct g.privilege_type, ',' order by g.privilege_type) as privs
      from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = c.relname
      group by g.grantee
    ) a on true
    where n.nspname = 'public' and c.relkind in ('r','v')
  ) s
),
-- ───────────────────────────────────────────────── ACL des fonctions
acl_fonctions as (
  select 'acl_fonctions' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '
           ||coalesce(array_to_string(p.proacl::text[], ' '),'DEFAUT') as t
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ) s
),
/*
 * ──────────────────────────────────────────── privilèges par défaut
 *
 * SEULE DIMENSION QUI NE PEUT PAS DEVENIR VERTE, et c'est mesuré, pas subi.
 *
 * La production porte six entrées : trois pour `postgres`, trois pour
 * `supabase_admin`. Une baseline rejouée n'en produit que trois.
 *
 *   · les trois de `supabase_admin` sont hors d'atteinte : `postgres` n'est
 *     pas membre de ce rôle, donc `ALTER DEFAULT PRIVILEGES FOR ROLE
 *     supabase_admin` échouerait. Elles sont par ailleurs INERTES : zéro
 *     relation et zéro fonction de `public` ne lui appartiennent, et les
 *     migrations s'exécutent en tant que `postgres`.
 *   · `postgres` porte en production une entrée explicite pour lui-même
 *     (`postgres=arwdDxtm/postgres`) que le rejeu ne recrée pas. Sans effet :
 *     il est propriétaire des objets et détient tout à ce titre.
 *
 * Preuve que l'écart ne porte à conséquence sur rien : l'ACL EFFECTIF des
 * 20 relations, tous rôles confondus — `postgres` inclus — donne la même
 * empreinte des deux côtés (`e16eae01…`, 78 lignes, le 18/08/2026).
 * Les défauts diffèrent ; ce qu'ils ont produit, non.
 */
defaut as (
  select 'default_privileges' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select pg_get_userbyid(d.defaclrole)||' '||d.defaclobjtype::text||' '
           ||array_to_string(d.defaclacl::text[], ' ') as t
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public'
  ) s
)
select * from colonnes
union all select * from contraintes
union all select * from fonctions
union all select * from index_
union all select * from policies
union all select * from rls
union all select * from triggers
union all select * from vues
union all select * from acl_relations
union all select * from acl_fonctions
union all select * from defaut
order by dimension;
