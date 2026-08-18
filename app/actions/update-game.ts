"use server"

import { createClient } from '@supabase/supabase-js'
import { autoriserParJeu } from '@/lib/securite/garde-objet'

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

export async function updateGameAction(gameId: string, data: any) {
  /*
   * Le client transmet DEUX identifiants : le jeu, et le restaurant censé le
   * porter. On ne lit jamais le second. Le jeu est résolu côté serveur et
   * c'est SON propriétaire réel qui décide de l'autorisation.
   *
   * Toutes les écritures ci-dessous n'utilisent ensuite que `restaurantId` et
   * `objetId` — les identifiants résolus, jamais ceux reçus.
   */
  const garde = await autoriserParJeu(gameId, ['restaurant', 'root'], 'jeu.modification')
  if (!garde.ok) return { success: false, error: garde.error }
  const { restaurantId, objetId } = garde

  try {
    // 1. Sauvegarde Resto
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design.primary_color, 
      logo_url: data.design.logo_url,
    }).eq("id", restaurantId)

    if (restoError) throw new Error("Erreur sauvegarde resto: " + restoError.message)

    // 2. Sauvegarde Jeu
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      // Montant minimum : on accepte les décimales (5,90 comme 5.90) et on normalise en "5.9"
      min_spend: normalizeAmount(data.form.min_spend),
      
      // NOUVEAUX CHAMPS DATES & STOCKS
      is_date_limit_active: data.form.is_date_limit_active,
      start_date: data.form.is_date_limit_active && data.form.start_date ? new Date(data.form.start_date).toISOString() : null,
      end_date: data.form.is_date_limit_active && data.form.end_date ? new Date(data.form.end_date).toISOString() : null,
      is_stock_limit_active: data.form.is_stock_limit_active,
      // Condition : consommation d'un menu obligatoire
      requires_menu: !!data.form.requires_menu,
      requires_review_proof: !!data.form.requires_review_proof,

      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style,
      wheel_palette: data.design.wheel_palette,
      wheel_color_1: data.design.wheel_color_1 || null,
      wheel_color_2: data.design.wheel_color_2 || null,
      overlay_style: data.design.overlay_style || 'dark',
      // Recharge automatique du stock
      stock_refill_enabled: !!(data.form.is_stock_limit_active && data.form.stock_refill_enabled),
      stock_refill_period: data.form.stock_refill_period || 'monthly',
    }).eq("id", objetId)

    if (gameError) throw new Error("Erreur update jeu: " + gameError.message)

    // 3. Gestion des lots (Suppression + Insertion propre)
    // On supprime d'abord pour éviter les doublons ou orphelins
    await supabaseAdmin.from('prizes').delete().eq('game_id', objetId)
    
    const prizesToInsert = data.prizes.map((p: any) => {
        // Stock : si limite active, on garde le nombre saisi ; vide/null = illimité (null), PAS 0.
        const qty = data.form.is_stock_limit_active
          ? (p.quantity === null || p.quantity === undefined || p.quantity === "" ? null : Number(p.quantity))
          : null
        return {
          game_id: objetId,
          label: p.label,
          color: "#000000",
          weight: Number(p.weight),
          quantity: qty,
          initial_quantity: qty, // repère "stock de départ" pour la recharge automatique
        }
    })
    
    if (prizesToInsert.length > 0) {
        const { error: prizeError } = await supabaseAdmin.from('prizes').insert(prizesToInsert)
        if (prizeError) throw prizeError
    }

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}