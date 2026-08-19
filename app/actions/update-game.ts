"use server"

import { createClient } from '@supabase/supabase-js'
import { exigerRestaurantParSlug, tracerAction } from '@/lib/securite/garde-action'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Normalise un montant saisi par le gérant : accepte "5,90" ou "5.90", garde les centimes.
// Renvoie une chaîne propre ("5.9") car la colonne min_spend est de type texte.
function normalizeAmount(value: any): string {
  if (value === null || value === undefined || value === "") return "0"
  const n = parseFloat(String(value).replace(",", ".").trim())
  if (!isFinite(n) || n < 0) return "0"
  return String(Math.round(n * 100) / 100) // 2 décimales max
}

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
      // Whitelist stricte : ces deux champs, pas un de plus.
      p_restaurant: {
        primary_color: data.design?.primary_color ?? null,
        logo_url: data.design?.logo_url ?? null,
      },
      p_jeu: {
        name: data.form?.name,
        active_action: data.form?.active_action,
        action_url: data.form?.action_url,
        validity_days: data.form?.validity_days,
        min_spend: normalizeAmount(data.form?.min_spend),
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
