/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  FERMER LA FENÊTRE ENTRE LA DERNIÈRE RÉATTRIBUTION ET LA SUPPRESSION AUTH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Signalé le 19/08/2026 : « aucune nouvelle référence created_by / owner_id /
 * user_id vers la cible ne doit pouvoir apparaître entre la dernière
 * réattribution et la suppression Auth, puis être emportée par cascade. Ne
 * suppose pas la sécurité à partir du seul ordre séquentiel TypeScript. »
 *
 * ─── CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE CETTE MIGRATION ───
 *
 * Inventaire des écritures applicatives sur les trois colonnes (19/08/2026,
 * relevé dans le code, pas supposé) :
 *
 *   create-restaurant.ts   owner_id = un compte Auth CRÉÉ À L'INSTANT
 *                          created_by = le commercial appelant
 *   admin-actions.ts       même forme
 *   repair-orphans.ts      owner_id = user_id = le root héritier
 *
 * Aucun chemin ne pose donc aujourd'hui un compte EXISTANT arbitraire dans
 * `restaurants.user_id` — la seule colonne qui CASCADE vers `auth.users`.
 * La fenêtre n'est pas atteignable par le code d'aujourd'hui.
 *
 * Ce n'est pas une garantie, c'est une coïncidence. Rien dans le schéma
 * n'empêche une action future d'écrire `user_id = <compte existant>` ; le
 * jour où elle existe, la fenêtre s'ouvre en silence et coûte un restaurant
 * entier avec ses jeux, ses lots, ses gagnants, ses clients et ses avis.
 * L'invariant est donc posé dans la BASE, où il ne dépend plus de ce que le
 * code se trouve faire.
 *
 * ─── POURQUOI UN SIMPLE MARQUEUR NE SUFFIT PAS ───
 *
 * Un marqueur « ce compte est en cours de suppression » + un trigger qui
 * refuse les rattachements laisse une course : une transaction déjà ouverte,
 * dont le trigger a lu le marqueur AVANT qu'il n'existe, peut committer
 * après nos réattributions. Sa ligne n'aura été ni refusée, ni réattribuée —
 * et la suppression Auth l'emportera.
 *
 * D'où la BARRIÈRE. `ouvrir_fenetre_suppression` pose le marqueur ET prend
 * `lock table public.restaurants in exclusive mode` dans la MÊME transaction.
 * Le verrou n'est relâché qu'au commit, c'est-à-dire à l'instant précis où
 * le marqueur devient visible. Il en découle deux choses, et elles se
 * rejoignent sans laisser d'intervalle :
 *
 *   — toute transaction qui écrivait déjà sur `restaurants` a terminé avant
 *     que le verrou ne soit accordé : sa ligne est committée, donc VISIBLE
 *     des réattributions qui suivent ;
 *
 *   — toute transaction qui commence à écrire ensuite voit le marqueur, et
 *     le trigger la refuse.
 *
 * EXCLUSIVE laisse passer les lectures (ACCESS SHARE) : seule l'écriture sur
 * `restaurants` est suspendue, le temps d'une transaction qui ne fait que
 * deux choses.
 *
 * ─── LE TRIGGER REFUSE LES NOUVELLES RÉFÉRENCES, PAS LES ANCIENNES ───
 *
 * Sur UPDATE, seules les colonnes qui CHANGENT sont examinées. Sans cette
 * distinction, la séquence se bloquerait elle-même : sa première étape écrit
 * `created_by = root` sur une ligne dont `owner_id` et `user_id` pointent
 * encore vers la cible, et un contrôle naïf de `NEW` les verrait comme des
 * rattachements interdits. Laisser en place une référence existante n'est
 * pas en créer une.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Migration AVANT le code. Sans les deux fonctions, `supprimerCompteEtReattribuer`
 * refuse d'ouvrir la fenêtre et s'arrête avant toute mutation : dégradation
 * sûre, mais totale — plus aucune suppression de compte ne passe.
 *
 * ─── HORS GEL ───
 *
 * `comptes_en_suppression` n'entre PAS dans le gel de bascule. C'est un
 * marqueur d'exécution, pas une donnée client : le geler empêcherait une
 * séquence de suppression en cours de REFERMER sa fenêtre, et laisserait
 * donc un compte marqué indéfiniment — c'est-à-dire tout rattachement futur
 * refusé, longtemps après la bascule. Elle n'est pas migrée vers Cartiz :
 * une fenêtre ouverte au moment de la bascule est une opération à terminer
 * avant, pas un état à transporter.
 *
 * MIGRATION ADDITIVE : aucune table existante n'est modifiée. Le trigger
 * s'ajoute à `restaurants` sous un nom distinct de `gel_de_bascule`, que les
 * scripts d'activation/levée du gel filtrent nommément — les deux couches ne
 * se voient pas.
 */

-- ─────────────────────────────────────────────── le marqueur, minimal

create table if not exists public.comptes_en_suppression (
  user_id   uuid primary key,
  ouvert_le timestamptz not null default now(),
  demandeur uuid
);

comment on table public.comptes_en_suppression is
  'Comptes dont la suppression est en cours. Une ligne ici interdit tout NOUVEAU rattachement de restaurant au compte, le temps que la séquence de suppression se termine.';

alter table public.comptes_en_suppression enable row level security;
alter table public.comptes_en_suppression force row level security;

revoke all on table public.comptes_en_suppression from public, anon, authenticated;
/*
 * Aucun droit direct, même à `service_role` : le marqueur ne se pose et ne se
 * retire que par les deux fonctions ci-dessous, qui portent la barrière. Un
 * INSERT direct poserait le marqueur SANS le verrou, c'est-à-dire sans la
 * seule chose qui rend l'invariant vrai.
 */
revoke all on table public.comptes_en_suppression from service_role;

-- ─────────────────────────────────────── le trigger : aucune NOUVELLE référence

create or replace function public.refuser_rattachement_a_un_compte_en_suppression()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_candidats uuid[];
begin
  if tg_op = 'INSERT' then
    v_candidats := array[new.user_id, new.owner_id, new.created_by];
  else
    -- Seules les colonnes qui changent créent une référence.
    v_candidats := array[]::uuid[];
    if new.user_id    is distinct from old.user_id    then v_candidats := v_candidats || new.user_id;    end if;
    if new.owner_id   is distinct from old.owner_id   then v_candidats := v_candidats || new.owner_id;   end if;
    if new.created_by is distinct from old.created_by then v_candidats := v_candidats || new.created_by; end if;
  end if;

  if array_length(v_candidats, 1) is null then
    return new;                     -- rien de pertinent n'a bougé
  end if;

  perform 1 from public.comptes_en_suppression s where s.user_id = any (v_candidats);
  if found then
    raise exception using
      errcode = 'P0103',
      message = 'Ce compte est en cours de suppression : aucun restaurant ne peut lui être rattaché.',
      hint    = 'compte_en_suppression';
  end if;

  return new;
end;
$$;

revoke all on function public.refuser_rattachement_a_un_compte_en_suppression() from public, anon, authenticated, service_role;

drop trigger if exists fenetre_de_suppression on public.restaurants;
create trigger fenetre_de_suppression
  before insert or update on public.restaurants
  for each row execute function public.refuser_rattachement_a_un_compte_en_suppression();

-- ───────────────────────────────────────── ouvrir : marqueur + BARRIÈRE

create or replace function public.ouvrir_fenetre_suppression(p_user_id uuid, p_demandeur uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then
    raise exception using errcode = 'P0104', message = 'Compte cible manquant : fenêtre non ouverte.';
  end if;

  insert into public.comptes_en_suppression (user_id, demandeur)
  values (p_user_id, p_demandeur)
  on conflict (user_id) do update set ouvert_le = now(), demandeur = excluded.demandeur;

  /*
   * LA BARRIÈRE. Le verrou n'est relâché qu'au commit de cette transaction,
   * donc à l'instant où le marqueur devient visible : il n'existe aucun
   * intervalle pendant lequel une écriture pourrait passer sans être vue.
   * Voir l'en-tête pour le raisonnement complet.
   */
  lock table public.restaurants in exclusive mode;
end;
$$;

comment on function public.ouvrir_fenetre_suppression(uuid, uuid) is
  'Pose le marqueur de suppression ET attend que toute écriture en cours sur restaurants soit terminée. À appeler avant les réattributions.';

-- ───────────────────────────────────────────────────── fermer, idempotent

create or replace function public.fermer_fenetre_suppression(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then
    return;                          -- rien à fermer, et rien à signaler
  end if;
  delete from public.comptes_en_suppression where user_id = p_user_id;
end;
$$;

comment on function public.fermer_fenetre_suppression(uuid) is
  'Retire le marqueur. Idempotent : fermer une fenêtre déjà fermée n''est pas une erreur.';

revoke all on function public.ouvrir_fenetre_suppression(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fermer_fenetre_suppression(uuid) from public, anon, authenticated;
grant execute on function public.ouvrir_fenetre_suppression(uuid, uuid) to service_role;
grant execute on function public.fermer_fenetre_suppression(uuid) to service_role;

notify pgrst, 'reload schema';
