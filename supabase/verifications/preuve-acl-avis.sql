/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREUVE — l'ACL EFFECTIVE de `avis` prouve l'héritage des DEFAULTS
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
 *  ─── Version 2 (18/08/2026 soir) : droits EFFECTIFS, pas seulement directs ───
 *
 *  La version 1 mesurait `aclexplode(c.relacl)` : les grants DIRECTS
 *  seulement. Un droit transmis à `anon` via PUBLIC, ou via l'appartenance à
 *  un autre rôle, ne serait apparu dans aucune ligne de `relacl` pour
 *  `anon` — faux vert possible, même défaut que la sentinelle avant son
 *  propre durcissement.
 *
 *  Remplacé par `has_table_privilege()` : la primitive officielle de
 *  Postgres, qui résout elle-même PUBLIC et l'héritage de rôle. Testée sur
 *  une matrice complète de 4 rôles × 8 privilèges — la preuve échoue sur
 *  tout excès OU tout manquant, dans n'importe laquelle des 32 cases,
 *  indépendamment de l'ordre des entrées dans `relacl`.
 *
 *  Prouvé en live que la version 1 aurait rendu un faux vert : `TRUNCATE`
 *  accordé à `PUBLIC` sur `avis`, sur une branche synthétique — l'ancienne
 *  requête (aclexplode, grantee direct) ne le voit pas, la nouvelle
 *  (has_table_privilege) le voit pour `anon` ET `authenticated`
 *  simultanément. Semé puis retiré, vérifié à l'état initial après coup.
 *
 *  Mesuré en PRODUCTION le 18/08/2026, en lecture seule. Aucune donnée de
 *  la table elle-même n'est lue ici — uniquement son ACL (catalogue
 *  système, pas de contenu).
 *
 *  Valeur attendue, versionnée :
 *
 *    anon          : DELETE, INSERT, MAINTAIN, SELECT, UPDATE   (5 — jamais TRUNCATE/TRIGGER/REFERENCES)
 *    authenticated : DELETE, INSERT, MAINTAIN, SELECT, UPDATE   (5 — idem)
 *    postgres      : DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE (8, propriétaire)
 *    service_role  : DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE (8)
 *
 *  À rejouer après toute reconstruction : la requête ci-dessous lève si la
 *  table s'écarte de cette attente, sur N'IMPORTE LEQUEL des 32 couples
 *  rôle × privilège.
 */

do $$
declare
  v_ecarts int;
  v_detail text;
  v_attendu jsonb := '{
    "anon":          ["DELETE","INSERT","MAINTAIN","SELECT","UPDATE"],
    "authenticated": ["DELETE","INSERT","MAINTAIN","SELECT","UPDATE"],
    "postgres":      ["DELETE","INSERT","MAINTAIN","REFERENCES","SELECT","TRIGGER","TRUNCATE","UPDATE"],
    "service_role":  ["DELETE","INSERT","MAINTAIN","REFERENCES","SELECT","TRIGGER","TRUNCATE","UPDATE"]
  }'::jsonb;
begin
  with roles as (
    select rolename from (values ('anon'), ('authenticated'), ('postgres'), ('service_role')) as r(rolename)
  ),
  privileges as (
    select priv from (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
    ) as p(priv)
  ),
  mesure as (
    select r.rolename, p.priv,
           has_table_privilege(r.rolename, 'public.avis'::regclass, p.priv) as a_effectivement
    from roles r cross join privileges p
  ),
  attendu as (
    select r.rolename, p.priv,
           (v_attendu -> r.rolename) ? p.priv as devrait_avoir
    from roles r cross join privileges p
  )
  select count(*),
         string_agg(
           m.rolename || ':' || m.priv ||
           case when m.a_effectivement and not a.devrait_avoir then ' (EXCÈS — droit effectif non attendu)'
                else ' (MANQUANT — droit attendu absent)'
           end,
           ', ' order by m.rolename, m.priv
         )
    into v_ecarts, v_detail
  from mesure m
  join attendu a using (rolename, priv)
  where m.a_effectivement is distinct from a.devrait_avoir;

  if v_ecarts > 0 then
    raise exception 'PREUVE avis (droits effectifs) : % écart(s) sur 32 couples rôle×privilège. %',
      v_ecarts, left(v_detail, 500);
  end if;

  raise notice 'PREUVE avis OK : droits EFFECTIFS (has_table_privilege, PUBLIC et héritage de rôle '
    'inclus) conformes sur les 4 rôles × 8 privilèges.';
end $$;
