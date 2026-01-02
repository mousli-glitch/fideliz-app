"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateGameAction(gameId: string, data: any) {
  try {
    // 1. Update Restaurant
    await supabaseAdmin.from("restaurants").update({
      brand_color: data.design.brand_color,
      text_color: data.design.text_color,
      primary_color: data.design.primary_color,
      logo_url: data.design.logo_url,
      bg_image_url: data.design.bg_image_url
    }).eq("id", data.restaurant_id)

    // 2. Update Game
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend
    }).eq("id", gameId)

    if (gameError) throw new Error("Erreur update jeu: " + gameError.message)

    // 3. NETTOYAGE RADICAL DES LOTS
    // Grâce au SQL de l'étape 1, cette commande ne plantera plus !
    const { error: deleteError } = await supabaseAdmin
      .from("prizes")
      .delete()
      .eq("game_id", gameId)

    if (deleteError) {
        console.error("❌ Impossible de supprimer les anciens lots:", deleteError)
        throw new Error("Erreur nettoyage lots: " + deleteError.message)
    }

    // 4. Insertion des nouveaux lots (Seulement ceux du formulaire)
    const prizesToInsert = data.prizes.map((p: any) => ({
      game_id: gameId,
      label: p.label,
      color: p.color,
      weight: p.weight
    }))
    
    const { error: insertError } = await supabaseAdmin.from("prizes").insert(prizesToInsert)
    if (insertError) throw new Error("Erreur insertion lots: " + insertError.message)

    return { success: true }
  } catch (error: any) {
    console.error("Update Error:", error)
    return { success: false, error: error.message }
  }
}