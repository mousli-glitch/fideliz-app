-- Condition de gain : le client doit montrer son avis en caisse.
alter table public.games
  add column if not exists requires_review_proof boolean default false;
