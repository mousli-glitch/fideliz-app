-- ═══════════════════════════════════════════════════════════════════════
--  GEL SOURCE FIDELIZ — lecture seule pour le migrateur, aucun laissez-passer
-- ═══════════════════════════════════════════════════════════════════════
--
--  ⚠ CETTE MIGRATION N'EST PAS APPLIQUÉE EN PRODUCTION.
--    Elle est écrite, testée sur la branche temporaire, et appliquée le jour
--    de la bascule — jamais avant. Tant que `actif = false`, elle ne fait
--    rigoureusement rien.
--
--  ─── PÉRIMÈTRE STRICT : SOURCE SEULEMENT ───
--
--  Ce fichier gèle UNIQUEMENT la base Fideliz, en tant que SOURCE d'une
--  migration vers Cartiz. Le migrateur LIT Fideliz et ÉCRIT dans Cartiz —
--  il n'a donc besoin d'AUCUNE écriture ici, jamais, y compris pendant la
--  fenêtre de bascule. C'est pourquoi ce mécanisme ne porte aucun laissez-
--  passer, aucun jeton, aucun contournement : une capacité de
--  contournement qu'aucun besoin ne justifie est une surface privilégiée
--  gratuite, pas une protection.
--
--  Le gel de la base CARTIZ (la destination, où le migrateur DOIT écrire
--  pendant la fenêtre) est un mécanisme SÉPARÉ, distinct de celui-ci,
--  à concevoir dans le dépôt Cartiz quand le migrateur existera. Aucun nom
--  de table, de fonction ou d'hypothèse propre à Cartiz n'est introduit
--  ici — ce fichier ne présuppose rien de ce mécanisme, et rien ici ne
--  peut le contourner : les deux gels sont indépendants, chacun sur sa
--  propre base, sans jeton partagé entre eux.
--
--  ─── POURQUOI DES TRIGGERS, ET PAS UN DRAPEAU DANS L'APPLICATION ───
--
--  Un bouton grisé n'arrête personne : il suffit d'appeler la Server Action
--  directement, ou la RPC, ou l'API. Un contrôle dans le code applicatif ne
--  vaut que pour les appels qui passent par ce code.
--
--  Le gel vit donc dans la base, sur des triggers. Aucun chemin ne les
--  contourne : ni une Server Action, ni `play_game`, ni un `insert` mené
--  avec la clé de service. `service_role` contourne la RLS — il ne contourne
--  pas un trigger. C'est précisément pour ça qu'on l'écrit ici.
--
--  ─── CE QUI RESTE OUVERT ───
--
--  Les LECTURES. Un trigger `before insert or update or delete` ne se
--  déclenche jamais sur un `select`.
--
--  Concrètement, pendant la fenêtre de deux heures : les menus digitaux et
--  les cartes en images restent consultables, les QR imprimés résolvent
--  toujours, `/verify` affiche toujours l'état d'un ticket. Un client qui
--  scanne au comptoir voit sa carte. Ce qu'il ne peut pas faire, c'est jouer,
--  gagner, ou faire valider un ticket.
--
--  Les menus Cartiz ne sont de toute façon pas concernés : ils vivent dans
--  une autre base, que cette migration ne touche pas.

-- ─────────────────────────────────────────────────────────────── l'état

create table if not exists public.maintenance (
  id      boolean primary key default true,
  actif   boolean not null default false,
  message text    not null default 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.',
  depuis  timestamptz,
  par     uuid,
  -- Une seule ligne possible : un drapeau qui existerait en double serait un
  -- drapeau dont personne ne saurait lequel fait foi.
  constraint maintenance_ligne_unique check (id = true)
);

insert into public.maintenance (id, actif) values (true, false)
on conflict (id) do nothing;

alter table public.maintenance enable row level security;

/*
 * ─── AUCUNE LECTURE DIRECTE ───
 *
 * RLS activée sans policy = refus pour tous les rôles non privilégiés.
 * L'application lit l'état par la fonction étroite
 * `public.en_maintenance()`, qui ne rend qu'un booléen et un message.
 */

-- ───────────────────────────────────────────────────── la garde elle-même

/*
 * L'état PUBLIC : un booléen et un message, rien d'autre.
 *
 * C'est la seule porte laissée aux rôles applicatifs. Elle ne peut rien
 * modifier.
 */
create or replace function public.en_maintenance()
returns table(actif boolean, message text)
language sql
stable
security definer
set search_path to 'public'
as $$ select m.actif, m.message from public.maintenance m where m.id $$;

revoke all on function public.en_maintenance() from public;
grant execute on function public.en_maintenance() to anon, authenticated, service_role;

create or replace function public.maintenance_actif()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce((select actif from public.maintenance where id), false) $$;

/*
 * ─── AUCUN LAISSEZ-PASSER — LE REFUS EST INCONDITIONNEL ───
 *
 * Contrairement à un gel de destination (où le migrateur doit écrire),
 * ce gel de SOURCE ne connaît aucune exception. `actif = true` refuse
 * TOUT LE MONDE, y compris `service_role`, y compris le migrateur — qui
 * n'a de toute façon jamais besoin d'écrire dans la source. Aucun jeton,
 * aucune colonne d'empreinte, aucun `current_setting` : la surface de
 * contournement est nulle parce qu'aucun mécanisme de contournement
 * n'existe, pas parce qu'il est bien gardé.
 */
create or replace function public.refuser_pendant_maintenance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.maintenance_actif() then
    /*
     * 57014 (query_canceled) est déjà pris. On choisit une classe applicative
     * dédiée pour que l'application distingue « on est en maintenance » de
     * « la requête a échoué », et affiche le bon message plutôt qu'une erreur
     * technique.
     */
    raise exception using
      errcode = 'P0100',
      message = coalesce((select message from public.maintenance where id),
                         'Service momentanément suspendu.'),
      hint    = 'bascule_en_cours';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- ──────────────────────────────────────────── les tables gelées en écriture

do $$
declare
  t text;
  /*
   * Les tables dont une écriture pendant la fenêtre créerait une ligne dans
   * Cartiz sans équivalent dans Fideliz — c'est-à-dire exactement ce qu'un
   * rollback ne saurait pas réconcilier.
   *
   * Inventaire complet des 17 tables de `public`, classées nominativement
   * le 19/08/2026 (voir `docs/qualification-couche-4-gel.md` pour le
   * détail de chaque décision) :
   *
   *   `system_logs`, `activity_logs_legacy` — journaux techniques,
   *     volontairement OUVERTS : ils doivent continuer d'écrire pendant
   *     la bascule, c'est même le moment où on en a le plus besoin.
   *     Vérifié : `activity_logs_legacy` est un journal non bloquant
   *     (`app/actions/update-restaurant-email.ts`), même nature que
   *     `system_logs`.
   *   `maintenance` — état interne du gel, exclue : gelée, elle
   *     s'auto-verrouillerait.
   *   `auth_ghosts_backup_20260606`, `auth_orphan_backup_20260606`,
   *     `contacts_backup_20260606`, `winners_backup_20260606` —
   *     historique/backup non mutable, RLS activée sans policy (aucune
   *     migration ne leur ajoute de policy ni ne désactive leur RLS,
   *     vérifié par test permanent) : déjà fermées, sans avoir besoin
   *     de ce trigger.
   *   `crm_notes` — AJOUTÉE. Zéro usage trouvé dans le code applicatif
   *     (`grep` vide sur `app/`, `lib/`, `components/`), mais figure dans
   *     la sauvegarde logique et n'a pas de preuve exhaustive d'exclusion
   *     du périmètre de migration — le doute joue pour la geler.
   *   `sales_restaurants` — AJOUTÉE. Usage applicatif confirmé
   *     (`app/actions/admin-actions.ts`, `app/api/sales/dashboard/
   *     route.ts`, `app/actions/delete-sales-user.ts`,
   *     `app/api/restaurants/block/route.ts`) : rattachements
   *     commercial↔restaurant, participent à l'isolation multi-tenant.
   *   `winners_archive` — AJOUTÉE par prudence. Son seul écrivain est
   *     `archive_redeemed_winners()`, qui insère ici et supprime de
   *     `winners` dans UN SEUL statement à CTE (donc déjà protégée par
   *     le gel de `winners`, atomiquement) — la geler directement aussi
   *     évite de dépendre indéfiniment de ce couplage implicite si la
   *     fonction est un jour réécrite en deux statements.
   */
  tables text[] := array[
    'winners',            -- participations, gains, validations, consommations
    'contacts',           -- inscriptions clients
    'prizes',             -- stocks des lots
    'games',               -- configuration des jeux
    'restaurants',        -- réglages, abonnements, jetons
    'profiles',            -- comptes et rôles
    'avis',                -- miroir des avis Google (le cron écrit ici)
    'crm_notes',           -- notes commerciales (0 usage applicatif actuel, geler par prudence)
    'sales_restaurants',   -- rattachement commercial↔restaurant
    'winners_archive'      -- déjà protégée transitivement, gelée aussi directement
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists gel_de_bascule on public.%I', t);
    execute format(
      'create trigger gel_de_bascule before insert or update or delete on public.%I
         for each row execute function public.refuser_pendant_maintenance()', t);
  end loop;
end $$;

comment on table public.maintenance is
  'Drapeau du gel SOURCE Fideliz. actif = true fait echouer toute ecriture sur les tables metier, y compris via service_role et RPC — les triggers ne se contournent pas, et aucun laissez-passer n''existe. Les lectures restent ouvertes : menus, QR et /verify continuent de repondre. Le gel de la destination Cartiz est un mecanisme separe.';

-- ─────────────────────────────────────────────── qui peut toucher au drapeau

/*
 * La table est lisible par tous (l'application doit pouvoir afficher un
 * message honnête) et écrite par personne via PostgREST. Le basculement se
 * fait à la clé de service, depuis le runbook, et par rien d'autre.
 *
 * Sans ce revoke, les DEFAULT PRIVILEGES de `postgres` accorderaient
 * automatiquement INSERT, SELECT, UPDATE, DELETE et MAINTAIN à `anon` et
 * `authenticated` — n'importe quel visiteur pourrait lever le gel.
 */
revoke all on public.maintenance from anon, authenticated;

/*
 * La fonction interne non plus. Les DEFAULT PRIVILEGES accordent EXECUTE à
 * tout nouvel objet ; `refuser_pendant_maintenance()` est une fonction de
 * trigger, que PostgreSQL refuse d'appeler directement — mais un droit
 * inutile ne se garde pas pour autant.
 */
revoke all on function public.maintenance_actif() from public, anon, authenticated;
revoke all on function public.refuser_pendant_maintenance() from public, anon, authenticated;

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  L'ORDRE DES OPÉRATIONS — CÔTÉ SOURCE UNIQUEMENT
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  1. GELER LA SOURCE.
 *     update public.maintenance set actif = true, depuis = now(),
 *       message = '…';
 *
 *  2. LAISSER FINIR CE QUI EST EN VOL. Le gel arrête les nouvelles écritures,
 *     pas celles déjà commencées. Attendre que `pg_stat_activity` ne montre
 *     plus de transaction applicative active — quelques secondes en pratique,
 *     ces transactions sont courtes.
 *
 *  3. POINT DE RÉFÉRENCE. `npm run sauvegarde -- --fichiers` : c'est L'ÉTAT
 *     auquel un rollback ramènerait. Le prendre avant le gel n'aurait aucun
 *     sens ; le prendre après les écritures non plus.
 *
 *  4. MIGRER. Le migrateur LIT la source (gelée, cohérente) et ÉCRIT dans
 *     Cartiz — dont le propre mécanisme de gel, séparé, gère ses propres
 *     écritures. Rien ici ne le concerne.
 *
 *  5. CONTRÔLER. Témoins QR des cinq parcours, réconciliation des comptages,
 *     sondes de sécurité. Un seul rouge : on ne lève pas.
 *
 *  6. LEVER — et seulement après le GO.
 *     update public.maintenance set actif = false, depuis = null;
 *
 *  EN CAS DE ROLLBACK : revenir à l'ancienne application AVANT de lever le
 *  gel. Lever d'abord rouvrirait les écritures sur une application qu'on
 *  s'apprête à remplacer — et ces écritures-là, personne ne saurait les
 *  rattraper.
 */
