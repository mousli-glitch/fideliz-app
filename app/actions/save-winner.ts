"use server"

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function saveWinner(data: {
  gameId: string
  email: string
  firstName?: string
  phone?: string
  prizeId: string
  prizeTitle: string
}) {
  console.log("💾 Sauvegarde du gagnant...", data.email)

  try {
    // 1. Récupérer le Jeu via le Slug
    const { data: gameRow, error: gameError } = await supabase
      .from('games')
      .select('id, restaurant_id')
      .eq('slug', data.gameId) 
      .single()

    if (gameError || !gameRow) {
      return { success: false, error: "Jeu introuvable" }
    }

    // 2. Insérer le gagnant et RÉCUPÉRER L'ID
    const { data: insertedWinner, error } = await supabase
      .from('winners')
      .insert({
        game_id: gameRow.id,
        restaurant_id: gameRow.restaurant_id,
        email: data.email,
        first_name: data.firstName || "",
        phone: data.phone || "",
        prize_id: data.prizeId,
        prize_title: data.prizeTitle,
        marketing_optin: true, 
        status: 'available'
      })
      .select('id') // Important : on récupère l'ID
      .single()

    if (error) {
      console.error("❌ Erreur Supabase :", error.message)
      return { success: false, error: error.message }
    }

    // 3. On renvoie l'ID au client pour générer le lien QR
    return { success: true, winnerId: insertedWinner.id }

  } catch (err) {
    console.error("❌ Erreur critique :", err)
    return { success: false, error: "Erreur interne" }
  }
}