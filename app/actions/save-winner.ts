"use server"

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function saveWinner(data: {
  gameId: string // Ici on recevra le slug (ex: "demo")
  restaurantId: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  prizeId: string
  prizeTitle: string
}) {
  console.log("💾 Sauvegarde en cours pour :", data.email)

  try {
    // 1. On récupère le "slug" qu'on a passé dans gameId (ex: "demo")
    const gameSlug = data.gameId; 

    // 2. On demande à la DB : "Donne-moi l'UUID du jeu qui a le slug 'demo'"
    const { data: gameRow, error: gameError } = await supabase
      .from('games')
      .select('id, restaurant_id')
      .eq('slug', gameSlug) 
      .single()

    if (gameError || !gameRow) {
      console.error("❌ Jeu introuvable via le slug :", gameSlug)
      return { success: false, error: "Jeu introuvable" }
    }

    // 3. On insère avec les VRAIS UUIDs
    const { error } = await supabase.from('winners').insert({
      game_id: gameRow.id,           // L'UUID correct
      restaurant_id: gameRow.restaurant_id, // L'UUID correct
      email: data.email,
      first_name: data.firstName || "",
      last_name: data.lastName || "",
      phone: data.phone || "",
      prize_id: data.prizeId,
      prize_title: data.prizeTitle,
      status: 'available'
    })

    if (error) {
      console.error("❌ Erreur Supabase :", error.message)
      return { success: false, error: error.message }
    }

    console.log("✅ VICTOIRE ! Gagnant enregistré en base.")
    return { success: true }

  } catch (err) {
    console.error("❌ Erreur critique :", err)
    return { success: false, error: "Erreur interne" }
  }
}