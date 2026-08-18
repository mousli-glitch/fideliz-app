-- Table "avis" : miroir local des avis Google (source de vérité = Google).
-- On stocke aussi ai_draft (brouillon IA), qui est NOTRE donnée et survit aux synchros.
create table if not exists public.avis (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  review_id text not null,
  author text,
  photo text,
  rating int,
  comment text,
  review_created_at timestamptz,
  google_reply text,
  google_reply_updated_at timestamptz,
  ai_draft text,
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (restaurant_id, review_id)
);

create index if not exists avis_restaurant_id_idx on public.avis (restaurant_id);
create index if not exists avis_restaurant_created_idx on public.avis (restaurant_id, review_created_at desc);

alter table public.avis enable row level security;
-- Pas de policy : accès uniquement via la service role (actions serveur), qui contourne la RLS.

-- Colonnes de synthèse sur restaurants (note moyenne + total réels de Google + date de synchro)
alter table public.restaurants
  add column if not exists google_reviews_avg numeric,
  add column if not exists google_reviews_total int,
  add column if not exists google_reviews_synced_at timestamptz;
