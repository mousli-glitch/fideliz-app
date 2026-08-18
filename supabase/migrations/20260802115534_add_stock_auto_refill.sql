-- Recharge automatique du stock des lots d'un jeu.
-- À chaque début de période (jour/semaine/mois), chaque lot revient à son stock de départ.
alter table public.games
  add column if not exists stock_refill_enabled boolean default false,
  add column if not exists stock_refill_period text default 'monthly',
  add column if not exists stock_refill_last_at timestamptz;
