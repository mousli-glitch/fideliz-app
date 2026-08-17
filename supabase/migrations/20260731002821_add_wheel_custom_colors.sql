-- Couleurs personnalisées de la roue (utilisées quand wheel_palette = 'CUSTOM').
-- 2 couleurs qui alternent une part sur deux, comme les thèmes préréglés.
alter table public.games
  add column if not exists wheel_color_1 text,
  add column if not exists wheel_color_2 text;
