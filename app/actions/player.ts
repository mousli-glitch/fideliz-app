"use server"

import { createClient } from '@supabase/supabase-js'
import { exigerRole } from '@/lib/securite/garde-action'

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
/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  DOUBLON NON PROTÉGÉ — fermé
 *
 *  Cette fonction insère un gagnant directement, en `service_role` : ni
 *  session, ni limite par IP, ni RPC. Telle quelle, c'est un distributeur de
 *  tickets gagnants — pour le jeu et le lot de son choix, autant de fois qu'on
 *  veut, sur le dos de n'importe quel restaurant.
 *
 *  La vraie inscription vit dans `register-winner.ts` : elle passe par la RPC
 *  `register_win` et compte les tentatives par empreinte d'IP. C'est elle
 *  qu'appelle `components/game/public-game-client.tsx`. Celle-ci n'a aucun
 *  appelant (vérifié par symbole). On la ferme sans la supprimer.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function registerWinnerAction(gameId: string, prizeId: string, email: string, firstName: string) {
    const g = await exigerRole(['restaurant', 'root'], 'gagnant.creation_directe')
    if (!g.ok) throw new Error("Action indisponible.")

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