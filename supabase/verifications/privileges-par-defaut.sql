/*
 * Diagnostic des privilèges par défaut — À EXÉCUTER, PAS À INSTALLER.
 *
 * La migration d'origine créait une fonction `SECURITY DEFINER` pour rendre
 * ce service. Elle a été écartée du candidat : je ne l'ai appelée aucune fois
 * pendant toutes les mesures de ce chantier — j'ai écrit ces requêtes à
 * chaque fois. Une fonction `SECURITY DEFINER` est le construit le plus
 * privilégié de Postgres ; en installer une pour un service qu'on rend déjà
 * sans elle, c'est ajouter une surface à surveiller sans contrepartie.
 *
 * Même raisonnement que pour les helpers de gardes sortis du manifeste des
 * Server Actions : une surface sans raison d'exister est une surface qu'on
 * n'a pas à surveiller.
 */

-- ═══ 1. Empreinte des privilèges par défaut du rôle créateur ═══
-- Historique attendu : 06ee5db53926d16ea6bef8649a829254 (12 lignes)
-- Durci      attendu : 2d2e463f3246d8292045a4de8afe2e30 (8 lignes)
with lignes as (
  select coalesce(n.nspname,'(GLOBAL)') as sch, d.defaclobjtype::text as typ,
         coalesce(pg_get_userbyid(a.grantee),'PUBLIC') as ben,
         string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as priv
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where pg_get_userbyid(d.defaclrole) = 'postgres'
    and coalesce(n.nspname,'(GLOBAL)') in ('(GLOBAL)','public','extensions')
  group by 1,2,3)
select md5(string_agg(sch||'|'||typ||'|'||ben||'|'||priv, E'\n' order by sch,typ,ben)) as empreinte,
       count(*) as lignes_acl
from lignes;

-- ═══ 2. Le détail, pour comparer objet par objet ═══
-- Compter ne suffit pas : deux états peuvent avoir le même nombre de lignes
-- et des privilèges différents.
select coalesce(n.nspname,'(GLOBAL)') as schema,
       case d.defaclobjtype when 'r' then 'table' when 'S' then 'sequence'
            when 'f' then 'fonction' end as type,
       coalesce(pg_get_userbyid(a.grantee),'PUBLIC') as beneficiaire,
       string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where pg_get_userbyid(d.defaclrole) = 'postgres'
  and coalesce(n.nspname,'(GLOBAL)') in ('(GLOBAL)','public','extensions')
group by 1,2,3 order by 1,2,3;

-- ═══ 3. Sentinelles — le comportement des objets FUTURS ═══
-- Transaction annulée : rien ne subsiste. C'est la seule mesure qui prouve
-- ce qui arrivera à la prochaine table créée.
begin;
create table public.sentinelle_t (id int primary key);
create sequence public.sentinelle_s;
create function public.sentinelle_f() returns int language sql immutable as $$ select 1 $$;
create view public.sentinelle_v with (security_invoker = true) as select 1 as x;
select r.role,
  has_table_privilege(r.role,'public.sentinelle_t','SELECT')       as table_select,
  has_table_privilege(r.role,'public.sentinelle_t','INSERT')       as table_insert,
  has_sequence_privilege(r.role,'public.sentinelle_s','USAGE')      as seq_usage,
  has_function_privilege(r.role,'public.sentinelle_f()','EXECUTE')  as fn_execute,
  has_table_privilege(r.role,'public.sentinelle_v','SELECT')        as vue_select
from (values ('anon'),('authenticated'),('service_role')) r(role);
rollback;

-- ═══ 4. Vérifier que les sentinelles ont bien disparu ═══
select count(*) as sentinelles_residuelles
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'sentinelle_%';

-- ═══ 5. La dépendance à ne pas casser ═══
-- `gen_random_bytes` sert de valeur par défaut de colonne : `anon` doit
-- pouvoir l'exécuter, sinon une insertion publique échoue.
select has_function_privilege('anon','extensions.gen_random_bytes(integer)','EXECUTE')
       as anon_peut_gen_random_bytes;
