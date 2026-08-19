"use server"

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { exigerRestaurantParSlug, tracerAction } from '@/lib/securite/garde-action'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * ─── `normalizeAmount` A ÉTÉ RETIRÉE ───
 *
 * Elle transformait une saisie fautive en VALEUR MÉTIER, sans rien signaler :
 *
 *     parseFloat("abc")  -> NaN  -> "0"   (« aucun minimum »)
 *     parseFloat("-3")   -> -3   -> "0"
 *     parseFloat("5abc") -> 5    -> "5"   (un minimum inventé)
 *
 * La grammaire monétaire vit désormais en UN seul endroit,
 * `public.centimes_depuis_saisie` — la recopier ici garantirait qu'un jour
 * les deux divergent. On l'appelle, on ne la duplique pas.
 */

/** La saisie telle quelle : vide/absent -> null, jamais une conversion. */
function brut(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === "" ? null : t
}

/**
 * La forme textuelle d'un montant, DÉRIVÉE des centimes — arithmétique
 * entière uniquement, aucun flottant : `590 -> "5.90"`, `1200 -> "12"`.
 */
function texteDepuisCentimes(centimes: number): string {
  if (centimes % 100 === 0) return String(centimes / 100)
  return `${Math.floor(centimes / 100)}.${String(centimes % 100).padStart(2, "0")}`
}

/*
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SON restaurant.
 *
 * Le `slug` reçu servait directement à retrouver le restaurant sur lequel
 * créer le jeu. Créer un jeu bascule l'ancien en `ended` : un slug étranger
 * suffisait donc à éteindre le jeu d'un confrère, et son QR imprimé avec.
 */
/**
 * Les seuls champs restaurant que la création a le droit d'écrire, et
 * uniquement ceux réellement fournis. Une absence n'est pas une valeur : avec
 * `?? null`, la clé existerait toujours et effacerait le champ.
 */
function champsRestaurant(design: any): Record<string, unknown> {
  const champs: Record<string, unknown> = {}
  for (const cle of ["primary_color", "brand_color", "logo_url"] as const) {
    if (design && Object.prototype.hasOwnProperty.call(design, cle)) champs[cle] = design[cle]
  }
  return champs
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRÉER UN JEU — UN SEUL ACTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── CE QUE CE CHEMIN FAISAIT, ET POURQUOI C'ÉTAIT DANGEREUX ───
 *
 * Cinq requêtes séparées à la clé de service, plusieurs erreurs non lues : le
 * design du restaurant, la désactivation des anciens jeux, l'insertion des
 * lots. Un échec tardif laissait donc, en production :
 *
 *   — les anciens jeux TERMINÉS et le nouveau jamais créé : le restaurant
 *     n'a plus de jeu, et son QR imprimé ne mène nulle part ;
 *   — ou un jeu créé SANS AUCUN LOT : la roue tourne sur du vide.
 *
 * Et le restaurant était re-résolu depuis `data.slug` — une valeur du
 * NAVIGATEUR — alors que la garde l'avait déjà résolu ET autorisé. Celle qui
 * décide doit être celle qui autorise.
 *
 * Les poids et stocks passaient par `Number(...)`, qui transforme `"abc"` en
 * `NaN` puis, via JSON, en `null` — c'est-à-dire en « stock illimité ». Une
 * saisie fautive devenait une valeur métier.
 *
 * ─── LA FORME RETENUE ───
 *
 * Le tenant vient de `garde.restaurant.id`. Les saisies partent BRUTES. Tout
 * — design, fin des anciens jeux, création, lots — part dans
 * `creer_jeu_et_lots` (migration 20260819090000) : une transaction, le
 * restaurant verrouillé, la validation avant la moindre écriture, des
 * `row_count` exacts. Un refus ne laisse aucun état partiel.
 */
export async function createGameAction(data: any) {
  const garde = await exigerRestaurantParSlug(data?.slug, ['restaurant', 'root'], 'jeu.creation')
  if (!garde.ok) return { success: false, error: garde.error }

  if (!garde.restaurant?.id) {
    return { success: false, error: "Restaurant non résolu : création annulée." }
  }
  // Le tenant autoritatif : celui que la garde a résolu ET autorisé.
  const restaurantId = garde.restaurant.id

  try {
    const lots = (Array.isArray(data.prizes) ? data.prizes : []).map((p: any) => ({
      label: p?.label,
      color: p?.color ?? "#000000",
      weight: brut(p?.weight),
      // Limite de stock inactive : illimité, quoi qu'ait saisi le gérant.
      quantity: data.form?.is_stock_limit_active ? brut(p?.quantity) : null,
    }))

    const { data: resultat, error } = await supabaseAdmin.rpc("creer_jeu_et_lots", {
      p_restaurant_id: restaurantId,
      // Whitelist stricte, et seulement les clés réellement fournies.
      p_restaurant: champsRestaurant(data.design),
      p_jeu: {
        name: data.form?.name,
        active_action: data.form?.active_action,
        action_url: data.form?.action_url,
        validity_days: data.form?.validity_days,
        // BRUT : c'est la base qui valide, et qui refuse.
        min_spend: brut(data.form?.min_spend),
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

    if (error) {
      /*
       * Rien n'a été écrit : la transaction entière est annulée. Les anciens
       * jeux sont toujours actifs, et le QR imprimé fonctionne toujours.
       */
      return { success: false, error: error.message }
    }

    await tracerAction(garde.appelant, 'jeu.creation', 'Jeu créé', {
      restaurantId,
      gameId: (resultat as { game_id?: string } | null)?.game_id ?? null,
      lots: lots.length,
    })

    revalidatePath(`/admin/${garde.restaurant.slug}/games`)
    return { success: true, gameId: (resultat as { game_id?: string } | null)?.game_id ?? null }
  } catch (error: any) {
    console.error("🚨 ERREUR CREATION JEU:", error.message)
    return { success: false, error: error.message }
  }
}
