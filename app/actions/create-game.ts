"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function createGameAction(data: any) {
  console.log("🚀 ACTION SERVEUR DÉCLENCHÉE !") 

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("ERREUR CONFIG : La clé SUPABASE_SERVICE_ROLE_KEY est manquante.")
    }
    
    if (!data.slug) throw new Error("ERREUR : Le slug du restaurant est manquant.")

    // Validation
    if (!data.form.name || data.form.name.trim() === "") throw new Error("Le nom du jeu est obligatoire.")
    if (!data.form.action_url || data.form.action_url.trim() === "") throw new Error("Le lien d'action (URL) est manquant.")
    if (data.form.validity_days < 1) throw new Error("La durée de validité doit être d'au moins 1 jour.")

    // Trouver le restaurant
    const { data: restaurant, error: restoError } = await supabaseAdmin
        .from("restaurants")
        .select("id")
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

    // 🔥 FIX CRITIQUE : On crée le jeu en 'archived' pour ne pas violer la contrainte d'unicité
    // L'utilisateur devra l'activer manuellement depuis la liste.
    const { data: game, error: gameError } = await supabaseAdmin.from("games").insert({
      restaurant_id: restaurantId,
      name: data.form.name,
      status: "archived", // <--- ICI : On évite le conflit avec le jeu actif actuel
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: String(data.form.min_spend), // <--- ICI : Conversion explicite en TEXTE
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style || 'light',
      wheel_palette: data.design.wheel_palette // Ajout de la palette
    }).select().single()

    if (gameError) throw new Error("Erreur création jeu: " + gameError.message)

    // Création des lots
    if (data.prizes && data.prizes.length > 0) {
        const prizesToInsert = data.prizes.map((p: any) => ({
          game_id: game.id,
          label: p.label,
          color: p.color || "#000000",
          weight: Number(p.weight) // Conversion explicite en NOMBRE
        }))
        await supabaseAdmin.from("prizes").insert(prizesToInsert)
    }

    return { success: true, message: "Le jeu a été créé (en attente d'activation)." }

  } catch (error: any) {
    console.error("🚨 ERREUR CRITIQUE:", error.message)
    return { success: false, error: error.message }
  }
}