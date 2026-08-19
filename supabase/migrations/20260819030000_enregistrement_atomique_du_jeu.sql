/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ENREGISTRER UN JEU SANS POUVOIR PERDRE SES LOTS NI TOUCHER CEUX D'UN AUTRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Signalé le 19/08/2026 sur `updateGameAction`, et vérifié : ce chemin
 * n'avait aucun test, écrivait à la clé de service, et portait quatre
 * défauts distincts.
 *
 * 1. LE JEU N'ÉTAIT BORNÉ À AUCUN TENANT. La garde validait bien le
 *    `restaurant_id` reçu, mais les mutations visaient `gameId` :
 *
 *        games.update(...).eq('id', gameId)
 *        prizes.delete().eq('game_id', gameId)
 *
 *    Rien ne prouvait que ce jeu appartenait au restaurant autorisé. Un
 *    restaurateur parfaitement légitime pouvait donc annoncer SON restaurant
 *    et fournir le jeu d'un CONFRÈRE : réglages modifiés, et surtout lots
 *    supprimés. La garde protégeait l'enseigne, pas l'objet.
 *
 * 2. L'ERREUR DU DELETE DES LOTS ÉTAIT IGNORÉE — `await` sans `error`.
 *
 * 3. LE MODÈLE DELETE-PUIS-INSERT N'ÉTAIT PAS TRANSACTIONNEL. Deux requêtes
 *    HTTP successives : DELETE réussi + INSERT échoué = TOUS LES LOTS PERDUS,
 *    sans rien pour les rendre. Et entre les deux, un joueur qui lançait la
 *    roue voyait un jeu sans aucun lot.
 *
 * 4. AUCUNE VALIDATION CÔTÉ SERVEUR. La règle « le total des poids doit
 *    valoir 100 % » n'existait QUE dans les deux composants de page (relevé
 *    dans `app/admin/[slug]/games/new/page.tsx` et `[id]/page.tsx`). Une
 *    requête qui ne passe pas par l'écran ne la rencontrait jamais — et un
 *    total à 3 % ne fait pas une roue « presque juste », il fait une roue
 *    dont les probabilités affichées sont fausses.
 *
 * ─── CE QUE FAIT CETTE FONCTION, ET POURQUOI ELLE EXISTE ───
 *
 * Une seule transaction, donc :
 *
 *   — le jeu est RÉSOLU depuis la base et VERROUILLÉ (`for update`) : on lit
 *     son restaurant réel, et personne ne peut le déplacer vers une autre
 *     enseigne pendant qu'on écrit ;
 *   — l'appartenance au tenant autorisé est exigée, pas supposée ;
 *   — les lots sont VALIDÉS avant la moindre écriture ;
 *   — le remplacement DELETE+INSERT est atomique : il n'existe aucun instant
 *     où le jeu se retrouve sans lots, et un INSERT qui échoue rend le DELETE
 *     avec lui.
 *
 * C'est la seule forme qui ferme le défaut 3. Deux appels REST, si soigneux
 * soient-ils, ne peuvent pas être atomiques.
 *
 * ─── IDEMPOTENCE ───
 *
 * Rejouer le même appel donne le même état final : le remplacement est une
 * substitution complète, pas un ajout. Deux appels concurrents sur le même
 * jeu se sérialisent sur le `for update`.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Migration AVANT le code. Sans cette fonction, `updateGameAction` refuse et
 * ne touche à rien : dégradation sûre, mais totale.
 *
 * MIGRATION ADDITIVE : aucune table n'est créée ni modifiée.
 */

create or replace function public.enregistrer_jeu_et_lots(
  p_game_id       uuid,
  p_restaurant_id uuid,
  p_jeu           jsonb,
  p_lots          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_resto  uuid;
  v_lot    jsonb;
  v_total  int := 0;
  v_n      int := 0;
  v_poids  text;
  v_qte    text;
  v_inseres int;
begin
  if p_game_id is null or p_restaurant_id is null then
    raise exception using errcode = 'P0110', message = 'Jeu ou restaurant manquant.';
  end if;

  /*
   * Le jeu est résolu AUTORITATIVEMENT et verrouillé. `for update` sert deux
   * choses : sérialiser deux enregistrements concurrents du même jeu, et
   * empêcher qu'on le rattache à une autre enseigne entre le contrôle et
   * l'écriture.
   */
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

    v_poids := v_lot->>'weight';
    if v_poids is null or v_poids !~ '^[0-9]+$' or v_poids::int < 1 then
      raise exception using errcode = 'P0113',
        message = format('Lot %s : le poids doit être un entier supérieur ou égal à 1.', v_n);
    end if;
    v_total := v_total + v_poids::int;

    -- `quantity` absent ou null = stock illimité. Sinon, entier positif.
    v_qte := v_lot->>'quantity';
    if v_qte is not null and (v_qte !~ '^[0-9]+$') then
      raise exception using errcode = 'P0113',
        message = format('Lot %s : le stock doit être un entier positif, ou vide pour « illimité ».', v_n);
    end if;
  end loop;

  if v_n = 0 then
    raise exception using errcode = 'P0113', message = 'Un jeu doit comporter au moins un lot.';
  end if;

  /*
   * La règle des 100 %, qui ne vivait que dans les composants de page. Elle
   * est ici parce qu'une requête qui ne passe pas par l'écran doit la
   * rencontrer quand même.
   */
  if v_total <> 100 then
    raise exception using errcode = 'P0114',
      message = format('Le total des poids doit valoir 100 %% (actuel : %s %%).', v_total);
  end if;

  -- ─── Écritures, toutes dans la même transaction ───

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
    -- Un cast explicite est nécessaire ici, là où PostgREST coercait tout seul.
    -- Une valeur non numérique fait échouer la transaction entière — donc
    -- refuse sans rien détruire, ce qui est le comportement voulu.
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

  delete from public.prizes where game_id = p_game_id;

  insert into public.prizes (game_id, label, color, weight, quantity, initial_quantity)
  select p_game_id,
         btrim(l->>'label'),
         coalesce(nullif(l->>'color', ''), '#000000'),
         (l->>'weight')::int,
         (l->>'quantity')::int,
         (l->>'quantity')::int
  from jsonb_array_elements(p_lots) l;

  get diagnostics v_inseres = row_count;

  /*
   * Conservation exacte : autant de lots enregistrés que reçus. Un écart
   * ferait échouer la transaction entière plutôt que de laisser un jeu
   * amputé.
   */
  if v_inseres <> v_n then
    raise exception using errcode = 'P0115',
      message = format('Conservation rompue : %s lot(s) reçus, %s enregistré(s). Rien n''est conservé.', v_n, v_inseres);
  end if;

  return jsonb_build_object('lots', v_inseres, 'total_poids', v_total);
end;
$$;

comment on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb) is
  'Enregistre un jeu et remplace ses lots, atomiquement, en exigeant que le jeu appartienne au restaurant autorisé. Valide libellés, poids (total 100) et stocks avant toute écriture.';

revoke all on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
