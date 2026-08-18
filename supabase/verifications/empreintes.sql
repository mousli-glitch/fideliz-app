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
 * ─── `prosrc` : empreinte EXACTE, pas normalisée (corrigé le 18/08/2026 soir) ───
 *
 * Cette section affirmait que réduire les blancs consécutifs à un seul ne
 * touchait « ni la casse, ni la ponctuation — un littéral de chaîne qui
 * change EST une différence ». C'est faux : la normalisation par
 * `regexp_replace('\s+',' ')` s'applique aussi À L'INTÉRIEUR des littéraux
 * SQL, et peut donc rendre identiques deux corps dont un littéral de chaîne
 * diffère par ses espaces. Trouvé par audit indépendant, vérifié contre le
 * code réel.
 *
 * La dimension `fonctions` ci-dessous compare désormais `prosrc` BRUT, sans
 * normalisation : deux fonctions strictement identiques dans leur
 * comportement mais reformatées (indentation, retours à la ligne) DIVERGENT
 * ici — c'est voulu, c'est un déclencheur d'investigation volontairement
 * paranoïaque. Le verdict fin (cosmétique ou fonctionnel) se lit dans
 * `manifeste_fonctions`, plus bas, qui publie l'identité complète de chacune
 * des fonctions plutôt qu'un hachage agrégé.
 *
 * Une empreinte normalisée peut rester une AIDE de triage rapide (« c'est
 * peut-être juste des espaces ») mais n'est plus jamais présentée comme une
 * preuve d'équivalence : elle apparaît, étiquetée comme telle, dans le
 * manifeste — jamais dans les dimensions agrégées ci-dessus.
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
           ||' src_md5='||md5(p.prosrc) as t
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
 * Corrigé le 18/08/2026 soir : la version précédente faisait un INNER JOIN
 * sur `pg_namespace`, qui exclut silencieusement les entrées GLOBALES
 * (`defaclnamespace = 0`) — exactement le même angle mort que celui trouvé
 * dans la sentinelle. LEFT JOIN désormais, entrées globales incluses.
 *
 * Sur ce qui reste hors d'atteinte : `postgres` (le rôle qui exécute les
 * migrations) n'est pas membre de `supabase_admin`, donc
 * `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` échouerait — un rejeu
 * ne peut matériellement pas reproduire son entrée. Cette entrée est
 * INACTIVE dans le chemin que ce projet contrôle (0 relation de `public` ne
 * lui appartient aujourd'hui, mesuré) mais PAS neutralisée structurellement
 * — `supabase_admin` est superutilisateur et garde la capacité de créer
 * dans `public`. Voir `docs/preuve-sentinelle-et-fonctions.md` §5-6 et le
 * dossier fournisseur en préparation. Ne pas relire cette ligne comme
 * « inerte » sans réserve : c'est une capacité dormante, pas une
 * impossibilité.
 */
defaut as (
  select 'default_privileges' as dimension, count(*) as objets,
         md5(string_agg(t, E'\n' order by t)) as empreinte
  from (
    select pg_get_userbyid(d.defaclrole)||' '||coalesce(n.nspname,'(global)')||' '
           ||d.defaclobjtype::text||' '||array_to_string(d.defaclacl::text[], ' ') as t
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public' or d.defaclnamespace = 0
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

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  MANIFESTE — une ligne par fonction, l'identité complète, pas un hachage
 * ═══════════════════════════════════════════════════════════════════════
 *
 * À exécuter séparément (deuxième requête du fichier), sur chaque base à
 * comparer. C'est ICI que se lit le verdict individuel d'une fonction
 * signalée par la dimension `fonctions` ci-dessus — jamais en devinant
 * depuis un hachage agrégé.
 *
 * `empreinte_exacte` = `md5(prosrc)` du corps BRUT : la preuve. Deux valeurs
 * identiques garantissent des corps caractère pour caractère identiques.
 *
 * `empreinte_normalisee_aide_seulement` = `md5` du corps après réduction des
 * blancs consécutifs. NE PROUVE RIEN par elle-même — un littéral de chaîne
 * différent par ses espaces internes donnerait la même valeur des deux
 * côtés. Sert uniquement à orienter une lecture manuelle rapide quand
 * `empreinte_exacte` diffère : si la normalisée concorde aussi, c'est un
 * signal (pas une preuve) que l'écart est probablement de présentation —
 * à confirmer par lecture brute des deux corps, toujours.
 */
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  l.lanname as langage,
  pg_get_function_result(p.oid) as type_retour,
  p.provolatile as volatilite,
  p.proisstrict as strict,
  p.proparallel as parallelisme,
  case when p.prosecdef then 'definer' else 'invoker' end as securite,
  coalesce(array_to_string(p.proconfig, ','), '-') as proconfig,
  pg_get_userbyid(p.proowner) as proprietaire,
  coalesce(array_to_string(p.proacl::text[], ' '), 'DEFAUT') as acl,
  length(p.prosrc) as longueur_corps,
  md5(p.prosrc) as empreinte_exacte,
  md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) as empreinte_normalisee_aide_seulement
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
order by p.proname, arguments;
