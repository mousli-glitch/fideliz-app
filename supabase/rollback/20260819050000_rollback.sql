/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — agrégat jeu complet
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule `20260819050000_agregat_jeu_complet.sql` en revenant à la signature
 * de `20260819030000` : quatre arguments, pas de whitelist restaurant, pas de
 * validation des dates, et le contrôle des saisies dans sa forme d'origine.
 *
 * ─── CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * Le design du restaurant ne fait plus partie de la transaction : un refus
 * laissera de nouveau couleur et logo modifiés alors que l'action rend
 * `success: false`. Et le contrôle des stocks redevient celui qui accepte une
 * valeur déjà coercée — c'est le CODE qui, en amont, transformait `"abc"` en
 * `null`, c'est-à-dire en « stock illimité ». Reculer le code dans le même
 * mouvement, ou ne pas jouer ce rollback : sans lui, l'action appelle une
 * signature à cinq arguments qui n'existe plus et refuse tout.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

drop function if exists public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb);

create or replace function public.enregistrer_jeu_et_lots(
  p_game_id uuid, p_restaurant_id uuid, p_jeu jsonb, p_lots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_resto uuid; v_lot jsonb; v_total int := 0; v_n int := 0;
  v_poids text; v_qte text; v_inseres int;
begin
  if p_game_id is null or p_restaurant_id is null then
    raise exception using errcode = 'P0110', message = 'Jeu ou restaurant manquant.';
  end if;
  select g.restaurant_id into v_resto from public.games g where g.id = p_game_id for update;
  if not found then
    raise exception using errcode = 'P0111', message = 'Jeu introuvable : enregistrement annulé.';
  end if;
  if v_resto is null or v_resto is distinct from p_restaurant_id then
    raise exception using errcode = 'P0112',
      message = 'Ce jeu n''appartient pas au restaurant autorisé : enregistrement refusé.';
  end if;
  if p_lots is null or jsonb_typeof(p_lots) <> 'array' then
    raise exception using errcode = 'P0113', message = 'Liste de lots invalide.';
  end if;

  for v_lot in select * from jsonb_array_elements(p_lots) loop
    v_n := v_n + 1;
    if coalesce(btrim(v_lot->>'label'), '') = '' then
      raise exception using errcode = 'P0113', message = format('Lot %s : le libellé est obligatoire.', v_n);
    end if;
    v_poids := v_lot->>'weight';
    if v_poids is null or v_poids !~ '^[0-9]+$' or v_poids::int < 1 then
      raise exception using errcode = 'P0113',
        message = format('Lot %s : le poids doit être un entier supérieur ou égal à 1.', v_n);
    end if;
    v_total := v_total + v_poids::int;
    v_qte := v_lot->>'quantity';
    if v_qte is not null and (v_qte !~ '^[0-9]+$') then
      raise exception using errcode = 'P0113',
        message = format('Lot %s : le stock doit être un entier positif, ou vide pour « illimité ».', v_n);
    end if;
  end loop;

  if v_n = 0 then
    raise exception using errcode = 'P0113', message = 'Un jeu doit comporter au moins un lot.';
  end if;
  if v_total <> 100 then
    raise exception using errcode = 'P0114',
      message = format('Le total des poids doit valoir 100 %% (actuel : %s %%).', v_total);
  end if;

  update public.games g set
    name = p_jeu->>'name', active_action = p_jeu->>'active_action',
    action_url = p_jeu->>'action_url', validity_days = (p_jeu->>'validity_days')::int,
    min_spend = p_jeu->>'min_spend',
    is_date_limit_active = coalesce((p_jeu->>'is_date_limit_active')::boolean, false),
    start_date = (p_jeu->>'start_date')::timestamptz, end_date = (p_jeu->>'end_date')::timestamptz,
    is_stock_limit_active = coalesce((p_jeu->>'is_stock_limit_active')::boolean, false),
    requires_menu = coalesce((p_jeu->>'requires_menu')::boolean, false),
    requires_review_proof = coalesce((p_jeu->>'requires_review_proof')::boolean, false),
    bg_image_url = p_jeu->>'bg_image_url',
    bg_choice = nullif(btrim(p_jeu->>'bg_choice'), '')::int,
    title_style = p_jeu->>'title_style', card_style = p_jeu->>'card_style',
    wheel_palette = p_jeu->>'wheel_palette', wheel_color_1 = p_jeu->>'wheel_color_1',
    wheel_color_2 = p_jeu->>'wheel_color_2',
    overlay_style = coalesce(p_jeu->>'overlay_style', 'dark'),
    stock_refill_enabled = coalesce((p_jeu->>'stock_refill_enabled')::boolean, false),
    stock_refill_period = coalesce(p_jeu->>'stock_refill_period', 'monthly')
  where g.id = p_game_id and g.restaurant_id = p_restaurant_id;

  delete from public.prizes where game_id = p_game_id;
  insert into public.prizes (game_id, label, color, weight, quantity, initial_quantity)
  select p_game_id, btrim(l->>'label'),
         coalesce(nullif(l->>'color', ''), '#000000'),
         (l->>'weight')::int, (l->>'quantity')::int, (l->>'quantity')::int
  from jsonb_array_elements(p_lots) l;

  get diagnostics v_inseres = row_count;
  if v_inseres <> v_n then
    raise exception using errcode = 'P0115',
      message = format('Conservation rompue : %s lot(s) reçus, %s enregistré(s). Rien n''est conservé.', v_n, v_inseres);
  end if;
  return jsonb_build_object('lots', v_inseres, 'total_poids', v_total);
end;
$$;

revoke all on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
