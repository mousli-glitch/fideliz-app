"use server"

import { createClient } from '@supabase/supabase-js'
import { exigerRestaurantParSlug } from '@/lib/securite/garde-action'

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
export async function createGameAction(data: any) {
  const garde = await exigerRestaurantParSlug(data?.slug, ['restaurant', 'root'], 'jeu.creation')
  if (!garde.ok) return { success: false, error: garde.error }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("ERREUR CONFIG : La clé SUPABASE_SERVICE_ROLE_KEY est manquante.")
    }
    
    if (!data.slug) throw new Error("ERREUR : Le slug du restaurant est manquant.")

    // Validation
    if (!data.form.name || data.form.name.trim() === "") throw new Error("Le nom du jeu est obligatoire.")
    if (!data.form.action_url || data.form.action_url.trim() === "") throw new Error("Le lien d'action (URL) est manquant.")
    if (data.form.validity_days < 1) throw new Error("La durée de validité doit être d'au moins 1 jour.")

    /*
     * LE MONTANT, VALIDÉ AVANT LA MOINDRE ÉCRITURE.
     *
     * Ce chemin n'est pas encore transactionnel — c'est un P0 distinct, non
     * traité ici — mais une saisie illisible doit au moins refuser AVANT que
     * quoi que ce soit ne bouge, plutôt que d'être silencieusement convertie
     * en « aucun minimum ».
     */
    const { data: centimesBruts, error: eMontant } = await supabaseAdmin
      .rpc("centimes_depuis_saisie", { p_saisie: brut(data.form?.min_spend) })

    if (eMontant) {
      return { success: false, error: eMontant.message }
    }
    const minSpendCents: number = centimesBruts ?? 0

    // Trouver le restaurant
    const { data: restaurant, error: restoError } = await supabaseAdmin
        .from("restaurants")
        .select("id, replay_enabled, replay_delay_hours, action_sequence, identify_first, ip_rate_limit_per_hour")
        .eq("slug", data.slug)
        .single()

    if (restoError || !restaurant) throw new Error("Restaurant introuvable pour le slug : " + data.slug)
    
    const restaurantId = restaurant.id

    // Mise à jour design resto
    await supabaseAdmin.from("restaurants").update({
      brand_color: data.design.brand_color, 
      primary_color: data.design.primary_color,
      logo_url: data.design.logo_url,
    }).eq("id", restaurantId)

    // 4. DÉSACTIVER LES ANCIENS JEUX (AUTOMATIQUE)
    await supabaseAdmin
        .from("games")
        .update({ status: 'ended' }) 
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")

    // 5. CRÉER LE NOUVEAU JEU (DIRECTEMENT ACTIF)
    const { data: game, error: gameError } = await supabaseAdmin.from("games").insert({
      restaurant_id: restaurantId,
      name: data.form.name,
      status: "active",
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      // Les DEUX représentations, issues de la même source validée.
      min_spend: texteDepuisCentimes(minSpendCents),
      min_spend_cents: minSpendCents,
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style || 'light',
      wheel_palette: data.design.wheel_palette,
      wheel_color_1: data.design.wheel_color_1 || null,
      wheel_color_2: data.design.wheel_color_2 || null,
      overlay_style: data.design.overlay_style || 'dark',
      // Conditions (dates / stock / menu)
      is_stock_limit_active: !!data.form.is_stock_limit_active,
      // Recharge automatique du stock
      stock_refill_enabled: !!(data.form.is_stock_limit_active && data.form.stock_refill_enabled),
      stock_refill_period: data.form.stock_refill_period || 'monthly',
      requires_menu: !!data.form.requires_menu,
      requires_review_proof: !!data.form.requires_review_proof,
      is_date_limit_active: !!data.form.is_date_limit_active,
      start_date: data.form.start_date ? new Date(data.form.start_date).toISOString() : null,
      end_date: data.form.end_date ? new Date(data.form.end_date).toISOString() : null,
      // Config héritée du RESTAURANT (rejouabilité, mode sécurisé, anti-triche)
      replay_enabled: !!(restaurant as any).replay_enabled,
      replay_delay_hours: (restaurant as any).replay_delay_hours || 24,
      action_sequence: (restaurant as any).action_sequence || [],
      ip_rate_limit_per_hour: (restaurant as any).ip_rate_limit_per_hour || 5,
      identify_first: !!(restaurant as any).identify_first
    }).select().single()

    if (gameError) throw new Error("Erreur création jeu: " + gameError.message)

    // Création des lots
    if (data.prizes && data.prizes.length > 0) {
        const prizesToInsert = data.prizes.map((p: any) => {
          // Stock : null = illimité (∞), un nombre = plafond
          const qty = data.form?.is_stock_limit_active
            ? (p.quantity === null || p.quantity === undefined || p.quantity === "" ? null : Number(p.quantity))
            : (p.quantity ?? null)
          return {
            game_id: game.id,
            label: p.label,
            color: p.color || "#000000",
            weight: Number(p.weight),
            quantity: qty,
            initial_quantity: qty, // repère "stock de départ" pour la recharge automatique
          }
        })
        await supabaseAdmin.from("prizes").insert(prizesToInsert)
    }

    return { success: true, message: "Le jeu a été créé et activé avec succès !" }

  } catch (error: any) {
    console.error("🚨 ERREUR CRITIQUE:", error.message)
    return { success: false, error: error.message }
  }
}