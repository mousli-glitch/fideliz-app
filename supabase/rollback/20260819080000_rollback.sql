/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — isolation lot/jeu dans register_win
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule `20260819080000_isolation_lot_jeu.sql` par la substitution INVERSE :
 * il relit la définition déployée et y remet les deux prédicats d'origine.
 *
 * ─── ⚠️ CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * Le P0, en entier. Un joueur anonyme peut de nouveau poster son jeu avec le
 * lot d'un CONFRÈRE : le stock de l'autre restaurant est décrémenté, et un
 * ticket est émis chez l'attaquant portant le libellé d'une enseigne qui ne
 * l'a jamais offert. Mesuré : stock 3 -> 2.
 *
 * Ce rollback existe pour la complétude de la chaîne, pas parce qu'il serait
 * souhaitable. Le jouer sur une base en service rouvre une rupture
 * d'isolation inter-tenant atteignable depuis Internet.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

do $$
declare
  v_def text; v_nouveau text; v_n int;
  c_lot_apres   constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_lot_avant   constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_stock_apres constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
  c_stock_avant constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_win'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';

  if v_def is null then
    raise exception 'ROLLBACK : register_win introuvable avec la signature attendue.';
  end if;

  if position(c_lot_apres in v_def) = 0 and position(c_stock_apres in v_def) = 0 then
    raise notice 'ROLLBACK : le correctif n''est pas en place — rien à annuler.';
    return;
  end if;

  v_n := (length(v_def) - length(replace(v_def, c_lot_apres, ''))) / length(c_lot_apres);
  if v_n <> 1 then raise exception 'ROLLBACK : % occurrence(s) du prédicat corrigé, 1 exigée.', v_n; end if;

  v_nouveau := replace(replace(v_def, c_lot_apres, c_lot_avant), c_stock_apres, c_stock_avant);
  execute v_nouveau;
  raise notice 'ROLLBACK : les prédicats d''origine sont remis. LE P0 EST DE NOUVEAU OUVERT.';
end $$;

revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
