-- Options avancées de la réponse IA (par restaurant).
alter table public.restaurants
  add column if not exists auto_reply_match_language boolean default false,   -- répondre dans la langue de l'avis
  add column if not exists auto_reply_custom_instructions text,               -- consignes personnalisées (texte libre)
  add column if not exists auto_reply_length text default 'court',            -- 'court' | 'moyen'
  add column if not exists auto_reply_signature text,                         -- signature optionnelle en fin de réponse
  add column if not exists auto_reply_draft_mode boolean default false,       -- auto : préparer des brouillons au lieu de publier
  add column if not exists auto_reply_blocklist text;                         -- mots-clés sensibles (jamais de réponse auto)
