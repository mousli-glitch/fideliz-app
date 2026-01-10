"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateGameAction(gameId: string, data: any) {
  try {
    // 1. IMPORTANT : On sauvegarde la couleur et le logo dans la table RESTAURANTS
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design.primary_color, 
      logo_url: data.design.logo_url,
    }).eq("id", data.restaurant_id)

    if (restoError) throw new Error("Erreur sauvegarde couleur: " + restoError.message)

    // 2. On sauvegarde les réglages du JEU
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend,
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      // On garde l'enregistrement à la racine pour la structure de table
      card_style: data.design.card_style,
      // 🔥 MODIFICATION : On enregistre aussi dans l'objet design pour la lecture front-end
      design: {
        ...data.design,
        card_style: data.design.card_style
      }
    }).eq("id", gameId)

    if (gameError) throw new Error("Erreur update jeu: " + gameError.message)

    // 3. On remet les lots
    await supabaseAdmin.from("prizes").delete().eq("game_id", gameId)
    
    const prizesToInsert = data.prizes.map((p: any) => ({
      game_id: gameId,
      label: p.label,
      color: p.color,
      weight: p.weight
    }))
    
    await supabaseAdmin.from("prizes").insert(prizesToInsert)

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}