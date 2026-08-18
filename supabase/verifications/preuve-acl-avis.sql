/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREUVE — l'ACL effective de `avis` prouve l'héritage des DEFAULTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `avis` est créée par `20260724002837_create_avis_mirror_table.sql`,
 *  APRÈS les `alter default privileges` de la baseline (00000000000000).
 *  Elle n'apparaît dans aucun `grant` explicite du dépôt : son ACL vient
 *  entièrement de l'héritage des privilèges par défaut posés avant elle.
 *
 *  C'est la preuve que les DEFAUTS marchent pour un objet FUTUR, pas
 *  seulement pour les tables que la baseline crée elle-même dans le même
 *  fichier.
 *
 *  Mesuré en PRODUCTION (kzeuplszcqjqaqohfbzk) le 18/08/2026, en lecture
 *  seule. Aucune donnée de la table elle-même n'est lue ici — uniquement son
 *  ACL (catalogue système, pas de contenu).
 *
 *  Valeur attendue, versionnée :
 *
 *    anon          : DELETE, INSERT, MAINTAIN, SELECT, UPDATE   (5 — jamais TRUNCATE/TRIGGER/REFERENCES)
 *    authenticated : DELETE, INSERT, MAINTAIN, SELECT, UPDATE   (5 — idem)
 *    postgres      : DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE (8, propriétaire)
 *    service_role  : DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE (8)
 *
 *  À rejouer après toute reconstruction : la requête ci-dessous lève si la
 *  table s'écarte de cette attente, sur N'IMPORTE LEQUEL des quatre rôles.
 */

do $$
declare
  v_ecarts int;
  v_detail text;
  v_attendu jsonb := '{
    "anon": "DELETE,INSERT,MAINTAIN,SELECT,UPDATE",
    "authenticated": "DELETE,INSERT,MAINTAIN,SELECT,UPDATE",
    "postgres": "DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
    "service_role": "DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"
  }'::jsonb;
begin
  with mesure as (
    select pg_get_userbyid(a.grantee) as rolename,
           string_agg(a.privilege_type, ',' order by a.privilege_type) as droits
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'avis'
    group by pg_get_userbyid(a.grantee)
  )
  select count(*),
         string_agg(distinct coalesce(m.rolename, k.key) || ' : attendu=' ||
           coalesce(v_attendu->>k.key, '(absent)') || ' mesuré=' || coalesce(m.droits, '(absent)'), ', ')
    into v_ecarts, v_detail
  from mesure m
  full outer join jsonb_object_keys(v_attendu) as k(key) on k.key = m.rolename
  where coalesce(m.droits, '') is distinct from coalesce(v_attendu->>coalesce(m.rolename, k.key), '');

  if v_ecarts > 0 then
    raise exception 'PREUVE avis : % écart(s) avec l''ACL attendue. %', v_ecarts, left(v_detail, 500);
  end if;

  raise notice 'PREUVE avis OK : ACL effective conforme sur les 4 rôles (anon, authenticated, postgres, service_role).';
end $$;
