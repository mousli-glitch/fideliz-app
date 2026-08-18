/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SENTINELLE — aucun droit excessif pour anon / authenticated
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  À jouer après toute reconstruction, et avant de déclarer un environnement
 *  conforme. Elle échoue bruyamment plutôt que de rendre une ligne verte.
 *
 *  ─── Ce qu'elle attrape, et pourquoi ça compte ───
 *
 *  Un `alter default privileges ... grant` n'enlève rien : il s'AJOUTE à ce
 *  qui préexiste. Une base vierge peut déjà accorder les huit privilèges sur
 *  les tables. La baseline accordait donc cinq droits en croyant les définir,
 *  pendant que REFERENCES, TRIGGER et TRUNCATE restaient acquis — 114
 *  privilèges de trop, mesurés sur une reconstruction réelle.
 *
 *  TRUNCATE mérite l'attention : **la RLS ne le filtre pas**. Une policy ne
 *  s'applique qu'aux lignes lues, insérées, modifiées ou supprimées par
 *  DELETE. TRUNCATE vide la table entière sans passer par elle.
 *
 *  ─── Version 2 (18/08/2026) : pourquoi la version 1 rendait un faux vert ───
 *
 *  La première version avait trois angles morts, tous trouvés par audit
 *  indépendant puis vérifiés contre le code réel :
 *
 *   1. Elle n'inspectait que les grants DIRECTS sur anon/authenticated dans
 *      `relacl`, pas leurs droits EFFECTIFS (accordés à PUBLIC, ou hérités
 *      par appartenance à un autre rôle).
 *   2. Sur les défauts, elle imposait `defaclrole = 'postgres'`, ignorant
 *      tout autre rôle propriétaire.
 *   3. Son `JOIN pg_namespace` (INNER) excluait silencieusement les entrées
 *      GLOBALES (`defaclnamespace = 0`, hors de tout schéma).
 *
 *  Mesuré en PRODUCTION le 18/08/2026, en lecture seule : le rôle de
 *  plateforme `supabase_admin` (superutilisateur, `has_schema_privilege(...,
 *  'CREATE')` vrai sur `public`) y porte une entrée de défaut accordant
 *  TRUNCATE, TRIGGER et REFERENCES à `anon` ET `authenticated` sur toute
 *  future relation qu'il créerait dans `public`. Invisible aux trois angles
 *  morts ci-dessus simultanément. Aucune des 20 relations actuelles ne lui
 *  appartient (0/20, mesuré) — inerte dans l'historique, pas structurellement
 *  neutralisé : le rôle garde la capacité. Cette version couvre les trois.
 *
 *  ─── Deux contrôles, pas un ───
 *
 *  Les privilèges DÉJÀ posés sur les relations existantes — droits EFFECTIFS :
 *  directs, via PUBLIC, ou hérités d'un rôle dont anon/authenticated sont
 *  membres — et les privilèges PAR DÉFAUT, TOUT propriétaire, TOUTE portée
 *  (schéma `public` ou globale), qui décideront des objets futurs. Corriger
 *  les premiers sans les seconds laisse le défaut revenir à la prochaine
 *  table créée ; ignorer un propriétaire ou la portée globale laisse une
 *  seconde route d'attribution ouverte.
 */

do $$
declare
  v_relations int;
  v_defauts   int;
  v_detail    text;
begin
  -- 1. Relations existantes — droits EFFECTIFS, pas seulement les grants
  --    directs. has_table_privilege() est la primitive officielle de
  --    Postgres pour « ce rôle peut-il, en pratique » : elle résout PUBLIC
  --    et l'héritage de rôle elle-même, pas besoin de le réimplémenter à la
  --    main comme le faisait aclexplode(relacl) seul.
  select count(*),
         string_agg(distinct c.relname || ':' || r.rolename || ':' || p.priv, ', ')
    into v_relations, v_detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(rolename)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where n.nspname = 'public'
    and has_table_privilege(r.rolename, c.oid, p.priv);

  if v_relations > 0 then
    raise exception 'SENTINELLE : % privilege(s) effectif(s) excessif(s) sur des relations existantes. %',
      v_relations, left(v_detail, 400);
  end if;

  -- 2. Privilèges par défaut — TOUT propriétaire, TOUTE portée (schéma
  --    `public` OU globale : defaclnamespace = 0), grants directs, à PUBLIC,
  --    ou hérités par appartenance de rôle. C'est ce qui décidera des objets
  --    FUTURS, quel que soit qui les crée.
  select count(*),
         string_agg(distinct
           coalesce(pg_get_userbyid(d.defaclrole), d.defaclrole::text) || ':' ||
           coalesce(ns.nspname, '(global)') || ':' ||
           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' ||
           a.privilege_type,
         ', ')
    into v_defauts, v_detail
  from pg_default_acl d
  left join pg_namespace ns on ns.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype = 'r'
    and (ns.nspname = 'public' or d.defaclnamespace = 0)
    and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
    and (
      a.grantee = 0                                             -- accordé à PUBLIC
      or pg_get_userbyid(a.grantee) in ('anon', 'authenticated') -- direct
      or pg_has_role('anon', a.grantee, 'USAGE')                 -- hérité par anon
      or pg_has_role('authenticated', a.grantee, 'USAGE')        -- hérité par authenticated
    );

  if v_defauts > 0 then
    raise exception 'SENTINELLE : % privilege(s) excessif(s) dans les DEFAUTS (tout propriétaire, toute portée). '
      'Les relations actuelles sont saines, mais la prochaine table créée sous ce propriétaire ne le sera pas. %',
      v_defauts, left(v_detail, 400);
  end if;

  raise notice 'SENTINELLE OK : aucun TRUNCATE/TRIGGER/REFERENCES effectif pour anon ou authenticated, '
    'ni sur les relations existantes (droits effectifs), ni dans les défauts (tout propriétaire, toute '
    'portée, PUBLIC et héritage de rôle inclus).';
end $$;
