/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SENTINELLE — MODE OPÉRATIONNEL (sépare FAIL PROJECT de PLATFORM WARNING)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `sentinelle-privileges-anon.sql` (mode STRICT) lève sur TOUTE divergence,
 *  y compris l'entrée que porte réellement `supabase_admin` en production —
 *  ce qui empêche mécaniquement de déclarer la production, ou une branche
 *  fidèlement reconstruite, conforme tant que ce rôle de plateforme n'a pas
 *  reçu de remédiation validée par Supabase (`NEEDS_VENDOR_CONFIRMATION`,
 *  voir `docs/dossier-support-supabase-admin.md`).
 *
 *  Ce fichier sépare les deux :
 *
 *   · FAIL PROJECT   — divergence sur un rôle ou un objet que CE PROJET
 *                      contrôle (`postgres`, ou tout autre rôle). Lève une
 *                      exception, bloque le pipeline. C'est le signal
 *                      opérationnel du quotidien.
 *   · PLATFORM WARNING — divergence dont le SEUL propriétaire est le rôle
 *                      interne `supabase_admin`. Émet un avertissement
 *                      (`RAISE WARNING`, visible dans les logs/la console —
 *                      **jamais transformé en succès silencieux**), mais ne
 *                      lève PAS d'exception : ce projet n'a pas la main sur
 *                      ce rôle, et bloquer dessus n'apporterait aucune
 *                      action possible tant que Supabase n'a pas répondu.
 *
 *  Classification stricte : SEUL le nom littéral `supabase_admin` bascule en
 *  avertissement. Un rôle inconnu — y compris un futur rôle de plateforme
 *  encore non nommé ici, ou un rôle créé par erreur — reste FAIL PROJECT.
 *  Pas de heuristique du type « tout ce qui n'est pas postgres » : ça
 *  masquerait silencieusement un vrai problème sous une étiquette
 *  rassurante.
 *
 *  `sentinelle-privileges-anon.sql` (mode STRICT) reste la référence pour le
 *  dossier fournisseur et les audits exhaustifs : il contrôle TOUS les
 *  propriétaires sans exception.
 *
 *  Les fragments FROM/JOIN/WHERE sont identiques à ceux de
 *  `sentinelle-privileges-anon.sql` — mêmes ancres `ANCRE_REQUETE_*`, mêmes
 *  caractères, vérifié par `supabase/verifications/sentinelle.test.ts`.
 *  Seule la liste SELECT change (elle expose le propriétaire, nécessaire à
 *  la classification) ; le FROM/JOIN/WHERE qui décide QUOI est excessif ne
 *  bouge pas d'un caractère entre les deux fichiers.
 */

do $$
declare
  v_fail_project      int;
  v_platform_warning  int;
  v_detail_fail       text;
  v_detail_warning    text;
begin
  -- ═══ 1. Relations existantes ═══
  select
    count(*) filter (where pg_get_userbyid(c.relowner) is distinct from 'supabase_admin'),
    count(*) filter (where pg_get_userbyid(c.relowner) = 'supabase_admin'),
    string_agg(distinct c.relname || ':' || r.rolename || ':' || p.priv || ':' || pg_get_userbyid(c.relowner), ', ')
      filter (where pg_get_userbyid(c.relowner) is distinct from 'supabase_admin'),
    string_agg(distinct c.relname || ':' || r.rolename || ':' || p.priv, ', ')
      filter (where pg_get_userbyid(c.relowner) = 'supabase_admin')
    into v_fail_project, v_platform_warning, v_detail_fail, v_detail_warning
  -- ANCRE_REQUETE_RELATIONS_DEBUT (ce bloc doit rester identique dans harnais-scenarios-sentinelle.sql)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolename)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where n.nspname = 'public'
    and has_table_privilege(r.rolename, c.oid, p.priv);
  -- ANCRE_REQUETE_RELATIONS_FIN

  if v_fail_project > 0 then
    raise exception 'FAIL PROJECT (relations existantes) : % divergence(s) sous contrôle du projet. %',
      v_fail_project, left(v_detail_fail, 400);
  end if;

  if v_platform_warning > 0 then
    raise warning 'PLATFORM WARNING (relations existantes) : % entrée(s) sous supabase_admin — '
      'NEEDS_VENDOR_CONFIRMATION, voir docs/dossier-support-supabase-admin.md. %',
      v_platform_warning, left(v_detail_warning, 400);
  end if;

  -- ═══ 2. Privilèges par défaut ═══
  select
    count(*) filter (where coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) is distinct from 'supabase_admin'),
    count(*) filter (where coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) = 'supabase_admin'),
    string_agg(distinct
      coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) || ':' ||
      coalesce(ns.nspname, '(global)') || ':' ||
      case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' ||
      a.privilege_type, ', ')
      filter (where coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) is distinct from 'supabase_admin'),
    string_agg(distinct
      coalesce(ns.nspname, '(global)') || ':' ||
      case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' ||
      a.privilege_type, ', ')
      filter (where coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) = 'supabase_admin')
    into v_fail_project, v_platform_warning, v_detail_fail, v_detail_warning
  -- ANCRE_REQUETE_DEFAUTS_DEBUT (ce bloc doit rester identique dans harnais-scenarios-sentinelle.sql)
  from pg_default_acl d
  left join pg_namespace ns on ns.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype = 'r'
    and (ns.nspname = 'public' or d.defaclnamespace = 0)
    and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
    and (
      -- CASE explicite : ne JAMAIS appeler pg_has_role() avec l'oid 0 en
      -- comptant sur l'ordre d'évaluation d'un OR SQL, qui n'est pas
      -- garanti. PUBLIC (grantee = 0) se traite dans sa propre branche,
      -- jamais dans celle qui appelle pg_has_role().
      case
        when a.grantee = 0 then true                                 -- accordé à PUBLIC
        else
          pg_get_userbyid(a.grantee) in ('anon', 'authenticated')     -- direct
          or pg_has_role('anon', a.grantee, 'USAGE')                  -- hérité par anon
          or pg_has_role('authenticated', a.grantee, 'USAGE')         -- hérité par authenticated
      end
    );
  -- ANCRE_REQUETE_DEFAUTS_FIN

  if v_fail_project > 0 then
    raise exception 'FAIL PROJECT (défauts) : % divergence(s) sous contrôle du projet. %',
      v_fail_project, left(v_detail_fail, 400);
  end if;

  if v_platform_warning > 0 then
    raise warning 'PLATFORM WARNING (défauts) : % entrée(s) sous supabase_admin — '
      'NEEDS_VENDOR_CONFIRMATION, voir docs/dossier-support-supabase-admin.md. %',
      v_platform_warning, left(v_detail_warning, 400);
  end if;

  raise notice 'SENTINELLE (mode opérationnel) : aucune divergence FAIL PROJECT. '
    'Voir les avertissements PLATFORM WARNING ci-dessus le cas échéant — non silencieux, non bloquant.';
end $$;
