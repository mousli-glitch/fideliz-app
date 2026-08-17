-- ═══════════════════════════════════════════════════════════════════════
--  LE GEL DE BASCULE — imposé par la base, pas par l'écran
-- ═══════════════════════════════════════════════════════════════════════
--
--  ⚠ CETTE MIGRATION N'EST PAS APPLIQUÉE EN PRODUCTION.
--    Elle est écrite, testée sur la branche temporaire, et appliquée le jour
--    de la bascule — jamais avant. Tant que `actif = false`, elle ne fait
--    rigoureusement rien.
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
  id           boolean primary key default true,
  actif        boolean not null default false,
  message      text    not null default 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.',
  depuis       timestamptz,
  par          uuid,
  -- Une seule ligne possible : un drapeau qui existerait en double serait un
  -- drapeau dont personne ne saurait lequel fait foi.
  constraint maintenance_ligne_unique check (id = true)
);

insert into public.maintenance (id, actif) values (true, false)
on conflict (id) do nothing;

alter table public.maintenance enable row level security;

-- Tout le monde peut LIRE l'état : l'application doit pouvoir afficher un
-- message honnête sans être authentifiée.
drop policy if exists maintenance_lecture_publique on public.maintenance;
create policy maintenance_lecture_publique on public.maintenance
  for select using (true);

-- Personne ne l'écrit par la RLS : le basculement passe par la clé de
-- service, depuis le runbook, et par rien d'autre.

-- ───────────────────────────────────────────────────── la garde elle-même

create or replace function public.maintenance_actif()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce((select actif from public.maintenance where id), false) $$;

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
   * `system_logs` n'y est PAS : le journal doit continuer d'écrire pendant
   * la bascule, c'est même le moment où on en a le plus besoin.
   * `maintenance` non plus, sans quoi on ne pourrait plus lever le gel.
   */
  tables text[] := array[
    'winners',      -- participations, gains, validations, consommations
    'contacts',     -- inscriptions clients
    'prizes',       -- stocks des lots
    'games',        -- configuration des jeux
    'restaurants',  -- réglages, abonnements, jetons
    'profiles',     -- comptes et rôles
    'avis'          -- miroir des avis Google (le cron écrit ici)
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
  'Drapeau unique du gel de bascule. actif = true fait echouer toute ecriture sur les tables metier, y compris via service_role et RPC — les triggers ne se contournent pas. Les lectures restent ouvertes : menus, QR et /verify continuent de repondre.';
