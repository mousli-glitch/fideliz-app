/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LES NOUVEAUX OBJETS NAISSENT FERMÉS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ─── Ce qui a rendu cette migration nécessaire ───
 *
 * En cherchant pourquoi `anon` avait cinq privilèges sur seize tables sans
 * qu'aucun `grant` n'apparaisse nulle part, on a trouvé la cause : des
 * `ALTER DEFAULT PRIVILEGES` posés sur le rôle `postgres`. Toute relation
 * créée dans `public` reçoit donc AUTOMATIQUEMENT, sans que personne l'écrive
 * et sans que personne le voie en relisant la migration :
 *
 *     tables     · anon, authenticated  → INSERT, SELECT, UPDATE, DELETE, MAINTAIN
 *     séquences  · anon, authenticated  → SELECT, UPDATE, USAGE
 *     fonctions  · anon, authenticated  → EXECUTE
 *     fonctions  · PUBLIC               → EXECUTE (défaut de PostgreSQL lui-même)
 *
 * La matrice A/B du 18/08 a montré ce que ça vaut aujourd'hui : `anon` détient
 * réellement INSERT et UPDATE sur `profiles`, et seule la RLS l'arrête. Les
 * sept policies de la table sont toutes en SELECT, donc aucune policy
 * d'écriture n'existe et RLS refuse par défaut. La protection est réelle. Elle
 * tient à un seul fil.
 *
 * Chaque table de la fusion naîtrait avec ces droits. Il suffirait d'une
 * policy d'écriture rédigée trop large, un soir, pour ouvrir la porte — et
 * rien dans le fichier de migration ne l'aurait laissé deviner.
 *
 * ─── Ce que cette migration fait, et ne fait pas ───
 *
 * `ALTER DEFAULT PRIVILEGES` ne touche QUE les objets créés APRÈS lui. Les
 * ACL des 20 relations existantes sont inchangées — c'est vérifiable, leur
 * empreinte doit rester `e16eae01…` après application. Rien de ce qui tourne
 * aujourd'hui ne bouge.
 *
 * À partir d'ici, tout droit accordé à `anon` ou `authenticated` doit être
 * écrit. C'est le but : un droit qu'on lit dans le fichier est un droit qu'on
 * peut discuter en relecture.
 *
 * ─── Ce qui reste hors de portée, et pourquoi ───
 *
 * La production porte aussi trois entrées pour le rôle `supabase_admin`, plus
 * larges encore (`anon = arwdDxtm`, les huit privilèges). Elles sont hors
 * d'atteinte, et ce n'est pas une supposition — c'est mesuré le 18/08 :
 *
 *     alter default privileges for role supabase_admin …
 *       → REFUS 42501 : permission denied to change default privileges
 *     set role supabase_admin
 *       → REFUS 42501 : permission denied to set role "supabase_admin"
 *
 * `postgres` n'est ni superutilisateur ni membre de `supabase_admin`, et on ne
 * touche pas aux rôles gérés par Supabase.
 *
 * Ce qui est démontré est plus étroit que « inerte » : AUCUN objet ACTUEL de
 * `public` n'appartient à `supabase_admin` — les vingt sont à `postgres` — donc
 * ces entrées n'affectent aucun objet actuel. Elles s'appliqueraient à un objet
 * FUTUR créé par ce rôle. Ce rôle possède des objets dans `cron`, `net`,
 * `realtime` et `vault` ; une opération de plateforme pourrait un jour en poser
 * un dans `public`.
 *
 * Une piste préventive existait : un event trigger sur `ddl_command_end`.
 * `postgres` a le droit d'en créer un ici, c'est vérifié. Elle est écartée
 * pour deux raisons. Il se déclencherait aussi sur le DDL de la plateforme, et
 * une erreur dedans ferait échouer les mises à jour Supabase autant que nos
 * propres migrations. Et il ne pourrait pas réparer : révoquer sur un objet
 * appartenant à `supabase_admin` est refusé à `postgres`. Il bloquerait sans
 * corriger — le pire des deux mondes.
 *
 * La protection retenue est donc la détection, assumée comme telle :
 * `public.auditer_privileges_publics()`, plus bas, et le script
 * `scripts/acl-publiques.mjs` qui la confronte à un manifeste versionné.
 */

/*
 * ─────────────────────────────────────────────────────────────────────
 *  Garde : on durcit le rôle qui crée réellement, ou on n'avance pas.
 * ─────────────────────────────────────────────────────────────────────
 *
 * `ALTER DEFAULT PRIVILEGES` sans `FOR ROLE` vise l'utilisateur courant. Si
 * le runner changeait de rôle un jour, cette migration durcirait un rôle qui
 * ne crée rien, passerait au vert, et ne protégerait plus rien. On préfère
 * qu'elle tombe bruyamment.
 */
do $$
declare v_createur text;
begin
  select distinct pg_get_userbyid(c.relowner) into v_createur
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  limit 1;

  if current_user <> 'postgres' then
    raise exception 'Migration exécutée en tant que « % », attendu « postgres ». '
      'Durcir les défauts d''un rôle qui ne crée pas les objets ne protège rien.', current_user;
  end if;

  if v_createur is distinct from 'postgres' then
    raise exception 'Les tables de public appartiennent à « % » et non à « postgres ». '
      'Le rôle créateur a changé : revoir cette migration avant de l''appliquer.', v_createur;
  end if;
end $$;

-- ─────────────────────────────────────────────────────── tables et vues
-- Rien pour anon ni authenticated. `service_role` garde les quatre verbes
-- dont le serveur se sert vraiment : ni TRUNCATE, ni REFERENCES, ni TRIGGER,
-- ni MAINTAIN, qu'aucun chemin applicatif n'emploie.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

-- ────────────────────────────────────────────────────────────  séquences
-- USAGE couvre `nextval` et `currval`, SELECT couvre `lastval`. UPDATE ne
-- sert qu'à `setval`, qu'aucun code n'appelle.
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

/*
 * ────────────────────────────────────────────────────────────  fonctions
 *
 * ⚠ CE QUI SUIT NE FERME PAS `PUBLIC`, ET C'EST MESURÉ.
 *
 * PostgreSQL accorde EXECUTE à `PUBLIC` sur toute nouvelle fonction. Ce droit
 * est celui qui rendait `archive_redeemed_winners` et `_log_event` appelables
 * anonymement — d'où le REVOKE du 17/08 visant `public` et pas seulement
 * `anon`.
 *
 * On pourrait croire qu'`ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON
 * FUNCTIONS FROM PUBLIC` le retire. La documentation le laisse entendre. Sur
 * cette instance, c'est faux, et voici la mesure du 18/08, faite sur deux
 * transactions séparées pour écarter tout effet de visibilité :
 *
 *     alter default privileges for role postgres in schema public
 *       revoke execute on functions from public;
 *     → 0 ligne dans pg_default_acl : l'instruction n'enregistre RIEN
 *
 *     create function public.zz_d5() …
 *     → proacl NULL, donc défaut câblé : propriétaire + PUBLIC
 *     → has_function_privilege('anon', …, 'EXECUTE') = true
 *
 * Testé aussi avant le grant, après le grant, et sur une entrée vierge. Même
 * résultat à chaque fois. (PostgreSQL 17.6.)
 *
 * Les deux instructions ci-dessous sont conservées : elles ferment bien
 * `anon` et `authenticated` en direct, et elles reprendraient tout leur effet
 * si le comportement changeait. Mais elles ne suffisent pas, et il ne faut
 * surtout pas les lire comme une protection des fonctions.
 *
 * LA PROTECTION RÉELLE EST AILLEURS, et elle est une règle, pas un réglage :
 * toute fonction créée dans `public` après cette migration doit porter son
 * propre `revoke execute … from public`. Le test
 * `supabase/migrations/durcissement.test.ts` le vérifie sur chaque fichier de
 * migration et tombe si une seule fonction y échappe.
 */
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

/*
 * ─────────────────────────────────────────────────────────────────────
 *  La détection, pour ce que la prévention n'atteint pas
 * ─────────────────────────────────────────────────────────────────────
 *
 * Elle est créée APRÈS les instructions ci-dessus : elle naît donc sans
 * aucun droit implicite, ce qui la rend elle-même une première preuve que le
 * durcissement a pris.
 *
 * Elle rend les faits, pas un verdict. La liste de ce qui est légitime vit
 * dans le dépôt (`scripts/fixtures-acl/attendu.json`), où elle se relit et se
 * discute — pas dans une table que personne ne regarde.
 */
create or replace function public.auditer_privileges_publics()
returns table(objet text, genre text, proprietaire text, beneficiaire text, privileges text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  -- Relations : tables et vues.
  select c.relname::text,
         case c.relkind when 'r' then 'table' else 'vue' end,
         pg_get_userbyid(c.relowner)::text,
         case when e.grantee = 0 then 'PUBLIC' else e.grantee::regrole::text end,
         string_agg(distinct e.privilege_type, ',' order by e.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) e
  where n.nspname = 'public'
    and c.relkind in ('r','v')
    and (e.grantee = 0 or e.grantee::regrole::text in ('anon','authenticated'))
  group by 1, 2, 3, 4

  union all

  -- Fonctions : `PUBLIC` compris, c'est tout l'enjeu. Une fonction dont
  -- l'ACL est NULL porte le défaut câblé — propriétaire ET PUBLIC — donc
  -- elle est ouverte à tous sans qu'aucun `grant` n'apparaisse. On la fait
  -- apparaître explicitement, sinon l'audit passerait à côté du cas exact
  -- qui a produit les deux P0 du 17/08.
  select p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'fonction',
         pg_get_userbyid(p.proowner)::text,
         'PUBLIC',
         'EXECUTE (défaut câblé, ACL absente)'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proacl is null

  union all

  select p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'fonction',
         pg_get_userbyid(p.proowner)::text,
         case when e.grantee = 0 then 'PUBLIC' else e.grantee::regrole::text end,
         string_agg(distinct e.privilege_type, ',' order by e.privilege_type)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(p.proacl) e
  where n.nspname = 'public'
    and (e.grantee = 0 or e.grantee::regrole::text in ('anon','authenticated'))
  group by 1, 2, 3, 4
$$;

revoke all on function public.auditer_privileges_publics() from public, anon, authenticated;
grant execute on function public.auditer_privileges_publics() to service_role;
