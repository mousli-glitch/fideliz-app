"use server"

import { createClient } from '@supabase/supabase-js'

// On utilise la Super Clé pour être sûr de tout récupérer sans blocage
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getPublicGameData(restaurantId: string) {
  
  // 1. Récupérer le Restaurant
  const { data: restaurant, error: rError } = await supabaseAdmin
    .from('public_restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single()

  if (rError || !restaurant) return null

  // 2. Récupérer le Jeu ACTIF de ce restaurant
  const { data: game, error: gError } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active') // Seulement le jeu actif
    .single()

  if (gError || !game) {
      // Si pas de jeu actif, on renvoie juste le resto (pour afficher "Pas de jeu en ce moment")
      return { restaurant, game: null, prizes: [] }
  }

  // 3. Récupérer les Lots associés au jeu
  const { data: prizes } = await supabaseAdmin
    .from('prizes')
    .select('*')
    .eq('game_id', game.id)
    .order('weight', { ascending: true })

  return {
    restaurant,
    game,
    prizes: prizes || []
  }
}

// 4. Enregistrer un gagnant (Quand le client valide le formulaire)
export async function registerWinnerAction(gameId: string, prizeId: string, email: string, firstName: string) {
    const { error } = await supabaseAdmin
      .from('winners')
      .insert({
        game_id: gameId,
        prize_id: prizeId,
        email,
        first_name: firstName,
        status: 'available'
      })
    
    if (error) throw new Error(error.message)
    return { success: true }
}