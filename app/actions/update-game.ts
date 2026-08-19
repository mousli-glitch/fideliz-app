"use server"

import { createClient } from '@supabase/supabase-js'
import { exigerRestaurantParSlug, tracerAction } from '@/lib/securite/garde-action'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * ─── `normalizeAmount` A ÉTÉ RETIRÉE, ET C'EST LE POINT ───
 *
 * Elle faisait exactement ce qu'on reproche à la coercition des stocks :
 *
 *     parseFloat("abc")  -> NaN   -> !isFinite -> "0"
 *     parseFloat("-3")   -> -3    -> n < 0     -> "0"
 *     parseFloat("5abc") -> 5                  -> "5"
 *
 * Une saisie fautive ne produisait pas une erreur : elle produisait une
 * VALEUR MÉTIER. « abc » devenait « aucun minimum », et « 5abc » devenait un
 * minimum de 5 € que personne n'avait demandé. Le gérant n'en savait rien.
 *
 * Et elle rendait « 5.9 » pour une saisie « 5,90 » — la forme précise que
 * `play_game` refuse et remplace par zéro.
 *
 * Le montant part donc BRUT, et `centimes_depuis_saisie` tranche dans la
 * transaction : illisible = refus de l'agrégat entier, jamais un repli.
 */

/*
 * La saisie, TELLE QUELLE.
 *
 * Vide, absente ou nulle -> `null` (une absence reste une absence). Tout le
 * reste part en chaîne, sans conversion : `Number("abc")` vaudrait `NaN`, que
 * JSON sérialise en `null` — c'est-à-dire, pour un stock, « illimité ». Une
 * conversion qui échoue produit une valeur, et une valeur ne ressemble pas à
 * une erreur. La validation appartient à la base, qui refuse au lieu de
 * deviner.
 */
function brut(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === "" ? null : t
}

/*
 * Les deux seuls champs restaurant que cette action a le droit d'écrire, et
 * uniquement ceux que l'appelant a réellement fournis.
 *
 * `?? null` aurait suffi à tout casser : la clé aurait toujours existé, donc
 * un `design` sans `logo_url` aurait transmis `logo_url: null` — et la RPC,
 * qui distingue « clé absente » de « clé à null », aurait effacé le logo. Une
 * absence n'est pas une valeur.
 */
function champsRestaurant(design: any): Record<string, unknown> {
  const champs: Record<string, unknown> = {}
  for (const cle of ["primary_color", "logo_url"] as const) {
    if (design && Object.prototype.hasOwnProperty.call(design, cle)) {
      champs[cle] = design[cle]
    }
  }
  return champs
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ENREGISTRER UN JEU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SON restaurant.
 *
 * ─── P0 CORRIGÉ LE 19/08/2026 : QUATRE DÉFAUTS, TOUS VÉRIFIÉS ───
 *
 * 1. LE JEU N'ÉTAIT BORNÉ À AUCUN TENANT. La garde validait le
 *    `restaurant_id` reçu — c'est bien — mais les mutations visaient
 *    `gameId` seul :
 *
 *        games.update(...).eq('id', gameId)
 *        prizes.delete().eq('game_id', gameId)
 *
 *    Rien ne prouvait que ce jeu appartenait au restaurant autorisé. Un
 *    restaurateur légitime pouvait annoncer SON restaurant et fournir le jeu
 *    d'un CONFRÈRE : réglages modifiés, et surtout LOTS SUPPRIMÉS. La garde
 *    protégeait l'enseigne, pas l'objet — c'est exactement la distinction que
 *    `garde-action.ts` documente, et que ce chemin ne faisait pas.
 *
 * 2. L'ERREUR DU DELETE DES LOTS ÉTAIT IGNORÉE : `await` sans lire `error`.
 *
 * 3. DELETE PUIS INSERT, EN DEUX REQUÊTES HTTP. DELETE réussi + INSERT
 *    échoué = tous les lots perdus, définitivement. Et entre les deux, un
 *    joueur qui lançait la roue tombait sur un jeu sans aucun lot.
 *
 * 4. AUCUNE VALIDATION SERVEUR. La règle « total des poids = 100 % » vivait
 *    uniquement dans les deux composants de page. Une requête qui ne passe
 *    pas par l'écran ne la rencontrait jamais.
 *
 * ─── LA FORME RETENUE ───
 *
 * Le tenant vient de la garde (`garde.restaurant.id`), pas du corps de la
 * requête : `data.restaurant_id` a servi à RÉSOUDRE, il ne sert plus à
 * décider.
 *
 * Le design du restaurant, le jeu et ses lots partent ENSEMBLE dans
 * `enregistrer_jeu_et_lots` (migrations 20260819030000 puis 20260819050000) :
 * une seule transaction, le jeu verrouillé et comparé au tenant, les saisies
 * validées BRUTES avant écriture, le remplacement atomique, et un nombre de
 * lignes affectées exact à chaque étape. Deux appels REST, si soigneux
 * soient-ils, ne peuvent pas être atomiques — c'est la seule forme qui ferme
 * les défauts 2 et 3.
 *
 * ─── DEUX DÉFAUTS DE PLUS, SIGNALÉS AU TOUR SUIVANT ───
 *
 * 5. L'ACTION COMPLÈTE N'ÉTAIT TOUJOURS PAS ATOMIQUE. Le couple jeu+lots
 *    l'était, mais le design du restaurant s'écrivait AVANT l'appel : un
 *    refus rendait `success: false` alors que couleur et logo avaient déjà
 *    changé. Décaler ce PATCH après l'appel n'aurait fait que déplacer l'état
 *    partiel — les trois écritures partent donc ensemble, et seuls deux
 *    champs du restaurant sont acceptés, par whitelist.
 *
 * 6. UNE SAISIE INVALIDE DEVENAIT UNE VALEUR MÉTIER VALIDE. `Number("abc")`
 *    vaut `NaN`, que JSON sérialise en `null` — et pour `quantity`, `null`
 *    signifie « stock illimité ». La validation n'était pas contournée : elle
 *    n'avait plus rien à valider. Les saisies partent désormais BRUTES.
 */
export async function updateGameAction(gameId: string, data: any) {
  const garde = await exigerRestaurantParSlug(
    data?.restaurant_id,
    ['restaurant', 'root'],
    'jeu.modification'
  )
  if (!garde.ok) return { success: false, error: garde.error }

  if (!gameId) return { success: false, error: "Jeu manquant." }
  if (!garde.restaurant?.id) {
    return { success: false, error: "Restaurant non résolu : enregistrement annulé." }
  }
  // Le tenant autoritatif. Tout ce qui suit s'y rapporte.
  const restaurantId = garde.restaurant.id

  try {
    /*
     * ─── UN SEUL ACTE ───
     *
     * La version précédente écrivait le design du restaurant AVANT d'appeler
     * la fonction. Un refus — un poids invalide, un total différent de 100 —
     * rendait donc `success: false` alors que la couleur et le logo avaient
     * déjà changé. Décaler ce PATCH après l'appel n'aurait fait que déplacer
     * l'état partiel. Les trois écritures partent ensemble.
     *
     * ─── NE JAMAIS CONVERTIR AVANT DE VALIDER ───
     *
     * `Number("abc")` vaut `NaN`, et `JSON.stringify(NaN)` vaut `"null"`.
     * Pour `quantity`, `null` signifie « stock illimité » : une saisie
     * alphabétique arrivait donc en base sous la forme d'un lot parfaitement
     * valide et sans limite. La validation n'était pas contournée — elle
     * n'avait plus rien à valider, la valeur avait déjà été transformée.
     *
     * On transmet donc la saisie BRUTE, et c'est la fonction qui tranche.
     */
    const lots = (Array.isArray(data.prizes) ? data.prizes : []).map((p: any) => ({
      label: p?.label,
      color: "#000000",
      weight: brut(p?.weight),
      // Limite de stock inactive : illimité, quoi qu'ait saisi le gérant.
      quantity: data.form?.is_stock_limit_active ? brut(p?.quantity) : null,
    }))

    const { error: eEnregistrement } = await supabaseAdmin.rpc("enregistrer_jeu_et_lots", {
      p_game_id: gameId,
      p_restaurant_id: restaurantId,
      // Whitelist stricte : ces deux champs, pas un de plus — et seulement
      // s'ils sont RÉELLEMENT présents. Signalé le 19/08/2026 : avec
      // `?? null`, la clé existait toujours, donc un `design` sans `logo_url`
      // transmettait `logo_url: null` et EFFAÇAIT le logo. La RPC conserve
      // bien les clés omises ; c'était l'action qui n'en omettait jamais.
      p_restaurant: champsRestaurant(data.design),
      p_jeu: {
        name: data.form?.name,
        active_action: data.form?.active_action,
        action_url: data.form?.action_url,
        validity_days: data.form?.validity_days,
        /*
         * L'interrupteur « Minimum de commande » ÉTEINT retire la condition.
         *
         * Sans cette ligne, éteindre l'interrupteur sur une fiche existante
         * masquait le champ à l'écran et laissait le montant en base : le
         * restaurateur croyait avoir retiré la condition, son client se la
         * voyait encore opposée en caisse.
         *
         * `=== false` et non `!` : un champ ABSENT n'est pas un refus, et
         * transformer une information manquante en décision métier est
         * exactement le défaut que le contrat monétaire ferme par ailleurs.
         *
         * « 0 » plutôt que la chaîne vide : c'est un « aucun minimum »
         * EXPLICITE, que la grammaire stricte accepte sans ambiguïté.
         */
        min_spend: data.form?.has_min_spend === false ? '0' : brut(data.form?.min_spend),
        is_date_limit_active: !!data.form?.is_date_limit_active,
        start_date: data.form?.is_date_limit_active && data.form?.start_date
          ? new Date(data.form.start_date).toISOString() : null,
        end_date: data.form?.is_date_limit_active && data.form?.end_date
          ? new Date(data.form.end_date).toISOString() : null,
        is_stock_limit_active: !!data.form?.is_stock_limit_active,
        requires_menu: !!data.form?.requires_menu,
        requires_review_proof: !!data.form?.requires_review_proof,
        bg_image_url: data.design?.bg_image_url,
        bg_choice: data.design?.bg_choice,
        title_style: data.design?.title_style,
        card_style: data.design?.card_style,
        wheel_palette: data.design?.wheel_palette,
        wheel_color_1: data.design?.wheel_color_1 || null,
        wheel_color_2: data.design?.wheel_color_2 || null,
        overlay_style: data.design?.overlay_style || 'dark',
        stock_refill_enabled: !!(data.form?.is_stock_limit_active && data.form?.stock_refill_enabled),
        stock_refill_period: data.form?.stock_refill_period || 'monthly',
      },
      p_lots: lots,
    })

    if (eEnregistrement) {
      /*
       * Rien n'a été écrit : la transaction entière a été annulée. Les lots
       * d'avant sont intacts — c'est tout l'objet de la fonction.
       */
      return { success: false, error: eEnregistrement.message }
    }

    await tracerAction(garde.appelant, 'jeu.modification', 'Jeu enregistré', {
      restaurantId,
      gameId,
      lots: lots.length,
    })

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}
