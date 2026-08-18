-- Date à partir de laquelle la réponse automatique s'applique.
-- Posée à l'instant où le gérant ACTIVE l'auto-reply : le cron ne répond
-- qu'aux avis reçus APRÈS cette date (pas au backlog d'anciens avis).
alter table public.restaurants
  add column if not exists auto_reply_since timestamptz;
