/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  « ENREGISTRER » DOIT ÊTRE UN SEUL ACTE, ET AUCUNE SAISIE INVALIDE NE DOIT
 *  DEVENIR UNE VALEUR MÉTIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux défauts signalés le 19/08/2026, tous deux vérifiés.
 *
 * ─── 1. L'ACTION COMPLÈTE N'ÉTAIT PAS ATOMIQUE ───
 *
 * `enregistrer_jeu_et_lots` rendait bien le couple jeu+lots atomique. Mais
 * l'action, elle, écrivait D'ABORD `restaurants.primary_color/logo_url`, PUIS
 * appelait la fonction. Un refus de la fonction — un poids invalide, un total
 * différent de 100 — rendait donc `success: false` alors que la couleur et le
 * logo du restaurant avaient DÉJÀ changé.
 *
 * Déplacer ce PATCH après la RPC ne ferait que déplacer l'état partiel : le
 * jeu enregistré, le design non. Le même agrégat doit donc être décidé et
 * écrit dans UNE transaction — c'est ce que fait cette version.
 *
 * Les deux champs restaurant passent par une WHITELIST explicite. Rien
 * d'autre du corps de la requête n'atteint la table : ni `is_blocked`, ni
 * `slug`, ni un abonnement. Et seules les clés RÉELLEMENT PRÉSENTES sont
 * écrites — un champ omis conserve sa valeur au lieu d'être effacé, ce que
 * l'ancien chemin ne garantissait pas.
 *
 * ─── 2. UNE SAISIE INVALIDE DEVENAIT UNE VALEUR MÉTIER VALIDE ───
 *
 * Le défaut le plus grave des deux, et il ne se voit pas dans le SQL : il
 * naissait de la coercition TypeScript en amont.
 *
 *     Number("abc")        -> NaN
 *     JSON.stringify(NaN)  -> "null"
 *
 * Or pour `quantity`, `null` signifie précisément « stock illimité ». Une
 * saisie alphabétique, `NaN` ou `Infinity` arrivait donc ici sous la forme
 * d'un lot parfaitement valide et sans limite de stock. La validation n'était
 * pas contournée : elle n'avait rien à valider, la valeur avait déjà été
 * transformée.
 *
 * Le contrat change : l'appelant transmet la saisie BRUTE (chaîne ou null),
 * et c'est cette fonction qui tranche. Ne jamais convertir avant de valider —
 * une conversion qui échoue silencieusement produit une valeur, et une valeur
 * ne ressemble pas à une erreur.
 *
 * Les bornes sont explicites plutôt que laissées au cast :
 *
 *     poids  ^[0-9]{1,3}$   1..100, et leur somme doit valoir 100
 *     stock  ^[0-9]{1,9}$   0..999999999
 *
 * **Zéro est un stock VALIDE** : c'est « épuisé », pas « illimité ». Le
 * commentaire précédent disait « entier positif », ce qui était ambigu, alors
 * que la règle acceptait déjà zéro. C'est la règle qui est juste ; c'est le
 * mot qui était faux.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Migration AVANT code. La signature change : l'ancienne à quatre arguments
 * est explicitement retirée (voir plus bas — `create or replace` avec un
 * paramètre de plus crée une SURCHARGE, il ne remplace rien).
 *
 * MIGRATION ADDITIVE : aucune table n'est créée ni modifiée.
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
begin
  if p_game_id is null or p_restaurant_id is null then
    raise exception using errcode = 'P0110', message = 'Jeu ou restaurant manquant.';
  end if;

  -- Le jeu est résolu AUTORITATIVEMENT et verrouillé : deux enregistrements
  -- concurrents du même jeu se sérialisent ici.
  select g.restaurant_id into v_resto
  from public.games g
  where g.id = p_game_id
  for update;

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

    /*
     * `->>` rend la représentation textuelle. Un nombre JSON arrive donc en
     * chaîne, et une chaîne aussi : le motif tranche les deux de la même
     * façon. Une valeur JSON `null` donne NULL, distinguée d'une chaîne vide.
     */
    v_poids := btrim(coalesce(v_lot->>'weight', ''));
    if v_poids !~ '^[0-9]{1,3}$' or v_poids::int < 1 or v_poids::int > 100 then
      raise exception using errcode = 'P0113',
        message = format('Lot %s : le poids doit être un entier de 1 à 100 (reçu : « %s »).', v_n, coalesce(v_lot->>'weight', 'vide'));
    end if;
    v_total := v_total + v_poids::int;

    /*
     * Stock : absent ou JSON null = illimité. Sinon un entier de 0 à
     * 999999999 — zéro compris, qui veut dire « épuisé ». Toute autre saisie
     * est REFUSÉE et surtout jamais repliée sur « illimité ».
     */
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

  -- ─── Cohérence des dates, quand la limite est active ───

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

  /*
   * WHITELIST stricte : ces deux colonnes, pas une de plus. Et seules les
   * clés présentes sont écrites — un champ omis conserve sa valeur.
   */
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
    min_spend             = p_jeu->>'min_spend',
    is_date_limit_active  = coalesce((p_jeu->>'is_date_limit_active')::boolean, false),
    start_date            = (p_jeu->>'start_date')::timestamptz,
    end_date              = (p_jeu->>'end_date')::timestamptz,
    is_stock_limit_active = coalesce((p_jeu->>'is_stock_limit_active')::boolean, false),
    requires_menu         = coalesce((p_jeu->>'requires_menu')::boolean, false),
    requires_review_proof = coalesce((p_jeu->>'requires_review_proof')::boolean, false),
    bg_image_url          = p_jeu->>'bg_image_url',
    -- `bg_choice` est un INTEGER en base, pas un texte : mesuré, pas supposé.
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
    and g.restaurant_id = p_restaurant_id;   -- borné au tenant, jamais au seul id

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

  return jsonb_build_object('lots', v_inseres, 'total_poids', v_total);
end;
$$;

comment on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb) is
  'Enregistre design du restaurant, jeu et lots dans UNE transaction, en exigeant que le jeu appartienne au restaurant autorisé. Valide les saisies BRUTES : aucune conversion ne précède la validation.';

/*
 * L'ancienne signature à quatre arguments DOIT partir.
 *
 * `create or replace function` avec un paramètre de plus crée une SURCHARGE.
 * Les deux versions coexisteraient, un appel à quatre arguments continuerait
 * de résoudre vers l'ancienne — celle qui accepte un `quantity` déjà coercé —
 * et un appel ambigu échouerait en `42725 function is not unique`. Le piège a
 * déjà été attrapé une fois par un harnais (migration 20260819040000) ; on ne
 * le laisse pas se reproduire.
 */
drop function if exists public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb);

revoke all on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
