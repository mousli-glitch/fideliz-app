/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRÉER UN JEU EST UN SEUL ACTE, PAS CINQ REQUÊTES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `createGameAction` faisait, en requêtes séparées et à la clé de service :
 *
 *   1. valider le montant ;
 *   2. RETROUVER le restaurant depuis le slug fourni par le NAVIGATEUR ;
 *   3. modifier le design du restaurant ;
 *   4. passer les anciens jeux en `ended` ;
 *   5. créer le nouveau jeu ;
 *   6. insérer les lots.
 *
 * Plusieurs erreurs n'étaient pas lues — le design, la désactivation, les
 * lots. Un échec tardif laissait donc, en production :
 *
 *   — les anciens jeux TERMINÉS et le nouveau jamais créé : le restaurant
 *     n'a plus de jeu du tout, et son QR imprimé ne mène nulle part ;
 *   — ou un jeu créé SANS AUCUN LOT : la roue tourne sur du vide.
 *
 * Et le restaurant était re-résolu depuis `data.slug` alors que la garde
 * l'avait DÉJÀ résolu et autorisé. Deux résolutions, deux occasions de
 * diverger — celle qui décide devait être celle qui autorise.
 *
 * ─── LA FORME RETENUE ───
 *
 * Une transaction, comme `enregistrer_jeu_et_lots` dont cette fonction reprend
 * la validation à l'identique : mêmes bornes de poids, mêmes bornes de stock,
 * même total à 100, mêmes dates, même montant BRUT validé par
 * `centimes_depuis_saisie`, même whitelist restaurant, mêmes `row_count`
 * exacts.
 *
 * Le restaurant est VERROUILLÉ (`for update`) : deux créations concurrentes
 * pour la même enseigne se sérialisent, au lieu de terminer mutuellement leurs
 * jeux respectifs.
 *
 * ─── CE QUI N'EST PAS UNE COERCITION ───
 *
 * Les saisies arrivent BRUTES. Un poids « abc », un stock « 5abc », un montant
 * « -3 » sont REFUSÉS — jamais convertis en une valeur métier qui aurait l'air
 *normale. `Number(...)` faisait exactement l'inverse.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer et prouver, puis ATTENDRE son accord
 * avant toute application réelle.
 *
 * MIGRATION ADDITIVE : aucune table, aucune colonne, aucune donnée touchée.
 */

create or replace function public.creer_jeu_et_lots(
  p_restaurant_id uuid,
  p_jeu           jsonb,
  p_lots          jsonb,
  p_restaurant    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_resto    uuid;
  v_game_id  uuid;
  v_lot      jsonb;
  v_total    int := 0;
  v_n        int := 0;
  v_poids    text;
  v_qte      text;
  v_maj      int;
  v_inseres  int;
  v_centimes int;
  v_texte    text;
begin
  if p_restaurant_id is null then
    raise exception using errcode = 'P0110', message = 'Restaurant manquant.';
  end if;

  /*
   * Le restaurant est VERROUILLÉ : deux créations concurrentes pour la même
   * enseigne se sérialisent ici, au lieu de terminer chacune le jeu que
   * l'autre vient de créer.
   */
  select r.id into v_resto from public.restaurants r where r.id = p_restaurant_id for update;
  if not found then
    raise exception using errcode = 'P0111', message = 'Restaurant introuvable : création annulée.';
  end if;

  -- ─── Validation des lots, AVANT toute écriture ───

  if p_lots is null or jsonb_typeof(p_lots) <> 'array' then
    raise exception using errcode = 'P0113', message = 'Liste de lots invalide.';
  end if;

  for v_lot in select * from jsonb_array_elements(p_lots) loop
    v_n := v_n + 1;
    if coalesce(btrim(v_lot->>'label'), '') = '' then
      raise exception using errcode = 'P0113', message = format('Lot %s : le libellé est obligatoire.', v_n);
    end if;
    v_poids := btrim(coalesce(v_lot->>'weight', ''));
    if v_poids !~ '^[0-9]{1,3}$' or v_poids::int < 1 or v_poids::int > 100 then
      raise exception using errcode = 'P0113',
        message = format('Lot %s : le poids doit être un entier de 1 à 100 (reçu : « %s »).', v_n, coalesce(v_lot->>'weight','vide'));
    end if;
    v_total := v_total + v_poids::int;
    if v_lot ? 'quantity' and jsonb_typeof(v_lot->'quantity') <> 'null' then
      v_qte := btrim(coalesce(v_lot->>'quantity', ''));
      if v_qte <> '' and v_qte !~ '^[0-9]{1,9}$' then
        raise exception using errcode = 'P0113',
          message = format('Lot %s : le stock doit être un entier de 0 à 999999999, ou vide pour « illimité » (reçu : « %s »).', v_n, v_lot->>'quantity');
      end if;
    end if;
  end loop;

  if v_n = 0 then
    raise exception using errcode = 'P0113', message = 'Un jeu doit comporter au moins un lot.';
  end if;
  if v_total <> 100 then
    raise exception using errcode = 'P0114',
      message = format('Le total des poids doit valoir 100 %% (actuel : %s %%).', v_total);
  end if;

  -- Le montant, BRUT, validé ici. Une saisie illisible refuse toute la création.
  v_centimes := coalesce(public.centimes_depuis_saisie(p_jeu->>'min_spend'), 0);
  v_texte := case when v_centimes % 100 = 0 then (v_centimes / 100)::text
                  else to_char(v_centimes / 100.0, 'FM9999990.00') end;

  if coalesce((p_jeu->>'is_date_limit_active')::boolean, false) then
    if (p_jeu->>'start_date') is null or (p_jeu->>'end_date') is null then
      raise exception using errcode = 'P0117',
        message = 'Limite de dates active : la date de début et la date de fin sont toutes deux obligatoires.';
    end if;
    if (p_jeu->>'end_date')::timestamptz <= (p_jeu->>'start_date')::timestamptz then
      raise exception using errcode = 'P0117', message = 'La date de fin doit être postérieure à la date de début.';
    end if;
  end if;
  if coalesce((p_jeu->>'validity_days')::int, 0) < 1 then
    raise exception using errcode = 'P0117', message = 'La durée de validité d''un ticket doit être d''au moins 1 jour.';
  end if;
  if coalesce(btrim(p_jeu->>'name'), '') = '' then
    raise exception using errcode = 'P0117', message = 'Le nom du jeu est obligatoire.';
  end if;

  -- ─── Écritures, toutes dans la MÊME transaction ───

  update public.restaurants r set
    primary_color = case when p_restaurant ? 'primary_color' then p_restaurant->>'primary_color' else r.primary_color end,
    brand_color   = case when p_restaurant ? 'brand_color'   then p_restaurant->>'brand_color'   else r.brand_color   end,
    logo_url      = case when p_restaurant ? 'logo_url'      then p_restaurant->>'logo_url'      else r.logo_url      end
  where r.id = p_restaurant_id;

  get diagnostics v_maj = row_count;
  if v_maj <> 1 then
    raise exception using errcode = 'P0116',
      message = format('Restaurant : %s ligne(s) mise(s) à jour, 1 attendue. Rien n''est conservé.', v_maj);
  end if;

  /*
   * Les anciens jeux passent en `ended` — la contrainte
   * `one_active_game_per_restaurant` l'exige avant d'en créer un nouveau.
   * Dans la même transaction : si la création échoue ensuite, ils redeviennent
   * actifs et le QR imprimé continue de fonctionner.
   */
  update public.games set status = 'ended'
   where restaurant_id = p_restaurant_id and status = 'active';

  insert into public.games (
    restaurant_id, name, status, active_action, action_url, validity_days,
    min_spend, min_spend_cents,
    is_date_limit_active, start_date, end_date, is_stock_limit_active,
    requires_menu, requires_review_proof,
    bg_image_url, bg_choice, title_style, card_style,
    wheel_palette, wheel_color_1, wheel_color_2, overlay_style,
    stock_refill_enabled, stock_refill_period)
  values (
    p_restaurant_id, btrim(p_jeu->>'name'), 'active',
    p_jeu->>'active_action', p_jeu->>'action_url', (p_jeu->>'validity_days')::int,
    v_texte, v_centimes,
    coalesce((p_jeu->>'is_date_limit_active')::boolean, false),
    (p_jeu->>'start_date')::timestamptz, (p_jeu->>'end_date')::timestamptz,
    coalesce((p_jeu->>'is_stock_limit_active')::boolean, false),
    coalesce((p_jeu->>'requires_menu')::boolean, false),
    coalesce((p_jeu->>'requires_review_proof')::boolean, false),
    p_jeu->>'bg_image_url', nullif(btrim(p_jeu->>'bg_choice'), '')::int,
    p_jeu->>'title_style', coalesce(p_jeu->>'card_style', 'light'),
    p_jeu->>'wheel_palette', p_jeu->>'wheel_color_1', p_jeu->>'wheel_color_2',
    coalesce(p_jeu->>'overlay_style', 'dark'),
    coalesce((p_jeu->>'stock_refill_enabled')::boolean, false),
    coalesce(p_jeu->>'stock_refill_period', 'monthly'))
  returning id into v_game_id;

  if v_game_id is null then
    raise exception using errcode = 'P0116', message = 'Le jeu n''a pas été créé. Rien n''est conservé.';
  end if;

  insert into public.prizes (game_id, label, color, weight, quantity, initial_quantity)
  select v_game_id,
         btrim(l->>'label'),
         coalesce(nullif(l->>'color', ''), '#000000'),
         (btrim(l->>'weight'))::int,
         nullif(btrim(coalesce(l->>'quantity','')), '')::int,
         nullif(btrim(coalesce(l->>'quantity','')), '')::int
  from jsonb_array_elements(p_lots) l;

  get diagnostics v_inseres = row_count;
  if v_inseres <> v_n then
    raise exception using errcode = 'P0115',
      message = format('Conservation rompue : %s lot(s) reçus, %s enregistré(s). Rien n''est conservé.', v_n, v_inseres);
  end if;

  return jsonb_build_object('game_id', v_game_id, 'lots', v_inseres,
                            'total_poids', v_total, 'min_spend_cents', v_centimes);
end;
$$;

comment on function public.creer_jeu_et_lots(uuid, jsonb, jsonb, jsonb) is
  'Crée un jeu et ses lots dans UNE transaction : design du restaurant, fin des anciens jeux, création, lots. Le restaurant est verrouillé, les saisies arrivent brutes et sont validées ici. Un échec ne laisse aucun état partiel.';

revoke all on function public.creer_jeu_et_lots(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.creer_jeu_et_lots(uuid, jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
