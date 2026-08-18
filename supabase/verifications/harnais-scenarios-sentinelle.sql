/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — les 4 scénarios de faux vert, rejouables automatiquement
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Le 18/08/2026, les 4 scénarios qui prouvent la sentinelle (durcie) contre
 *  la sentinelle (version 1, faux vert) ont été mesurés MANUELLEMENT sur une
 *  branche synthétique — un travail réel, mais qui ne protège contre aucune
 *  régression future : rien ne rejoue ces scénarios automatiquement. Ce
 *  fichier corrige ça.
 *
 *  ─── Ce que chaque scénario prouve, et NON contre la sentinelle actuelle ───
 *
 *  Ce harnais ne rejoue plus l'ANCIENNE requête (elle n'existe plus dans le
 *  dépôt, il n'y a rien d'utile à figer d'une version révolue). Il rejoue la
 *  requête ACTUELLE de `sentinelle-privileges-anon.sql`, verbatim — copiée
 *  entre les mêmes ancres `ANCRE_REQUETE_*` — et prouve trois choses par
 *  scénario : (1) l'état est propre avant de semer, (2) la sentinelle détecte
 *  l'excès une fois semé, (3) le nettoyage restaure l'état exact d'avant.
 *  Si (2) échoue, c'est une RÉGRESSION de la sentinelle : ce fichier lève.
 *
 *  ─── Garde anti-dérive ───
 *
 *  `supabase/verifications/sentinelle.test.ts` lit ce fichier ET
 *  `sentinelle-privileges-anon.sql`, extrait le texte entre les mêmes
 *  ancres, et échoue si un seul caractère diffère. Modifier la logique de
 *  détection sans répercuter ici (ou l'inverse) casse ce test — c'est le
 *  but : aucune dérive silencieuse entre la sentinelle et sa preuve.
 *
 *  ─── Rôle synthétique, pas `supabase_admin` ───
 *
 *  Le scénario « autre rôle propriétaire » utilise un rôle JETABLE créé et
 *  détruit par ce fichier (`role_scenario_plateforme_test`), jamais
 *  `supabase_admin` — ce rôle réel de plateforme n'est ni modifié ni
 *  approché ici. Le cas réel (l'entrée que porte effectivement
 *  `supabase_admin` en production) est mesuré séparément, en lecture seule,
 *  documenté dans `docs/preuve-sentinelle-et-fonctions.md` §5, et fait
 *  l'objet d'un dossier fournisseur séparé — pas de ce harnais.
 *
 *  ─── À exécuter uniquement sur une branche synthétique ───
 *
 *  Ce fichier CRÉE un rôle, sème puis retire des privilèges, accorde puis
 *  révoque un GRANT sur une relation existante. Rien de destructif, tout est
 *  nettoyé avant la fin du script — mais ce n'est pas une requête en lecture
 *  seule. Ne jamais l'exécuter sur la production.
 */

do $$
declare
  v_avant  int;
  v_apres  int;
  v_nettoye int;
  v_detail text;
begin
  -- ═══ Propreté initiale — le harnais suppose un terrain propre ═══
  select count(*)
    into v_avant
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

  select count(*)
    into v_nettoye
  -- ANCRE_REQUETE_RELATIONS_DEBUT (ce bloc doit rester identique dans harnais-scenarios-sentinelle.sql)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolename)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where n.nspname = 'public'
    and has_table_privilege(r.rolename, c.oid, p.priv);
  -- ANCRE_REQUETE_RELATIONS_FIN

  if v_avant <> 0 or v_nettoye <> 0 then
    raise exception 'HARNAIS : terrain non propre avant de commencer (defauts=%, relations=%). Abandon, rien semé.',
      v_avant, v_nettoye;
  end if;

  -- ═══ SCÉNARIO 1 — défaut `postgres`, schéma `public`, accordé à PUBLIC ═══
  alter default privileges in schema public grant truncate on tables to public;

  select count(*), string_agg(distinct
           coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) || ':' ||
           coalesce(ns.nspname, '(global)') || ':' ||
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' ||
           a.privilege_type, ', ')
    into v_apres, v_detail
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

  if v_apres = 0 then
    alter default privileges in schema public revoke truncate on tables from public;
    raise exception 'HARNAIS SCÉNARIO 1 (postgres/public/PUBLIC) : RÉGRESSION — non détecté.';
  end if;

  alter default privileges in schema public revoke truncate on tables from public;

  select count(*) into v_nettoye
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

  if v_nettoye <> 0 then
    raise exception 'HARNAIS SCÉNARIO 1 : nettoyage incomplet, % résidus.', v_nettoye;
  end if;

  raise notice 'HARNAIS SCÉNARIO 1 (postgres/public/PUBLIC) : détecté (%), nettoyé — OK.', v_detail;

  -- ═══ SCÉNARIO 2 — défaut d'un AUTRE rôle propriétaire, schéma `public`, direct ═══
  -- Rôle JETABLE, créé et détruit ici. Jamais `supabase_admin`.
  create role role_scenario_plateforme_test;
  grant role_scenario_plateforme_test to postgres;
  alter default privileges for role role_scenario_plateforme_test in schema public
    grant truncate on tables to anon;

  select count(*), string_agg(distinct
           coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) || ':' ||
           coalesce(ns.nspname, '(global)') || ':' ||
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' ||
           a.privilege_type, ', ')
    into v_apres, v_detail
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

  if v_apres = 0 then
    alter default privileges for role role_scenario_plateforme_test in schema public
      revoke truncate on tables from anon;
    revoke role_scenario_plateforme_test from postgres;
    drop role role_scenario_plateforme_test;
    raise exception 'HARNAIS SCÉNARIO 2 (autre rôle propriétaire/public/direct) : RÉGRESSION — non détecté.';
  end if;

  alter default privileges for role role_scenario_plateforme_test in schema public
    revoke truncate on tables from anon;
  revoke role_scenario_plateforme_test from postgres;
  drop role role_scenario_plateforme_test;

  select count(*) into v_nettoye
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

  if v_nettoye <> 0 then
    raise exception 'HARNAIS SCÉNARIO 2 : nettoyage incomplet, % résidus.', v_nettoye;
  end if;

  raise notice 'HARNAIS SCÉNARIO 2 (autre rôle propriétaire/public/direct) : détecté (%), nettoyé — OK.', v_detail;

  -- ═══ SCÉNARIO 3 — défaut `postgres`, portée GLOBALE (hors de tout schéma) ═══
  alter default privileges grant truncate on tables to anon;

  select count(*), string_agg(distinct
           coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) || ':' ||
           coalesce(ns.nspname, '(global)') || ':' ||
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' ||
           a.privilege_type, ', ')
    into v_apres, v_detail
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

  if v_apres = 0 then
    alter default privileges revoke truncate on tables from anon;
    raise exception 'HARNAIS SCÉNARIO 3 (postgres/global) : RÉGRESSION — non détecté.';
  end if;

  alter default privileges revoke truncate on tables from anon;

  select count(*) into v_nettoye
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

  if v_nettoye <> 0 then
    raise exception 'HARNAIS SCÉNARIO 3 : nettoyage incomplet, % résidus.', v_nettoye;
  end if;

  raise notice 'HARNAIS SCÉNARIO 3 (postgres/global) : détecté (%), nettoyé — OK.', v_detail;

  -- ═══ SCÉNARIO 4 — relation existante, TRUNCATE accordé à PUBLIC ═══
  grant truncate on public.games to public;

  select count(*), string_agg(distinct c.relname || ':' || r.rolename || ':' || p.priv, ', ')
    into v_apres, v_detail
  -- ANCRE_REQUETE_RELATIONS_DEBUT (ce bloc doit rester identique dans harnais-scenarios-sentinelle.sql)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolename)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where n.nspname = 'public'
    and has_table_privilege(r.rolename, c.oid, p.priv);
  -- ANCRE_REQUETE_RELATIONS_FIN

  if v_apres = 0 then
    revoke truncate on public.games from public;
    raise exception 'HARNAIS SCÉNARIO 4 (relation existante/PUBLIC) : RÉGRESSION — non détecté.';
  end if;

  revoke truncate on public.games from public;

  select count(*) into v_nettoye
  -- ANCRE_REQUETE_RELATIONS_DEBUT (ce bloc doit rester identique dans harnais-scenarios-sentinelle.sql)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolename)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where n.nspname = 'public'
    and has_table_privilege(r.rolename, c.oid, p.priv);
  -- ANCRE_REQUETE_RELATIONS_FIN

  if v_nettoye <> 0 then
    raise exception 'HARNAIS SCÉNARIO 4 : nettoyage incomplet, % résidus.', v_nettoye;
  end if;

  raise notice 'HARNAIS SCÉNARIO 4 (relation existante/PUBLIC) : détecté (%), nettoyé — OK.', v_detail;

  raise notice 'HARNAIS : les 4 scénarios détectés puis nettoyés. Terrain restauré à l''état initial.';
end $$;
