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
 * Pour ce cas-là, la protection retenue est la détection, assumée comme
 * telle : `public.auditer_privileges_publics()`, plus bas.
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
 * ─── Une erreur que j'ai faite, et ce qu'elle a coûté de comprendre ───
 *
 * J'avais d'abord écrit qu'`ALTER DEFAULT PRIVILEGES` ne pouvait PAS retirer
 * l'EXECUTE que PostgreSQL accorde à `PUBLIC` sur toute nouvelle fonction.
 * Les sentinelles le montraient, j'avais retesté quatre fois, et j'en avais
 * conclu que la protection ne pouvait être qu'une règle de relecture.
 *
 * C'était faux, et la raison est dans la documentation : les défauts POSÉS
 * SUR UN SCHÉMA s'AJOUTENT aux défauts globaux. Ils ne peuvent rien en
 * retirer. Mes quatre essais portaient tous `IN SCHEMA public` — je testais
 * la seule forme incapable de faire ce que je lui demandais.
 *
 * La forme qui fonctionne est globale, sans `IN SCHEMA`. Mesuré le 18/08, en
 * deux transactions séparées :
 *
 *     alter default privileges for role postgres revoke execute on functions from public;
 *     → pg_default_acl gagne une entrée de portée globale : postgres=X/postgres
 *
 *     create function public.zz_global() …          (transaction suivante)
 *     → proacl = postgres=X | service_role=X   — PUBLIC a disparu
 *     → has_function_privilege('anon', …)        = false
 *     → has_function_privilege('authenticated', …) = false
 *
 * ─── Le rayon d'impact, mesuré avant d'adopter ───
 *
 * « Global » veut dire : toute fonction future créée par `postgres`, dans
 * TOUT schéma. Il fallait donc savoir où `postgres` crée des fonctions. La
 * réponse, relevée en production, tient en deux lignes :
 *
 *     extensions   49 fonctions sur 55, dont 48 ouvertes à PUBLIC
 *     public       22 sur 22, dont 14 ouvertes à PUBLIC
 *
 * Nulle part ailleurs. Les schémas de plateforme — `auth`, `storage`,
 * `realtime`, `graphql`, `vault`, `supabase_functions` — appartiennent à des
 * rôles dédiés, jamais à `postgres`, donc ce réglage ne les concerne pas.
 *
 * `extensions` est le vrai danger, et il est concret. La colonne
 * `winners.qr_code` a pour défaut `encode(gen_random_bytes(16), ''hex'')`, et
 * `gen_random_bytes` vient de `pgcrypto@extensions`. Un défaut de colonne
 * s''évalue avec les droits de CELUI QUI INSÈRE. Si une mise à jour de
 * `pgcrypto` par `postgres` recréait ses fonctions sous le défaut global,
 * elles naîtraient fermées — et l''insertion d''un ticket échouerait chez
 * trois vrais restaurants.
 *
 * ─── D''où la combinaison, et pourquoi elle est supérieure ───
 *
 * Puisque les défauts par schéma s''AJOUTENT aux globaux, on retire
 * globalement, puis on rend à `extensions` ce qu''elle avait. Vérifié en
 * transaction séparée :
 *
 *     extensions.zz_ext()  → ACL NULL, anon EXECUTE = true   (inchangé)
 *     public.zz_pub()      → postgres=X | service_role=X, anon = false
 *
 * Ce qui reste ouvert, et je le dis plutôt que de le taire : si Supabase
 * créait un jour des fonctions `postgres` dans un schéma NOUVEAU, elles
 * naîtraient fermées. Le symptôme serait une erreur de permission — bruyante,
 * pas silencieuse — et un `grant` explicite la corrigerait. Ce risque-là est
 * détectable et réparable ; celui qu''on ferme ne l''était pas.
 *
 * La règle « chaque fonction porte son revoke » est CONSERVÉE malgré tout,
 * avec son test. Deux protections indépendantes valent mieux qu''une seule
 * qui dépend d''une entrée de catalogue que personne ne regarde.
 */
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema extensions
  grant execute on functions to public;

-- Dans `public`, seul `service_role` reçoit quelque chose automatiquement.
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
