/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  DOUBLE ÉCRITURE : LE TEXTE HISTORIQUE ET LES CENTIMES, ENSEMBLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La migration 20260819060000 a posé le contrat — grammaire stricte, colonnes
 * canoniques, ordre de lecture. Elle ne l'a branché sur rien : `enregistrer_jeu_et_lots`
 * continuait d'écrire `min_spend` en texte, sans jamais alimenter
 * `min_spend_cents`.
 *
 * Deux choses ici, et une seule est visible :
 *
 * 1. LA VALIDATION REMONTE DANS LA TRANSACTION. Le montant arrive désormais
 *    BRUT — tel que le gérant l'a tapé — et `centimes_depuis_saisie` tranche.
 *    Une saisie illisible LÈVE, donc refuse l'agrégat entier : ni le design,
 *    ni le jeu, ni les lots ne bougent. C'est la même exigence que pour les
 *    stocks, appliquée au montant.
 *
 *    Auparavant `normalizeAmount` faisait la conversion en TypeScript, et
 *    `parseFloat` y transformait `abc` en `NaN` puis `0`, `-3` en `0`, et
 *    `5abc` en `5`. Une saisie fautive devenait donc une valeur métier
 *    parfaitement valide — « aucun minimum », ou pire, un minimum inventé.
 *
 * 2. LES DEUX REPRÉSENTATIONS SONT ÉCRITES ENSEMBLE. `min_spend_cents` porte
 *    la valeur canonique ; `min_spend` reçoit la forme textuelle DÉRIVÉE de
 *    ces centimes, jamais la saisie brute. Une seule source, deux écritures :
 *    elles ne peuvent plus diverger.
 *
 * ─── CE QUE CETTE MIGRATION NE FAIT PAS, ET IL FAUT LE DIRE ───
 *
 * `play_game` et `register_win` lisent TOUJOURS `min_spend ~ '^[0-9]+$'` et
 * retombent à zéro sur un décimal. Un jeu enregistré à 5,90 € par le nouveau
 * code porte donc `min_spend_cents = 590` — correct — et reste appliqué comme
 * 0 € par les fonctions de jeu.
 *
 * **Le défaut n'est donc PAS clos de bout en bout par ce lot.** Il l'est côté
 * écriture ; il reste ouvert côté application, tant que les lecteurs n'ont pas
 * basculé sur `minimum_effectif_centimes`. Ce basculement change la charge
 * JSON rendue au navigateur (`min_spend` y est aujourd'hui en EUROS, pas en
 * centimes) : c'est un lot à part entière, avec son propre harnais sur tous
 * les producteurs et consommateurs.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Migration AVANT code — la signature ne change pas, mais le contrat d'entrée
 * si : `p_jeu->>'min_spend'` doit désormais être la saisie BRUTE.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer et prouver, puis ATTENDRE sa validation
 * avant toute application réelle.
 *
 * MIGRATION ADDITIVE : aucune table, aucune colonne, aucune donnée touchée.
 * Seul le corps d'une fonction change.
 */

create or replace function public.enregistrer_jeu_et_lots(
  p_game_id       uuid,
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
  v_resto   uuid;
  v_lot     jsonb;
  v_total   int := 0;
  v_n       int := 0;
  v_poids   text;
  v_qte     text;
  v_inseres int;
  v_maj     int;
  v_centimes int;
  v_texte    text;
begin
  if p_game_id is null or p_restaurant_id is null then
    raise exception using errcode = 'P0110', message = 'Jeu ou restaurant manquant.';
  end if;

  select g.restaurant_id into v_resto
  from public.games g where g.id = p_game_id for update;

  if not found then
    raise exception using errcode = 'P0111', message = 'Jeu introuvable : enregistrement annulé.';
  end if;
  if v_resto is null or v_resto is distinct from p_restaurant_id then
    raise exception using errcode = 'P0112',
      message = 'Ce jeu n''appartient pas au restaurant autorisé : enregistrement refusé.';
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
        message = format('Lot %s : le poids doit être un entier de 1 à 100 (reçu : « %s »).', v_n, coalesce(v_lot->>'weight', 'vide'));
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

  /*
   * ─── LE MONTANT, BRUT, VALIDÉ ICI ───
   *
   * `centimes_depuis_saisie` LÈVE (P0120) sur une saisie illisible. Comme on
   * est avant la moindre écriture, l'agrégat entier est refusé : le design du
   * restaurant, le jeu et les lots gardent tous leur état d'avant.
   *
   * Vide ou absent rend NULL — « aucun minimum » — que l'on stocke en 0
   * centime, la règle métier existante.
   */
  v_centimes := coalesce(public.centimes_depuis_saisie(p_jeu->>'min_spend'), 0);

  /*
   * La forme textuelle est DÉRIVÉE des centimes, jamais recopiée de la
   * saisie : une seule source pour deux colonnes, qui ne peuvent donc plus
   * diverger. `5,90`, `5.9` et `5.90` produisent tous `5.90`.
   */
  v_texte := case
               when v_centimes % 100 = 0 then (v_centimes / 100)::text
               else to_char(v_centimes / 100.0, 'FM9999990.00')
             end;

  -- ─── Cohérence des dates ───

  if coalesce((p_jeu->>'is_date_limit_active')::boolean, false) then
    if (p_jeu->>'start_date') is null or (p_jeu->>'end_date') is null then
      raise exception using errcode = 'P0117',
        message = 'Limite de dates active : la date de début et la date de fin sont toutes deux obligatoires.';
    end if;
    if (p_jeu->>'end_date')::timestamptz <= (p_jeu->>'start_date')::timestamptz then
      raise exception using errcode = 'P0117',
        message = 'La date de fin doit être postérieure à la date de début.';
    end if;
  end if;

  if coalesce((p_jeu->>'validity_days')::int, 0) < 1 then
    raise exception using errcode = 'P0117',
      message = 'La durée de validité d''un ticket doit être d''au moins 1 jour.';
  end if;

  -- ─── Écritures, toutes dans la MÊME transaction ───

  update public.restaurants r set
    primary_color = case when p_restaurant ? 'primary_color' then p_restaurant->>'primary_color' else r.primary_color end,
    logo_url      = case when p_restaurant ? 'logo_url'      then p_restaurant->>'logo_url'      else r.logo_url      end
  where r.id = p_restaurant_id;

  get diagnostics v_maj = row_count;
  if v_maj <> 1 then
    raise exception using errcode = 'P0116',
      message = format('Restaurant : %s ligne(s) mise(s) à jour, 1 attendue. Rien n''est conservé.', v_maj);
  end if;

  update public.games g set
    name                  = p_jeu->>'name',
    active_action         = p_jeu->>'active_action',
    action_url            = p_jeu->>'action_url',
    validity_days         = (p_jeu->>'validity_days')::int,
    -- LES DEUX REPRÉSENTATIONS, issues de la même source.
    min_spend             = v_texte,
    min_spend_cents       = v_centimes,
    is_date_limit_active  = coalesce((p_jeu->>'is_date_limit_active')::boolean, false),
    start_date            = (p_jeu->>'start_date')::timestamptz,
    end_date              = (p_jeu->>'end_date')::timestamptz,
    is_stock_limit_active = coalesce((p_jeu->>'is_stock_limit_active')::boolean, false),
    requires_menu         = coalesce((p_jeu->>'requires_menu')::boolean, false),
    requires_review_proof = coalesce((p_jeu->>'requires_review_proof')::boolean, false),
    bg_image_url          = p_jeu->>'bg_image_url',
    bg_choice             = nullif(btrim(p_jeu->>'bg_choice'), '')::int,
    title_style           = p_jeu->>'title_style',
    card_style            = p_jeu->>'card_style',
    wheel_palette         = p_jeu->>'wheel_palette',
    wheel_color_1         = p_jeu->>'wheel_color_1',
    wheel_color_2         = p_jeu->>'wheel_color_2',
    overlay_style         = coalesce(p_jeu->>'overlay_style', 'dark'),
    stock_refill_enabled  = coalesce((p_jeu->>'stock_refill_enabled')::boolean, false),
    stock_refill_period   = coalesce(p_jeu->>'stock_refill_period', 'monthly')
  where g.id = p_game_id
    and g.restaurant_id = p_restaurant_id;

  get diagnostics v_maj = row_count;
  if v_maj <> 1 then
    raise exception using errcode = 'P0116',
      message = format('Jeu : %s ligne(s) mise(s) à jour, 1 attendue. Rien n''est conservé.', v_maj);
  end if;

  delete from public.prizes where game_id = p_game_id;

  insert into public.prizes (game_id, label, color, weight, quantity, initial_quantity)
  select p_game_id,
         btrim(l->>'label'),
         coalesce(nullif(l->>'color', ''), '#000000'),
         (btrim(l->>'weight'))::int,
         nullif(btrim(coalesce(l->>'quantity', '')), '')::int,
         nullif(btrim(coalesce(l->>'quantity', '')), '')::int
  from jsonb_array_elements(p_lots) l;

  get diagnostics v_inseres = row_count;
  if v_inseres <> v_n then
    raise exception using errcode = 'P0115',
      message = format('Conservation rompue : %s lot(s) reçus, %s enregistré(s). Rien n''est conservé.', v_n, v_inseres);
  end if;

  return jsonb_build_object('lots', v_inseres, 'total_poids', v_total, 'min_spend_cents', v_centimes);
end;
$$;

comment on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb) is
  'Enregistre design, jeu et lots dans UNE transaction. Le montant arrive BRUT et est validé ici : une saisie illisible refuse tout. Écrit les deux représentations du minimum (texte dérivé + centimes) depuis une source unique.';

/*
 * L'ACL est REPOSÉE, même si `create or replace` la conserve.
 *
 * Une règle permanente du dépôt l'exige, et elle a raison : la conservation
 * n'est vraie que si la fonction EXISTAIT DÉJÀ. Sur une base neuve rejouant
 * les migrations, ou si l'ordre change un jour, un `create` accorde `EXECUTE`
 * à PUBLIC par défaut — donc à `anon`. Une migration qui compte sur une
 * précédente pour ses droits est une migration qui les perd en silence le
 * jour où cette précédente bouge.
 */
revoke all on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
