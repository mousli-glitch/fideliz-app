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
 * Le jeu et ses lots partent ensemble dans `enregistrer_jeu_et_lots`
 * (migration 20260819030000) : une seule transaction, le jeu verrouillé et
 * comparé au tenant, les lots validés avant écriture, le remplacement
 * atomique. Deux appels REST, si soigneux soient-ils, ne peuvent pas être
 * atomiques — c'est la seule forme qui ferme le défaut 3.
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
    // 1. Design du restaurant — borné au tenant résolu, et son erreur est lue.
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design?.primary_color,
      logo_url: data.design?.logo_url,
    }).eq("id", restaurantId)

    if (restoError) {
      return { success: false, error: "Erreur sauvegarde restaurant : " + restoError.message }
    }

    /*
     * 2. Le jeu ET ses lots, atomiquement.
     *
     * Les lots partent tels quels ; c'est la fonction qui valide libellés,
     * poids et stocks, parce que c'est le seul endroit qu'aucune requête ne
     * peut contourner.
     */
    const lots = (Array.isArray(data.prizes) ? data.prizes : []).map((p: any) => {
      // Stock : si la limite est active, on garde le nombre saisi ;
      // vide/null = illimité (null), PAS 0.
      const qty = data.form?.is_stock_limit_active
        ? (p.quantity === null || p.quantity === undefined || p.quantity === "" ? null : Number(p.quantity))
        : null
      return { label: p.label, color: "#000000", weight: Number(p.weight), quantity: qty }
    })

    const { error: eEnregistrement } = await supabaseAdmin.rpc("enregistrer_jeu_et_lots", {
      p_game_id: gameId,
      p_restaurant_id: restaurantId,
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
