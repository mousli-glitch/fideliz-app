"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateGameAction(gameId: string, data: any) {
  try {
    // 1. Sauvegarde Resto
    const { error: restoError } = await supabaseAdmin.from("restaurants").update({
      primary_color: data.design.primary_color, 
      logo_url: data.design.logo_url,
    }).eq("id", data.restaurant_id)

    if (restoError) throw new Error("Erreur sauvegarde resto: " + restoError.message)

    // 2. Sauvegarde Jeu
    const { error: gameError } = await supabaseAdmin.from("games").update({
      name: data.form.name,
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: String(data.form.min_spend), // <--- ICI : Conversion en TEXTE
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style,
      wheel_palette: data.design.wheel_palette // Ajout de la palette
    }).eq("id", gameId)

    if (gameError) throw new Error("Erreur update jeu: " + gameError.message)

    // 3. Gestion des lots (Upsert sécurisé)
    const prizesToUpsert = data.prizes.map((p: any) => {
        const prize: any = {
            game_id: gameId,
            label: p.label,
            color: "#000000", 
            weight: Number(p.weight)
        };
        // Si l'ID existe, on le met pour faire un UPDATE, sinon ce sera un INSERT
        if (p.id) prize.id = p.id;
        return prize;
    })
    
    if (prizesToUpsert.length > 0) {
        const { error: prizeError } = await supabaseAdmin.from('prizes').upsert(prizesToUpsert)
        if (prizeError) throw prizeError
    }

    return { success: true }
  } catch (error: any) {
    console.error("Erreur Update:", error)
    return { success: false, error: error.message }
  }
}