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

    // --- 🔥 DÉBUT AJOUT CRM (SÉCURISÉ) ---
    try {
        await supabase.from('contacts').upsert({
            restaurant_id: gameRow.restaurant_id,
            email: data.email,
            first_name: data.firstName || "",
            phone: data.phone || null,
            marketing_optin: true, // Ici tu forçais à true dans ton code d'origine
            source_game_id: gameRow.id
        }, { onConflict: 'restaurant_id, email' })
    } catch (crmError) {
        console.error("⚠️ Erreur sauvegarde CRM (non bloquant):", crmError)
    }
    // --- FIN AJOUT CRM ---

    // 2. Insérer le gagnant et RÉCUPÉRER L'ID (Code d'origine)
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
      .select('id') 
      .single()

    if (error) {
      console.error("❌ Erreur Supabase :", error.message)
      return { success: false, error: error.message }
    }

    return { success: true, winnerId: insertedWinner.id }

  } catch (err) {
    console.error("❌ Erreur critique :", err)
    return { success: false, error: "Erreur interne" }
  }
}