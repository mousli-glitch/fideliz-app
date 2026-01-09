"use server"

import { createClient } from '@supabase/supabase-js'

// Initialisation avec la clé ADMIN (Service Role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function createGameAction(data: any) {
  console.log("🚀 ACTION SERVEUR DÉCLENCHÉE !") 

  try {
    // 1. Vérification de sécurité technique
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("ERREUR CONFIG : La clé SUPABASE_SERVICE_ROLE_KEY est manquante dans .env.local")
    }
    
    if (!data.slug) {
        throw new Error("ERREUR : Le slug du restaurant est manquant.")
    }

    // 1.5 🔥 VALIDATION DES CHAMPS (Nouvelle étape) 🔥
    if (!data.form.name || data.form.name.trim() === "") {
        throw new Error("Le nom du jeu est obligatoire.")
    }
    if (!data.form.action_url || data.form.action_url.trim() === "") {
        throw new Error("Le lien d'action (URL) est manquant.")
    }
    if (data.form.validity_days < 1) {
        throw new Error("La durée de validité doit être d'au moins 1 jour.")
    }

    // 2. Trouver le restaurant
    const { data: restaurant, error: restoError } = await supabaseAdmin
        .from("restaurants")
        .select("id")
        .eq("slug", data.slug)
        .single()

    if (restoError || !restaurant) {
        throw new Error("Restaurant introuvable pour le slug : " + data.slug)
    }
    
    const restaurantId = restaurant.id

    // 3. Mettre à jour le design global du resto (Logo/Couleur)
    await supabaseAdmin.from("restaurants").update({
      brand_color: data.design.brand_color, 
      primary_color: data.design.primary_color,
      logo_url: data.design.logo_url,
    }).eq("id", restaurantId)

    // 4. Archiver les anciens jeux
    await supabaseAdmin
        .from("games")
        .update({ status: 'archived' })
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")

    // 5. Créer le jeu (AVEC LE DESIGN)
    const { data: game, error: gameError } = await supabaseAdmin.from("games").insert({
      restaurant_id: restaurantId,
      name: data.form.name,
      status: "active",
      active_action: data.form.active_action,
      action_url: data.form.action_url,
      validity_days: data.form.validity_days,
      min_spend: data.form.min_spend,
      bg_image_url: data.design.bg_image_url,
      bg_choice: data.design.bg_choice,
      title_style: data.design.title_style,
      card_style: data.design.card_style || 'light'
    }).select().single()

    if (gameError) throw new Error(gameError.message)

    // 6. Créer les lots
    if (data.prizes && data.prizes.length > 0) {
        const prizesToInsert = data.prizes.map((p: any) => ({
          game_id: game.id,
          label: p.label,
          color: p.color,
          weight: p.weight
        }))
        await supabaseAdmin.from("prizes").insert(prizesToInsert)
    }

    // ✅ SUCCÈS : On renvoie un message clair
    return { success: true, message: "Le jeu a bien été créé avec succès !" }

  } catch (error: any) {
    console.error("🚨 ERREUR CRITIQUE DANS CREATE-GAME:", error.message)
    // On renvoie l'erreur précise pour l'afficher au client
    return { success: false, error: error.message }
  }
}