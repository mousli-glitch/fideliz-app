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
  -- Le laissez-passer du migrateur. Voir `refuser_pendant_maintenance()`.
  -- Nul en temps normal : sans jeton posé, aucune écriture ne passe le gel.
  jeton_migrateur text,
  -- Une seule ligne possible : un drapeau qui existerait en double serait un
  -- drapeau dont personne ne saurait lequel fait foi.
  constraint maintenance_ligne_unique check (id = true)
);

alter table public.maintenance add column if not exists jeton_migrateur text;

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
declare
  v_jeton text;
  v_presente text;
begin
  if public.maintenance_actif() then
    /*
     * ─── LE LAISSEZ-PASSER DU MIGRATEUR ───
     *
     * Le gel bloque tout le monde, y compris `service_role` — c'est tout son
     * intérêt. Mais le migrateur, lui, DOIT écrire pendant la fenêtre : il
     * n'aurait aucun autre moment pour le faire.
     *
     * Une exception pour `service_role` serait la pire réponse : c'est
     * l'identité que l'application entière utilise déjà, donc la protection
     * s'annulerait d'elle-même.
     *
     * D'où un jeton présenté PAR TRANSACTION :
     *
     *     begin;
     *     set local bascule.jeton = '<le jeton posé dans maintenance>';
     *     -- … les écritures du migrateur …
     *     commit;
     *
     * Trois propriétés en découlent. `set local` meurt avec la transaction :
     * rien à nettoyer, rien qui traîne. Le jeton vit en base et se change
     * entre deux bascules. Et l'application ne le pose jamais — elle ne le
     * connaît pas, il n'est dans aucune variable d'environnement.
     *
     * Le jeton est effacé à la levée du gel : hors bascule, `jeton_migrateur`
     * est nul, et un laissez-passer nul ne laisse passer personne.
     */
    select jeton_migrateur into v_jeton from public.maintenance where id;
    v_presente := nullif(current_setting('bascule.jeton', true), '');

    if v_jeton is not null and v_presente is not null and v_presente = v_jeton then
      return case tg_op when 'DELETE' then old else new end;
    end if;

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

-- ─────────────────────────────────────────────── qui peut toucher au drapeau

/*
 * La table est lisible par tous (l'application doit pouvoir afficher un
 * message honnête) et écrite par personne via PostgREST. Le basculement se
 * fait à la clé de service, depuis le runbook, et par rien d'autre.
 *
 * Sans ce revoke, `authenticated` hériterait des droits par défaut de
 * Supabase sur les nouvelles tables — et n'importe quel compte connecté
 * pourrait lever le gel ou se donner le laissez-passer.
 */
revoke all on public.maintenance from anon, authenticated;
grant select on public.maintenance to anon, authenticated;

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  L'ORDRE DES OPÉRATIONS — 6 h à 8 h, heure de Paris
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Les sept tables gelées vivent dans la base FIDELIZ. Le migrateur, lui,
 *  LIT Fideliz et ÉCRIT dans Cartiz : le gel de Fideliz ne le gêne donc pas.
 *  C'est le gel de CARTIZ — la même migration, appliquée là-bas — qu'il doit
 *  traverser, et c'est à cela que sert le jeton.
 *
 *  1. GELER LES DEUX BASES, Fideliz d'abord.
 *     update public.maintenance set actif = true, depuis = now(),
 *       message = '…', jeton_migrateur = <jeton tiré au hasard, jamais versionné>;
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
 *  4. MIGRER. Chaque transaction du migrateur présente le jeton :
 *       begin; set local bascule.jeton = '…'; … ; commit;
 *
 *  5. CONTRÔLER. Témoins QR des cinq parcours, réconciliation des comptages,
 *     sondes de sécurité. Un seul rouge : on ne lève pas.
 *
 *  6. LEVER — et seulement après le GO.
 *     update public.maintenance set actif = false, depuis = null,
 *       jeton_migrateur = null;
 *     Effacer le jeton fait partie de la levée : un laissez-passer qui
 *     survivrait à la bascule serait une porte laissée entrouverte.
 *
 *  EN CAS DE ROLLBACK : revenir à l'ancienne application AVANT de lever le
 *  gel. Lever d'abord rouvrirait les écritures sur une application qu'on
 *  s'apprête à remplacer — et ces écritures-là, personne ne saurait les
 *  rattraper.
 */
