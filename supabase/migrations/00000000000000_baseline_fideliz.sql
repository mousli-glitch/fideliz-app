-- ═══════════════════════════════════════════════════════════════════════
--  BASELINE FIDELIZ — l'état AVANT la première migration enregistrée
-- ═══════════════════════════════════════════════════════════════════════
--
--  Fideliz n'a jamais eu de migrations. Son schéma a été construit à la main
--  dans le tableau de bord Supabase entre décembre 2025 et juillet 2026 ;
--  le registre ne commence qu'au 24/07/2026, avec `create_avis_mirror_table`.
--
--  Conséquence mesurée le 18/08/2026 : une branche Supabase créée depuis ce
--  projet rejoue les huit migrations du registre sur une base vierge, et
--  ÉCHOUE dès la première — `avis` référence `public.restaurants(id)`, une
--  table qu'aucune migration ne crée. Branche `bngtokpnuebvvxbtnayn` :
--  statut MIGRATIONS_FAILED, 0 table, 0 fonction, 0 policy, registre vide.
--
--  Ce fichier comble ce trou. Il décrit l'état du schéma tel qu'il était
--  JUSTE AVANT le 24/07/2026, de sorte que les huit migrations historiques
--  se rejouent ensuite verbatim, dans l'ordre, sans rien réappliquer deux
--  fois.
--
--  ─── POURQUOI L'ÉTAT ANTÉRIEUR, ET NON L'ÉTAT FINAL ───
--
--  Une baseline reflétant le schéma d'aujourd'hui obligerait à neutraliser
--  les huit migrations — les rendre idempotentes après coup, ou les déclarer
--  appliquées sans les exécuter. Les deux abîment ce qui a le plus de
--  valeur : leur caractère verbatim.
--
--  En partant de l'état antérieur, on obtient une preuve double. Si
--  baseline + huit migrations reproduit la production, alors la baseline est
--  juste ET les huit fichiers récupérés du registre le sont aussi.
--
--  ─── CE QUI EST VOLONTAIREMENT ABSENT ───
--
--  Tout ce que les huit migrations ajoutent :
--    · la table `avis`, ses deux index et sa RLS       (20260724002837)
--    · restaurants.google_reviews_avg / _total / _synced_at (20260724002837)
--    · restaurants.auto_reply_since                    (20260724132406)
--    · games.wheel_color_1 / _2                        (20260731002821)
--    · games.stock_refill_enabled / _period / _last_at (20260802115534)
--    · restaurants.auto_reply_* (six colonnes)         (20260802121539)
--    · games.requires_review_proof                     (20260816120110)
--    · la version durcie de handle_new_user_profile    (20260817230642)
--    · les REVOKE sur _log_event et archive_redeemed_winners (20260817235046)
--
--  ─── LES DÉFAUTS SONT CONSERVÉS ───
--
--  Une baseline explique l'histoire ; elle ne la corrige pas. On garde donc
--  tels quels : les deux CHECK contradictoires de `winners` (leur
--  intersection interdit l'état `consumed`), la double clé étrangère de
--  `restaurants.created_by`, les policies trop larges, les fonctions sans
--  `search_path`, et `handle_new_user_profile` lisant le rôle dans les
--  métadonnées du client. Chacun est corrigé par une migration datée, à sa
--  place dans la chronologie.

-- ───────────────────────────────────────────────── chemin de recherche
--
-- La base porte `"$user", public, extensions` comme search_path par défaut :
-- c'est ce qui permet à `gen_random_bytes` — fournie par pgcrypto, installée
-- dans `extensions` — d'être appelée sans qualification dans le DEFAULT de
-- `winners.qr_code`.
--
-- Le runner de migration, lui, ouvre sa session avec un chemin plus étroit.
-- Sans la ligne ci-dessous, la baseline échoue sur cette table précise —
-- constaté le 18/08/2026, statement 8, `function gen_random_bytes(integer)
-- does not exist`.
--
-- On le pose donc explicitement, pour que la baseline soit autonome quel que
-- soit le runner. `set local` meurt avec la transaction de la migration.
set local search_path = public, extensions;

-- ──────────────────────────────────────────── privilèges par défaut
--
-- C'est le vrai mécanisme, et il explique tout. La production ne porte pas
-- de grants explicites sur ses tables : elle a des DEFAULT PRIVILEGES posés
-- par `postgres` sur le schéma `public`, relevés tels quels :
--
--   anon          = arwdm     → INSERT, SELECT, UPDATE, DELETE, MAINTAIN
--   authenticated = arwdm     → les mêmes cinq
--   service_role  = arwdDxtm  → les huit
--
-- Toute relation créée ensuite en hérite — y compris `avis`, que la première
-- migration crée et qui n'apparaît donc dans aucun grant. C'est pourquoi ces
-- lignes viennent AVANT les tables : les poser après ne rattraperait rien.
--
-- Les restrictions réelles se font ensuite, par retrait ciblé.

alter default privileges in schema public
  grant insert, select, update, delete, maintain on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select, update on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────── extensions

create extension if not exists "uuid-ossp"     with schema extensions;
create extension if not exists pgcrypto        with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pg_net          with schema extensions;
-- pg_cron n'existe que sur le projet principal : une branche ne le porte pas.
-- Les cinq tâches sont décrites dans docs/, pas ici.

-- ──────────────────────────────────────────────────────────────── tables

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  slug text not null,
  brand_color text default '#000000',
  text_color text default '#FFFFFF',
  logo_url text,
  bg_image_url text,
  created_at timestamptz default now(),
  primary_color text default '#000000',
  owner_id uuid,
  color_primary text default '#3b82f6',
  created_by uuid,
  is_active boolean default true,
  city text,
  google_clicks integer default 0,
  tiktok_clicks integer default 0,
  instagram_clicks integer default 0,
  facebook_clicks integer default 0,
  alert_threshold_days integer default 7,
  is_retention_alert_enabled boolean default false,
  internal_notes text,
  google_access_token text,
  google_refresh_token text,
  google_location_id text,
  ai_tone text default 'amical',
  ai_enabled boolean default false,
  blocked_at timestamptz,
  blocked_reason text,
  google_token_expires_at bigint,
  is_blocked boolean not null default false,
  avg_basket numeric default 15,
  contact_email text,
  subscription_end timestamptz,
  subscription_plan text,
  replay_enabled boolean default false,
  replay_delay_hours integer default 24,
  action_sequence jsonb,
  identify_first boolean default false,
  ip_rate_limit_per_hour integer default 5,
  auto_reply_enabled boolean default false,
  auto_reply_tone text default 'amical',
  auto_reply_min_rating integer default 4
);

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  role text default 'restaurant',
  restaurant_id uuid,
  created_at timestamptz default now(),
  is_active boolean default true
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  status text default 'draft',
  active_action text not null,
  action_url text,
  validity_days integer default 30,
  min_spend text,
  created_at timestamptz default now(),
  end_date timestamptz,
  name text,
  bg_choice integer default 0,
  title_style text default 'STYLE_1',
  bg_image_url text,
  card_style text default 'LIGHT',
  wheel_palette text default 'MONACO',
  start_date timestamptz,
  is_date_limit_active boolean default false,
  is_stock_limit_active boolean default false,
  replay_enabled boolean default false,
  replay_delay_hours integer default 24,
  action_sequence jsonb,
  overlay_style text default 'dark',
  ip_rate_limit_per_hour integer default 5,
  identify_first boolean default false,
  requires_menu boolean default false
);

create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  label text not null,
  color text default '#FF5733',
  weight integer not null default 1,
  quantity integer,
  created_at timestamptz default now(),
  initial_quantity integer
);

create table if not exists public.winners (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  prize_id uuid,
  first_name text not null,
  phone text,
  email text,
  marketing_optin boolean default false,
  qr_code text not null default encode(gen_random_bytes(16), 'hex'),
  status text default 'available',
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz default now(),
  consumed_at timestamptz,
  prize_label_snapshot text,
  deleted_at timestamptz,
  assigned_action text,
  ip_hash text
);

create table if not exists public.winners_archive (
  id uuid primary key,
  archived_at timestamptz not null default now(),
  created_at timestamptz,
  redeemed_at timestamptz,
  restaurant_id uuid,
  game_id uuid,
  first_name text,
  email text,
  status text,
  prize_label_snapshot text,
  prize_color_snapshot text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  email text,
  phone text,
  first_name text,
  marketing_optin boolean default false,
  source_game_id uuid,
  created_at timestamptz default now(),
  deleted_at timestamptz,
  marketing_optin_at timestamptz,
  last_submitted_at timestamptz
);

create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  restaurant_id uuid not null,
  sales_id uuid not null,
  note text not null
);

create table if not exists public.sales_restaurants (
  sales_user_id uuid not null,
  restaurant_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  level text default 'error',
  message text not null,
  details jsonb,
  restaurant_slug text,
  user_id uuid,
  action_type text not null default 'INFO',
  user_email text,
  restaurant_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

/*
 * La clé primaire s'appelle `activity_logs_pkey`, sans le `_legacy` : la
 * table a été renommée en production, et renommer une table ne renomme pas
 * ses contraintes. Sans le nom explicite, PostgreSQL déduirait
 * `activity_logs_legacy_pkey` du nom actuel — et l'index qui la porte
 * changerait de nom avec elle. C'est ce seul détail qui faisait diverger les
 * empreintes des contraintes ET des index.
 */
create table if not exists public.activity_logs_legacy (
  id uuid constraint activity_logs_pkey primary key default gen_random_uuid(),
  action_type text not null,
  admin_id uuid,
  target_id uuid,
  details text,
  created_at timestamptz default now(),
  user_email text,
  user_role text,
  restaurant_id uuid,
  entity_type text,
  metadata jsonb default '{}'::jsonb,
  entity_id uuid
);

-- Sauvegardes manuelles du 06/06/2026, restées en place. Elles portent des
-- données personnelles réelles et ne sont référencées par aucun code : leur
-- retrait est un chantier à part, pas une décision de baseline.
create table if not exists public.winners_backup_20260606 (
  id uuid, game_id uuid, prize_id uuid, first_name text, phone text, email text,
  marketing_optin boolean, qr_code text, status text, expires_at timestamptz,
  redeemed_at timestamptz, created_at timestamptz, consumed_at timestamptz,
  prize_label_snapshot text, deleted_at timestamptz
);
create table if not exists public.contacts_backup_20260606 (
  id uuid, restaurant_id uuid, email text, phone text, first_name text,
  marketing_optin boolean, source_game_id uuid, created_at timestamptz,
  deleted_at timestamptz, marketing_optin_at timestamptz, last_submitted_at timestamptz
);
create table if not exists public.auth_ghosts_backup_20260606 (
  id uuid, email varchar(255), created_at timestamptz
);
create table if not exists public.auth_orphan_backup_20260606 (
  id uuid, email varchar(255), created_at timestamptz
);

-- ─────────────────────────────────────────── contraintes et clés étrangères

alter table public.restaurants
  add constraint restaurants_slug_key unique (slug),
  add constraint restaurants_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint restaurants_owner_id_fkey foreign key (owner_id) references auth.users(id);

-- Deux clés étrangères identiques sur created_by. Doublon historique,
-- conservé tel quel : la baseline explique, elle ne nettoie pas.
alter table public.restaurants
  add constraint fk_commercial foreign key (created_by) references public.profiles(id) on delete set null,
  add constraint restaurants_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.profiles
  add constraint profiles_email_key unique (email),
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  add constraint profiles_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete set null,
  add constraint profiles_role_check check (role = any (array['root'::text, 'sales'::text, 'restaurant'::text]));

alter table public.games
  add constraint games_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  add constraint games_status_check check (status = any (array['active'::text, 'inactive'::text, 'archived'::text, 'ended'::text]));

alter table public.prizes
  add constraint prizes_game_id_fkey foreign key (game_id) references public.games(id) on delete cascade;

-- Les deux CHECK de `winners` se contredisent : leur intersection interdit
-- l'état `consumed`, que `archive_redeemed_winners()` archive pourtant, et
-- que la colonne `consumed_at` prétend accueillir. Conservés tels quels.
alter table public.winners
  add constraint winners_qr_code_key unique (qr_code),
  add constraint winners_game_id_fkey foreign key (game_id) references public.games(id) on delete cascade,
  add constraint winners_prize_id_fkey foreign key (prize_id) references public.prizes(id) on delete set null,
  add constraint check_winner_status check (status = any (array['available'::text, 'redeemed'::text, 'consumed'::text])),
  add constraint winners_status_check check (status = any (array['available'::text, 'redeemed'::text]));

alter table public.contacts
  add constraint contacts_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  add constraint contacts_restaurant_id_email_key unique (restaurant_id, email),
  add constraint contacts_restaurant_id_phone_key unique (restaurant_id, phone);

alter table public.sales_restaurants
  add constraint sales_restaurants_pkey primary key (sales_user_id, restaurant_id),
  add constraint sales_restaurants_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  add constraint sales_restaurants_sales_user_id_fkey foreign key (sales_user_id) references auth.users(id) on delete cascade;

alter table public.activity_logs_legacy
  add constraint activity_logs_admin_id_fkey foreign key (admin_id) references auth.users(id) on delete set null,
  add constraint activity_logs_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade;

-- ───────────────────────────────────────────────────────────────── index

-- La règle « un seul jeu actif par restaurant » est garantie par Postgres,
-- pas seulement par le code : c'est un index unique partiel.
create unique index if not exists one_active_game_per_restaurant
  on public.games (restaurant_id) where (status = 'active');

create index if not exists contacts_restaurant_created_at_idx on public.contacts (restaurant_id, created_at desc);
create index if not exists contacts_restaurant_created_id_desc_idx on public.contacts (restaurant_id, created_at desc, id desc);
create index if not exists idx_activity_logs_admin_id on public.activity_logs_legacy (admin_id);
create index if not exists idx_activity_logs_restaurant_id on public.activity_logs_legacy (restaurant_id);
create index if not exists idx_gam_res_status on public.games (restaurant_id, status);
create index if not exists idx_logs_action on public.activity_logs_legacy (action_type);
create index if not exists idx_prizes_game_id on public.prizes (game_id);
create index if not exists idx_profiles_restaurant_id on public.profiles (restaurant_id);
create index if not exists idx_res_active_blocked on public.restaurants (is_active, blocked_at);
create index if not exists idx_restaurants_created_by on public.restaurants (created_by);
create index if not exists idx_restaurants_owner_id on public.restaurants (owner_id);
create index if not exists idx_restaurants_user_id on public.restaurants (user_id);
create index if not exists idx_sales_restaurants_restaurant_id on public.sales_restaurants (restaurant_id);
create index if not exists idx_sales_restaurants_sales_user_id on public.sales_restaurants (sales_user_id);
create index if not exists idx_winners_prize_id on public.winners (prize_id);
create index if not exists system_logs_action_type_idx on public.system_logs (action_type);
create index if not exists system_logs_created_at_idx on public.system_logs (created_at desc);
create index if not exists system_logs_restaurant_id_idx on public.system_logs (restaurant_id);
create index if not exists winners_archive_archived_at_idx on public.winners_archive (archived_at desc);
create index if not exists winners_archive_email_idx on public.winners_archive (email);
create index if not exists winners_archive_game_id_idx on public.winners_archive (game_id);
create index if not exists winners_created_at_id_idx on public.winners (created_at desc, id desc);
create index if not exists winners_game_created_at_idx on public.winners (game_id, created_at desc, id desc);
create index if not exists winners_ip_hash_created_idx on public.winners (ip_hash, created_at);

-- ─────────────────────────────────────────────────────────────── fonctions

create or replace function public."current_role"()
returns text language sql stable set search_path to 'public'
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'anon'
  );
$$;

create or replace function public.current_restaurant_id()
returns uuid language sql stable set search_path to 'public'
as $$ select restaurant_id from public.profiles where id = auth.uid(); $$;

create or replace function public.is_root()
returns boolean language sql stable set search_path to 'public'
as $$ select public.current_role() = 'root'; $$;

create or replace function public.is_sales()
returns boolean language sql stable set search_path to 'public'
as $$ select public.current_role() = 'sales'; $$;

-- Sans search_path figé, comme en production. Non exploitable : SECURITY
-- INVOKER, donc aucune élévation possible. Durcissement dans une migration
-- ultérieure.
create or replace function public.is_restaurant_user()
returns boolean language sql stable
as $$ select public.current_role() = 'restaurant'; $$;

create or replace function public.check_restaurant_status()
returns json language sql stable set search_path to 'public'
as $$
  select json_build_object(
    'is_blocked',
    coalesce(r.is_blocked, false),
    'restaurant_id',
    p.restaurant_id
  )
  from public.profiles p
  left join public.restaurants r on r.id = p.restaurant_id
  where p.id = auth.uid();
$$;

create or replace function public.check_restaurant_status(slug_input text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
DECLARE
  v_blocked_at timestamptz;
  v_id uuid;
BEGIN
  SELECT id, blocked_at INTO v_id, v_blocked_at
  FROM public.restaurants
  WHERE slug = slug_input;

  -- Si le resto n'existe pas, on renvoie une erreur
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('is_blocked', true, 'reason', 'not_found');
  END IF;

  -- On renvoie le vrai statut sans filtre
  RETURN jsonb_build_object(
    'is_blocked', (v_blocked_at IS NOT NULL),
    'restaurant_id', v_id
  );
END;
$$;

create or replace function public._log_event(
  p_level text, p_action_type text, p_message text, p_user_id uuid,
  p_user_email text, p_restaurant_id uuid, p_metadata jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.system_logs(
    level, action_type, message, user_id, user_email, restaurant_id, metadata
  )
  values (
    coalesce(p_level,'info'),
    coalesce(p_action_type,'INFO'),
    coalesce(p_message,''),
    p_user_id,
    p_user_email,
    p_restaurant_id,
    coalesce(p_metadata,'{}'::jsonb)
  );
end;
$$;

create or replace function public.set_prize_initial_quantity()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.initial_quantity is null then new.initial_quantity := new.quantity; end if;
  return new;
end;
$$;

-- Sans search_path figé, comme en production. SECURITY INVOKER.
create or replace function public.set_marketing_optin_at()
returns trigger language plpgsql
as $$
begin
  -- si on passe à true et que la date n'est pas encore remplie
  if new.marketing_optin = true and old.marketing_optin is distinct from true and new.marketing_optin_at is null then
    new.marketing_optin_at = now();
  end if;
  return new;
end;
$$;

-- ⚠ ÉTAT HISTORIQUE : le rôle vient de raw_user_meta_data, c'est-à-dire de
-- ce que le client envoie à l'inscription. Corrigé par la migration
-- 20260817230642. Conservé ici parce qu'une baseline explique l'histoire.
create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, role, restaurant_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'restaurant'),  -- défaut VALIDE
    (new.raw_user_meta_data->>'restaurant_id')::uuid
  );
  return new;
end;
$$;

-- Sans search_path figé, et SECURITY DEFINER. Non exploitable : elle se
-- déclenche sur DELETE de profiles, que la RLS refuse à tout rôle non
-- privilégié (les sept policies de profiles sont toutes SELECT).
create or replace function public.handle_deleted_commercial()
returns trigger language plpgsql security definer
as $$
BEGIN
    UPDATE public.restaurants
    SET created_by = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid,
        owner_id = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid
    WHERE created_by = OLD.id OR owner_id = OLD.id;
    RETURN OLD;
END;
$$;

-- Sans search_path figé, SECURITY DEFINER, et ATTACHÉE À AUCUN TRIGGER.
-- Elle insère dans public.activity_logs — une table qui n'existe pas ; la
-- table s'appelle activity_logs_legacy. L'échec est avalé par le EXCEPTION
-- WHEN OTHERS. Elle n'a donc jamais rien journalisé.
create or replace function public.fn_audit_restaurant_changes()
returns trigger language plpgsql security definer
as $$
BEGIN
    -- 1. SECURITÉ : Si le restaurant est bloqué, on termine les campagnes
    IF (NEW.blocked_at IS NOT NULL) THEN
        UPDATE public.games 
        SET status = 'ended' 
        WHERE restaurant_id = NEW.id 
          AND status = 'active';
    END IF;

    -- 2. VOTRE LOGIQUE D'AUDIT (Inchangée, telle que dans votre CSV)
    BEGIN
        INSERT INTO public.activity_logs (
            user_id, user_email, user_role, action_type, 
            entity_id, entity_type, restaurant_id, metadata
        ) VALUES (
            auth.uid(),
            (SELECT email FROM public.profiles WHERE id = auth.uid()),
            (SELECT role FROM public.profiles WHERE id = auth.uid()),
            CASE 
                WHEN (OLD.blocked_at IS NULL AND NEW.blocked_at IS NOT NULL) THEN 'RESTAURANT_BLOCKED'
                WHEN (OLD.blocked_at IS NOT NULL AND NEW.blocked_at IS NULL) THEN 'RESTAURANT_UNBLOCKED'
                ELSE 'RESTAURANT_UPDATED'
            END,
            NEW.id, 'restaurant', NEW.id,
            jsonb_build_object('name', NEW.name, 'reason', NEW.blocked_reason)
        );
    EXCEPTION WHEN OTHERS THEN
        -- On ne bloque pas la transaction si le log échoue
        RETURN NEW;
    END;

    RETURN NEW;
END;
$$;

create or replace function public.trg_log_profile_active()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_action text;
  v_level  text;
  v_actor_id uuid;
  v_actor_email text;
begin
  if new.is_active is distinct from old.is_active then

    -- Acteur (celui qui déclenche l'update) si dispo
    begin
      v_actor_id := auth.uid();
    exception when others then
      v_actor_id := null;
    end;

    begin
      v_actor_email := nullif(current_setting('request.jwt.claim.email', true), '');
    exception when others then
      v_actor_email := null;
    end;

    if new.is_active = false then
      v_action := 'USER_DISABLED';
      v_level  := 'warning';
    else
      v_action := 'USER_ENABLED';
      v_level  := 'info';
    end if;

    perform public._log_event(
      v_level,
      v_action,
      case when new.is_active = false
        then 'Compte utilisateur désactivé'
        else 'Compte utilisateur réactivé'
      end,
      v_actor_id,
      v_actor_email,
      null,
      jsonb_build_object(
        'target_user_id', new.id,
        'old_is_active', old.is_active,
        'new_is_active', new.is_active
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.trg_log_restaurant_block()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_action text;
  v_level  text;
  v_user_id uuid;
  v_user_email text;
begin
  if new.is_blocked is distinct from old.is_blocked then

    -- Essayez de récupérer l'identité de l'acteur si présent (PostgREST/JWT)
    begin
      v_user_id := auth.uid();
    exception when others then
      v_user_id := null;
    end;

    begin
      v_user_email := nullif(current_setting('request.jwt.claim.email', true), '');
    exception when others then
      v_user_email := null;
    end;

    if new.is_blocked = true then
      v_action := 'RESTAURANT_BLOCKED';
      v_level  := 'warning';
    else
      v_action := 'RESTAURANT_UNBLOCKED';
      v_level  := 'info';
    end if;

    perform public._log_event(
      v_level,
      v_action,
      -- Message "humain" (tu peux ajuster)
      case when new.is_blocked = true
        then 'Accès établissement suspendu'
        else 'Accès établissement réactivé'
      end,
      v_user_id,
      v_user_email,
      new.id,
      jsonb_build_object(
        'restaurant_name', new.name,
        'restaurant_slug', new.slug,
        'old_is_blocked', old.is_blocked,
        'new_is_blocked', new.is_blocked
      )
    );
  end if;

  return new;
end;
$$;

-- Appelle get_my_role(), qui N'EXISTE PAS dans cette base : tout appel lève
-- une erreur. Conservée telle quelle — c'est l'état historique.
--
-- PostgreSQL valide le corps des fonctions `language sql` à la création. Sans
-- la ligne ci-dessous, la baseline échouerait ici — sur une fonction qui est
-- déjà cassée en production. On désactive donc la validation le temps de la
-- créer, plutôt que de « réparer » en douce une fonction que la baseline a
-- pour mission de décrire telle qu'elle est.
set local check_function_bodies = off;

create or replace function public.get_sales_stats()
returns table(restaurant_id uuid, winners_count bigint, last_winner_at timestamptz)
language sql security definer set search_path to 'public'
as $$
  select r.id,
    count(w.id) filter (where w.deleted_at is null) as winners_count,
    max(w.created_at) filter (where w.deleted_at is null) as last_winner_at
  from restaurants r
  left join games g on g.restaurant_id = r.id
  left join winners w on w.game_id = g.id
  where r.created_by = auth.uid() and get_my_role() = 'sales'
  group by r.id;
$$;

reset check_function_bodies;


-- ────────────────────────── les six fonctions oubliées au premier passage
--
-- Provenance : définition vivante de la production, non modifiée par les
-- huit migrations historiques — aucune ne les crée ni ne les remplace, elles
-- n'ajoutent que des colonnes, la table `avis`, la nouvelle version de
-- `handle_new_user_profile` et deux `revoke`. Leur définition d'aujourd'hui
-- EST donc leur définition d'avant le 24/07/2026.
--
-- Elles manquaient à la première version de cette baseline. La reconstruction
-- sur base vierge les a trouvées en trois minutes, là où un diff de comptage
-- les aurait laissées passer : `revoke` sur `archive_redeemed_winners` a
-- échoué faute de fonction à révoquer.
--
-- Leurs ACL sont ici celles d'AVANT : accordées à PUBLIC par le `grant all on
-- all functions` en fin de fichier. C'est la migration 20260817235046 qui les
-- retire ensuite — la chronologie est respectée.

CREATE OR REPLACE FUNCTION public.activate_game(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_restaurant_id UUID;
  v_owner_id UUID;
BEGIN
  -- A. Vérifier ownership (Sécurité indispensable car SECURITY DEFINER)
  SELECT restaurant_id INTO v_restaurant_id
  FROM games
  WHERE id = p_game_id;

  -- On vérifie que le restaurant appartient bien au user connecté
  SELECT user_id INTO v_owner_id
  FROM restaurants
  WHERE id = v_restaurant_id;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  -- B. Désactiver TOUS les jeux actifs de ce restaurant (sauf celui-ci s'il l'est déjà)
  UPDATE games
  SET status = 'ended'
  WHERE restaurant_id = v_restaurant_id
    AND status = 'active'
    AND id != p_game_id;

  -- C. Activer le jeu cible
  UPDATE games
  SET status = 'active'
  WHERE id = p_game_id;

END;
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_expired_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_winners int; v_contacts int;
begin
  -- Participations & tickets : anonymiser 24 mois après expiration (ou création)
  update winners
    set first_name = 'Anonyme', email = null, phone = null, marketing_optin = false
  where first_name is distinct from 'Anonyme'
    and coalesce(expires_at, created_at) < now() - interval '24 months';
  get diagnostics v_winners = row_count;

  -- Contacts : 36 mois après dernière activité si consentement marketing, sinon 24 mois
  update contacts
    set first_name = 'Anonyme', email = null, phone = null
  where first_name is distinct from 'Anonyme'
    and coalesce(last_submitted_at, created_at) <
        now() - (case when marketing_optin then interval '36 months' else interval '24 months' end);
  get diagnostics v_contacts = row_count;

  return jsonb_build_object('winners_anonymises', v_winners, 'contacts_anonymises', v_contacts, 'execute_le', now());
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_redeemed_winners(p_days integer DEFAULT 90, p_batch integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cutoff timestamptz := now() - make_interval(days => p_days);
  v_archived int := 0;
begin

  with candidates as (
    select
      w.id, w.created_at, w.redeemed_at, w.game_id, w.first_name, w.email,
      w.status, w.prize_label_snapshot, null::text as prize_color_snapshot
    from public.winners w
    where
      (w.status = 'redeemed' or w.status = 'consumed')
      and coalesce(w.redeemed_at, w.created_at) < v_cutoff
    order by coalesce(w.redeemed_at, w.created_at) asc, w.id asc
    limit p_batch
  ),
  inserted as (
    insert into public.winners_archive (
      id, archived_at, created_at, redeemed_at, restaurant_id, game_id,
      first_name, email, status, prize_label_snapshot, prize_color_snapshot
    )
    select
      c.id, now(), c.created_at, c.redeemed_at, g.restaurant_id, c.game_id,
      c.first_name, c.email, c.status, c.prize_label_snapshot, c.prize_color_snapshot
    from candidates c
    left join public.games g on g.id = c.game_id
    on conflict (id) do nothing
    returning id
  ),
  deleted as (
    delete from public.winners w
    where w.id in (select id from inserted)
    returning w.id
  )
  select count(*) into v_archived from deleted;

  return v_archived;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_replay_status(p_game_id uuid, p_email text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game games%rowtype;
  v_last timestamptz;
  v_count int := 0;
  v_seq jsonb;
  v_len int;
  v_action jsonb;
  v_hours_left int;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return jsonb_build_object('error','game_not_found'); end if;
  if not coalesce(v_game.replay_enabled,false) then
     return jsonb_build_object('replay', false);
  end if;

  select max(created_at), count(*) into v_last, v_count from winners
   where game_id = p_game_id
     and ( (p_email is not null and p_email <> '' and lower(email)=lower(p_email))
        or (p_phone is not null and p_phone <> '' and phone = p_phone) );

  if v_last is not null and v_last > now() - (coalesce(v_game.replay_delay_hours,24)||' hours')::interval then
     v_hours_left := ceil(extract(epoch from (v_last + (coalesce(v_game.replay_delay_hours,24)||' hours')::interval - now()))/3600.0);
     return jsonb_build_object('replay', true, 'status','too_soon','hours_left', v_hours_left);
  end if;

  v_seq := v_game.action_sequence;
  if v_seq is not null and jsonb_typeof(v_seq)='array' and jsonb_array_length(v_seq) > 0 then
     v_len := jsonb_array_length(v_seq);
     v_action := v_seq -> (v_count % v_len);
     return jsonb_build_object('replay', true, 'status','ok', 'play_count', v_count,
       'action', v_action->>'action', 'action_url', v_action->>'url');
  else
     return jsonb_build_object('replay', true, 'status','ok', 'play_count', v_count,
       'action', v_game.active_action, 'action_url', v_game.action_url);
  end if;
end;
$function$;


CREATE OR REPLACE FUNCTION public.play_game(p_game_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game games%rowtype;
  v_prize prizes%rowtype;
  v_prize_id uuid;
  v_expires_at timestamptz;
  v_min_spend int;
  v_winner_id uuid;
  v_last timestamptz;
  v_hours_left int;
  v_count int := 0;
  v_seq jsonb; v_len int; v_assigned text;
  v_total int; v_r numeric;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return jsonb_build_object('success', false, 'error', 'game_not_found'); end if;

  v_assigned := v_game.active_action;

  -- Éligibilité (identique à register_win)
  if coalesce(v_game.replay_enabled, false) then
    select max(created_at), count(*) into v_last, v_count from winners
      where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) );
    if v_last is not null and v_last > now() - (coalesce(v_game.replay_delay_hours, 24) || ' hours')::interval then
      v_hours_left := ceil(extract(epoch from (v_last + (coalesce(v_game.replay_delay_hours,24)||' hours')::interval - now())) / 3600.0);
      return jsonb_build_object('success', false, 'error', 'replay_too_soon', 'hours_left', v_hours_left);
    end if;
    v_seq := v_game.action_sequence;
    if v_seq is not null and jsonb_typeof(v_seq) = 'array' and jsonb_array_length(v_seq) > 0 then
      v_len := jsonb_array_length(v_seq);
      v_assigned := (v_seq -> (v_count % v_len)) ->> 'action';
    end if;
  else
    if exists (
      select 1 from winners where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) )
    ) then
      return jsonb_build_object('success', false, 'error', 'already_played');
    end if;
  end if;

  -- TIRAGE PONDÉRÉ CÔTÉ SERVEUR parmi les lots disponibles (stock)
  select coalesce(sum(weight), 0) into v_total from prizes
    where game_id = p_game_id
      and (not coalesce(v_game.is_stock_limit_active, false) or quantity is null or quantity > 0);
  if v_total <= 0 then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;

  v_r := random() * v_total;
  select id into v_prize_id from (
    select id, sum(weight) over (order by id) as cum
    from prizes
    where game_id = p_game_id
      and (not coalesce(v_game.is_stock_limit_active, false) or quantity is null or quantity > 0)
  ) t
  where t.cum >= v_r
  order by t.cum
  limit 1;

  if v_prize_id is null then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;
  select * into v_prize from prizes where id = v_prize_id;

  -- Décrément stock atomique
  if v_game.is_stock_limit_active and v_prize.quantity is not null then
    update prizes set quantity = quantity - 1 where id = v_prize_id and quantity > 0;
    if not found then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;
  end if;

  v_expires_at := now() + ((coalesce(v_game.validity_days, 30)) || ' days')::interval;
  v_min_spend := coalesce((case when v_game.min_spend ~ '^[0-9]+$' then v_game.min_spend::int else 0 end), 0);

  insert into winners (game_id, prize_id, email, phone, first_name, marketing_optin, prize_label_snapshot, expires_at, status, assigned_action)
  values (p_game_id, v_prize_id, p_email, p_phone, p_first_name, p_marketing_optin, coalesce(v_prize.label,'Lot'), v_expires_at, 'available', v_assigned)
  returning id into v_winner_id;

  if v_game.restaurant_id is not null then
    begin
      insert into contacts (restaurant_id, email, phone, first_name, marketing_optin, source_game_id, last_submitted_at)
      values (v_game.restaurant_id, p_email, p_phone, p_first_name, p_marketing_optin, p_game_id, now())
      on conflict (restaurant_id, email) do update
        set first_name = excluded.first_name, marketing_optin = excluded.marketing_optin, last_submitted_at = now();
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('success', true, 'winner_id', v_winner_id, 'qr_code', v_winner_id::text,
    'prize_id', v_prize_id, 'prize_label', coalesce(v_prize.label,'Lot'), 'expires_at', v_expires_at, 'min_spend', v_min_spend);
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_win(p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game games%rowtype;
  v_prize prizes%rowtype;
  v_expires_at timestamptz;
  v_min_spend int;
  v_winner_id uuid;
  v_last timestamptz;
  v_hours_left int;
  v_count int := 0;
  v_seq jsonb;
  v_len int;
  v_assigned text;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return jsonb_build_object('success', false, 'error', 'game_not_found'); end if;

  v_assigned := v_game.active_action;

  if coalesce(v_game.replay_enabled, false) then
    select max(created_at), count(*) into v_last, v_count from winners
      where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) );
    if v_last is not null and v_last > now() - (coalesce(v_game.replay_delay_hours, 24) || ' hours')::interval then
      v_hours_left := ceil(extract(epoch from (v_last + (coalesce(v_game.replay_delay_hours,24)||' hours')::interval - now())) / 3600.0);
      return jsonb_build_object('success', false, 'error', 'replay_too_soon', 'hours_left', v_hours_left);
    end if;
    -- action assignée = élément (v_count modulo longueur) de la séquence
    v_seq := v_game.action_sequence;
    if v_seq is not null and jsonb_typeof(v_seq) = 'array' and jsonb_array_length(v_seq) > 0 then
      v_len := jsonb_array_length(v_seq);
      v_assigned := (v_seq -> (v_count % v_len)) ->> 'action';
    end if;
  else
    if exists (
      select 1 from winners
      where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) )
    ) then
      return jsonb_build_object('success', false, 'error', 'already_played');
    end if;
  end if;

  select * into v_prize from prizes where id = p_prize_id;
  if not found then return jsonb_build_object('success', false, 'error', 'prize_not_found'); end if;

  if v_game.is_stock_limit_active and v_prize.quantity is not null then
    update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;
    if not found then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;
  end if;

  v_expires_at := now() + ((coalesce(v_game.validity_days, 30)) || ' days')::interval;
  v_min_spend := coalesce((case when v_game.min_spend ~ '^[0-9]+$' then v_game.min_spend::int else 0 end), 0);

  insert into winners (game_id, prize_id, email, phone, first_name, marketing_optin, prize_label_snapshot, expires_at, status, assigned_action)
  values (p_game_id, p_prize_id, p_email, p_phone, p_first_name, p_marketing_optin, coalesce(v_prize.label,'Lot'), v_expires_at, 'available', v_assigned)
  returning id into v_winner_id;

  if v_game.restaurant_id is not null then
    begin
      insert into contacts (restaurant_id, email, phone, first_name, marketing_optin, source_game_id, last_submitted_at)
      values (v_game.restaurant_id, p_email, p_phone, p_first_name, p_marketing_optin, p_game_id, now())
      on conflict (restaurant_id, email) do update
        set first_name = excluded.first_name, marketing_optin = excluded.marketing_optin, last_submitted_at = now();
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('success', true, 'winner_id', v_winner_id, 'qr_code', v_winner_id::text, 'expires_at', v_expires_at, 'min_spend', v_min_spend);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'already_played');
end;
$function$;

-- ─────────────────────────────────────────────────────────────── triggers

drop trigger if exists log_profile_active on public.profiles;
create trigger log_profile_active after update of is_active on public.profiles
  for each row execute function public.trg_log_profile_active();

drop trigger if exists log_restaurant_block on public.restaurants;
create trigger log_restaurant_block after update of is_blocked on public.restaurants
  for each row execute function public.trg_log_restaurant_block();

drop trigger if exists tr_on_commercial_deleted on public.profiles;
create trigger tr_on_commercial_deleted before delete on public.profiles
  for each row when (old.role = 'sales') execute function public.handle_deleted_commercial();

drop trigger if exists trg_contacts_marketing_optin_at on public.contacts;
create trigger trg_contacts_marketing_optin_at before update of marketing_optin on public.contacts
  for each row execute function public.set_marketing_optin_at();

drop trigger if exists trg_set_prize_initial_quantity on public.prizes;
create trigger trg_set_prize_initial_quantity before insert on public.prizes
  for each row execute function public.set_prize_initial_quantity();

/*
 * Le seul trigger du projet hors du schéma `public`, et le plus important de
 * tous : sans lui, aucun compte créé n'obtient de profil, donc ni rôle, ni
 * restaurant, ni accès. Une base reconstruite sans ce trigger paraît saine et
 * verrouille tout le monde dehors au premier compte.
 *
 * Il manquait. Mon empreinte des triggers ne regardait que `public` — les
 * cinq ci-dessus concordaient, et j'en ai conclu « triggers identiques ».
 * L'erreur était le périmètre de la mesure, pas son résultat.
 *
 * Les autres triggers hors `public` (cron, realtime, storage) appartiennent à
 * la plateforme Supabase, qui les pose elle-même. Ils n'ont rien à faire ici.
 */
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- `fn_audit_restaurant_changes` n'est attachée à AUCUN trigger. Ce n'est pas
-- un oubli de la baseline : c'est l'état de la production.

-- ─────────────────────────────────────────────────────────────────── vues

create or replace view public.public_restaurants as
  select id, slug, name, brand_color, text_color, logo_url, bg_image_url from public.restaurants;

create or replace view public.public_winners_safe as
  select id, prize_label_snapshot, created_at, status from public.winners;

create or replace view public.v_my_access_status as
  select p.id as profile_id, p.role, r.blocked_at,
    case when r.blocked_at is not null then true else false end as is_blocked
  from public.profiles p
  left join public.restaurants r on p.restaurant_id = r.id
  where p.id = auth.uid();

create or replace view public.view_integrity_check as
  select id, name, slug,
    case when owner_id is null then 'ORPHELIN'::text else 'OK'::text end as owner_status,
    case when created_by is null then 'MANQUANT'::text else 'OK'::text end as creator_status
  from public.restaurants
  where owner_id is null or created_by is null;

/*
 * ─── security_invoker : LA SEULE CHOSE QUI SÉPARE CES VUES D'UNE FUITE ───
 *
 * Sans cette option, une vue s'exécute avec les droits de son PROPRIÉTAIRE —
 * ici `postgres`, qui contourne la RLS. Avec elle, elle s'exécute avec les
 * droits de l'appelant, et la RLS de la table sous-jacente s'applique.
 *
 * `public_winners_safe` expose des colonnes de `winners` et accorde SELECT à
 * `anon`. Sans `security_invoker`, n'importe quel visiteur y lirait l'état de
 * TOUS les tickets, tous restaurants confondus.
 *
 * La première version de cette baseline créait les quatre vues sans aucune
 * option. Elle aurait donc ouvert, dans le fichier même censé décrire la
 * production fidèlement, un trou que la production n'a pas. Constaté le
 * 18/08/2026 en comparant `reloptions` : production `security_invoker` sur
 * les quatre, branche reconstruite AUCUNE.
 *
 * L'orthographe diffère d'une vue à l'autre en production — `on` pour deux,
 * `true` pour deux autres. Même sémantique. On restitue chacune telle qu'elle
 * est écrite : « uniformiser » serait corriger un état historique sans
 * mandat, et ferait diverger l'empreinte.
 */
alter view public.public_restaurants   set (security_invoker = on);
alter view public.view_integrity_check set (security_invoker = on);
alter view public.public_winners_safe  set (security_invoker = true);
alter view public.v_my_access_status   set (security_invoker = true);

-- ────────────────────────────────────────────────────────────── Storage

insert into storage.buckets (id, name, public) values ('backgrounds', 'backgrounds', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict (id) do nothing;

-- ───────────────────────────────────────────────────────── RLS et policies

alter table public.restaurants          enable row level security;
alter table public.profiles             enable row level security;
alter table public.games                enable row level security;
alter table public.prizes               enable row level security;
alter table public.winners              enable row level security;
alter table public.winners_archive      enable row level security;
alter table public.contacts             enable row level security;
alter table public.crm_notes            enable row level security;
alter table public.sales_restaurants    enable row level security;
alter table public.system_logs          enable row level security;
alter table public.activity_logs_legacy enable row level security;
alter table public.winners_backup_20260606      enable row level security;
alter table public.contacts_backup_20260606     enable row level security;
alter table public.auth_ghosts_backup_20260606  enable row level security;
alter table public.auth_orphan_backup_20260606  enable row level security;

/*
 * ⚠ LES POLICIES SONT REPRODUITES AVEC LEURS DÉFAUTS.
 *
 * Quatre sont fautives, et la baseline les garde parce qu'elle décrit
 * l'histoire. Elles sont corrigées par une migration datée, à part.
 *
 *  · "Sales can create restaurants" porte `with check (true)` et ne vérifie
 *    AUCUN rôle : tout compte connecté peut insérer un restaurant.
 *  · temp_open_profiles, global_nav_profiles et final_profile_access_v3 sont
 *    trois policies identiques ouvrant la lecture de TOUS les profils.
 *  · root_read_all_profiles dit l'inverse de son intention : elle expose la
 *    ligne du root au lieu de donner au root l'accès à tout.
 *  · v2_owner_all_contacts et v2_owner_all_games pointent un restaurant qui
 *    n'existe plus (9ca36072-…).
 *
 * Rappel de mécanique : les policies permissives se combinent par OU. La
 * plus large gagne toujours ; empiler n'a jamais restreint.
 */

create policy root_full_logs on public.activity_logs_legacy as permissive for all to public using (is_root()) with check (is_root());

create policy v2_owner_all_contacts on public.contacts as permissive for all to authenticated using (((restaurant_id = '9ca36072-90dc-4390-b610-b0e9670fd363'::uuid) or ((select profiles.role from profiles where (profiles.id = auth.uid())) = 'root'::text)));
create policy v2_owner_select_contacts on public.contacts as permissive for select to authenticated using (((restaurant_id in (select p.restaurant_id from profiles p where (p.id = auth.uid()))) or ((select profiles.role from profiles where (profiles.id = auth.uid())) = 'root'::text)));
create policy v2_public_insert_contacts on public.contacts as permissive for insert to anon with check ((restaurant_id in (select restaurants.id from restaurants where ((restaurants.is_active = true) and (restaurants.blocked_at is null)))));

create policy sales_manage_notes on public.crm_notes as permissive for all to public using ((is_sales() or is_root())) with check ((is_sales() or is_root()));

create policy "ADMIN_GAMES_FULL_ACCESS" on public.games as permissive for all to authenticated using ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid)) with check ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid));
create policy games_insert_own on public.games as permissive for insert to authenticated with check ((("current_role"() = any (array['root'::text, 'restaurant'::text])) and (restaurant_id = current_restaurant_id())));
create policy games_restaurant on public.games as permissive for select to public using ((restaurant_id in (select profiles.restaurant_id from profiles where (profiles.id = auth.uid()))));
create policy games_select_for_restaurant_team on public.games as permissive for select to authenticated using ((exists (select 1 from profiles p where ((p.id = auth.uid()) and (p.is_active is distinct from false) and ((p.restaurant_id = games.restaurant_id) or (p.role = 'root'::text))))));
create policy games_select_own on public.games as permissive for select to authenticated using ((("current_role"() = 'root'::text) or (("current_role"() = 'restaurant'::text) and (restaurant_id = current_restaurant_id()))));
create policy games_update_own on public.games as permissive for update to authenticated using ((("current_role"() = any (array['root'::text, 'restaurant'::text])) and (restaurant_id = current_restaurant_id()))) with check ((("current_role"() = any (array['root'::text, 'restaurant'::text])) and (restaurant_id = current_restaurant_id())));
create policy v2_owner_all_games on public.games as permissive for all to authenticated using (((restaurant_id = '9ca36072-90dc-4390-b610-b0e9670fd363'::uuid) or ((select profiles.role from profiles where (profiles.id = auth.uid())) = 'root'::text)));
create policy v2_owner_select_games on public.games as permissive for select to authenticated using (((restaurant_id in (select p.restaurant_id from profiles p where (p.id = auth.uid()))) or ((select profiles.role from profiles where (profiles.id = auth.uid())) = 'root'::text)));
create policy v2_public_select_games on public.games as permissive for select to anon, authenticated using (((status = 'active'::text) and (restaurant_id in (select restaurants.id from restaurants where ((restaurants.is_active = true) and (restaurants.blocked_at is null))))));

create policy "Owner manage prizes" on public.prizes as permissive for all to authenticated using ((exists (select 1 from (games g join restaurants r on ((g.restaurant_id = r.id))) where ((prizes.game_id = g.id) and (r.user_id = auth.uid()))))) with check ((exists (select 1 from (games g join restaurants r on ((g.restaurant_id = r.id))) where ((prizes.game_id = g.id) and (r.user_id = auth.uid())))));
create policy v2_public_select_prizes on public.prizes as permissive for select to anon, authenticated using ((game_id in (select g.id from (games g join restaurants r on ((r.id = g.restaurant_id))) where ((g.status = 'active'::text) and (r.is_active = true) and (r.blocked_at is null)))));

create policy final_profile_access_v3 on public.profiles as permissive for select to authenticated using (true);
create policy global_nav_profiles on public.profiles as permissive for select to authenticated using (true);
create policy profiles_root_select_all on public.profiles as permissive for select to authenticated using (("current_role"() = 'root'::text));
create policy profiles_self on public.profiles as permissive for select to public using ((id = auth.uid()));
create policy profiles_self_select on public.profiles as permissive for select to authenticated using ((id = auth.uid()));
create policy root_read_all_profiles on public.profiles as permissive for select to authenticated using ((role = 'root'::text));
create policy temp_open_profiles on public.profiles as permissive for select to authenticated using (true);

create policy "Enable insert for root users only" on public.restaurants as permissive for insert to authenticated with check ((exists (select 1 from profiles where ((profiles.id = auth.uid()) and (profiles.role = 'root'::text)))));
create policy "Sales can create restaurants" on public.restaurants as permissive for insert to authenticated with check (true);
create policy "Staff view own restaurant always" on public.restaurants as permissive for select to authenticated using ((id in (select profiles.restaurant_id from profiles where (profiles.id = auth.uid()))));
create policy "Super Admin Restaurants Access" on public.restaurants as permissive for all to authenticated using (((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid())));
create policy restaurants_restaurant on public.restaurants as permissive for select to public using ((id in (select profiles.restaurant_id from profiles where (profiles.id = auth.uid()))));
create policy restaurants_sales on public.restaurants as permissive for select to public using (((created_by = auth.uid()) or (id in (select sales_restaurants.restaurant_id from sales_restaurants where (sales_restaurants.sales_user_id = auth.uid())))));
create policy restaurants_select_own on public.restaurants as permissive for select to authenticated using ((("current_role"() = 'root'::text) or (("current_role"() = 'restaurant'::text) and (id = current_restaurant_id()))));
create policy restaurants_select_sales_assigned on public.restaurants as permissive for select to authenticated using ((("current_role"() = 'sales'::text) and (exists (select 1 from sales_restaurants sr where ((sr.sales_user_id = auth.uid()) and (sr.restaurant_id = restaurants.id))))));
create policy v2_owner_select_restaurant on public.restaurants as permissive for select to authenticated using (((id in (select p.restaurant_id from profiles p where (p.id = auth.uid()))) or ((select profiles.role from profiles where (profiles.id = auth.uid())) = 'root'::text)));

create policy sales_mapping on public.sales_restaurants as permissive for select to public using ((sales_user_id = auth.uid()));
create policy sales_restaurants_root_all on public.sales_restaurants as permissive for all to authenticated using (("current_role"() = 'root'::text)) with check (("current_role"() = 'root'::text));
create policy sales_restaurants_select_own on public.sales_restaurants as permissive for select to authenticated using (((sales_user_id = auth.uid()) or ("current_role"() = 'root'::text)));

create policy "Root Full Access" on public.system_logs as permissive for all to authenticated using ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid));

create policy global_winners_update on public.winners as permissive for all to authenticated using ((exists (select 1 from profiles p where ((p.id = auth.uid()) and ((p.restaurant_id in (select games.restaurant_id from games where (games.id = winners.game_id))) or (p.role = 'root'::text))))));
create policy v2_owner_all_winners on public.winners as permissive for all to authenticated using (((exists (select 1 from (games g join profiles p on ((p.restaurant_id = g.restaurant_id))) where ((g.id = winners.game_id) and (p.id = auth.uid())))) or ((select profiles.role from profiles where (profiles.id = auth.uid())) = 'root'::text)));
create policy winners_restaurant on public.winners as permissive for select to public using ((game_id in (select g.id from (games g join profiles p on ((p.restaurant_id = g.restaurant_id))) where (p.id = auth.uid()))));
create policy winners_select_own on public.winners as permissive for select to authenticated using ((("current_role"() = 'root'::text) or (exists (select 1 from games g where ((g.id = winners.game_id) and (g.restaurant_id = current_restaurant_id()))))));
create policy winners_update_by_restaurant_team_v3 on public.winners as permissive for update to authenticated using ((exists (select 1 from (profiles p join games g on ((g.id = winners.game_id))) where ((p.id = auth.uid()) and (p.is_active is distinct from false) and (p.restaurant_id = g.restaurant_id) and (p.role = any (array['admin'::text, 'owner'::text, 'staff'::text, 'root'::text])))))) with check ((exists (select 1 from (profiles p join games g on ((g.id = winners.game_id))) where ((p.id = auth.uid()) and (p.is_active is distinct from false) and (p.restaurant_id = g.restaurant_id) and (p.role = any (array['admin'::text, 'owner'::text, 'staff'::text, 'root'::text]))))));
create policy winners_update_own on public.winners as permissive for update to authenticated using ((("current_role"() = any (array['root'::text, 'restaurant'::text])) and (exists (select 1 from games g where ((g.id = winners.game_id) and (g.restaurant_id = current_restaurant_id())))))) with check ((("current_role"() = any (array['root'::text, 'restaurant'::text])) and (exists (select 1 from games g where ((g.id = winners.game_id) and (g.restaurant_id = current_restaurant_id()))))));

create policy archive_root_only on public.winners_archive as permissive for all to authenticated using (is_root()) with check (is_root());

drop policy if exists "Allow deletes for authenticated users" on storage.objects;
create policy "Allow deletes for authenticated users" on storage.objects as permissive for delete to authenticated using ((bucket_id = 'backgrounds'::text));
drop policy if exists "Allow public read access" on storage.objects;
create policy "Allow public read access" on storage.objects as permissive for select to public using ((bucket_id = 'backgrounds'::text));
drop policy if exists "Allow updates for authenticated users" on storage.objects;
create policy "Allow updates for authenticated users" on storage.objects as permissive for update to authenticated using ((bucket_id = 'backgrounds'::text));
drop policy if exists "Allow uploads for authenticated users" on storage.objects;
create policy "Allow uploads for authenticated users" on storage.objects as permissive for insert to authenticated with check ((bucket_id = 'backgrounds'::text));
drop policy if exists "admin_access 1peuqw_0" on storage.objects;
create policy "admin_access 1peuqw_0" on storage.objects as permissive for select to authenticated using ((bucket_id = 'logos'::text));
drop policy if exists "admin_access 1peuqw_1" on storage.objects;
create policy "admin_access 1peuqw_1" on storage.objects as permissive for insert to authenticated with check ((bucket_id = 'logos'::text));
drop policy if exists "admin_access 1peuqw_2" on storage.objects;
create policy "admin_access 1peuqw_2" on storage.objects as permissive for update to authenticated using ((bucket_id = 'logos'::text));
drop policy if exists "admin_access 1peuqw_3" on storage.objects;
create policy "admin_access 1peuqw_3" on storage.objects as permissive for delete to authenticated using ((bucket_id = 'logos'::text));

-- ─────────────────────────────────────────────────────────────── grants
--
-- Supabase accorde par défaut tous les droits de table à anon et
-- authenticated sur le schéma public ; c'est la RLS qui filtre ensuite. On
-- reproduit cet état, défauts compris — c'est lui qui rend les policies
-- trop larges réellement exploitables.

grant usage on schema public to anon, authenticated, service_role;

/*
 * ─── LES RETRAITS CIBLÉS ───
 *
 * Les DEFAULT PRIVILEGES ci-dessus ont déjà accordé cinq privilèges à `anon`
 * et `authenticated` sur chaque relation créée. La production restreint
 * ensuite quatre d'entre elles. On reproduit ces retraits, et rien d'autre.
 */

-- `winners` : la table des tickets. Ni le visiteur ni le compte connecté n'y
-- touchent — tout passe par les RPC SECURITY DEFINER et par la vue
-- `public_winners_safe`. Aucun droit, mesuré en production.
revoke all on public.winners from anon, authenticated;

-- `anon` ne fait que LIRE le catalogue du jeu.
revoke insert, update, delete, maintain on public.games, public.prizes, public.restaurants from anon;

-- `authenticated` y écrit, mais n'a pas MAINTAIN. Nuance mesurée, pas déduite.
revoke maintain on public.games, public.prizes, public.restaurants from authenticated;

/*
 * Les quatre vues gardent les cinq privilèges hérités — c'est l'état de la
 * production. Les droits d'écriture qu'ils donnent à `anon` sont une DETTE de
 * sécurité, pas une cible : leur retrait est une migration ultérieure, à
 * part, et les quatre vues ne sont utilisées que par du code mort.
 */

-- Réservées à service_role — le serveur seul les appelle.
revoke execute on function public.play_game(uuid, text, text, text, boolean) from public, anon, authenticated;
grant  execute on function public.play_game(uuid, text, text, text, boolean) to service_role;

revoke execute on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant  execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

revoke execute on function public.get_replay_status(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.get_replay_status(uuid, text, text) to service_role;

revoke execute on function public.anonymize_expired_data() from public, anon, authenticated;
grant  execute on function public.anonymize_expired_data() to service_role;

revoke execute on function public.get_sales_stats() from public, anon, authenticated;
grant  execute on function public.get_sales_stats() to service_role;

-- Ouverte aux comptes connectés, jamais aux anonymes : elle vérifie
-- elle-même que le restaurant appartient à l'appelant.
revoke execute on function public.activate_game(uuid) from public, anon;
grant  execute on function public.activate_game(uuid) to authenticated, service_role;

-- `_log_event` et `archive_redeemed_winners` restent OUVERTES ici : c'est
-- l'état d'avant le 24/07, et c'est la faille que la migration
-- 20260817235046 vient fermer. Les refermer dès la baseline ferait perdre la
-- trace de ce qui s'est réellement passé.
