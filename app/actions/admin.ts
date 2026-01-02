"use server"

import { createClient } from '@supabase/supabase-js'

// 👇 ON UTILISE LA CLÉ SERVICE ROLE (ADMIN SUPRÊME)
// Cela permet de contourner les règles RLS qui bloquaient l'affichage
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 1. Récupérer tous les gagnants (Pour la liste)
export async function getAdminWinners() {
  const { data, error } = await supabaseAdmin
    .from('winners')
    .select(`
      *,
      games ( name ),
      prizes ( label, color, weight )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Erreur Fetch Winners:", error)
    return []
  }
  return data
}

// 2. Valider un gain (Redeem)
export async function redeemWinnerAction(winnerId: string) {
  const { error } = await supabaseAdmin
    .from('winners')
    .update({ 
      status: 'consumed',
      consumed_at: new Date().toISOString()
    })
    .eq('id', winnerId)

  if (error) throw new Error(error.message)
  
  // On revalidate pour mettre à jour l'interface sans recharger
  return { success: true }
}

// 3. Récupérer les stats (Pour le futur dashboard)
export async function getAdminStats() {
    const { count: winnersCount } = await supabaseAdmin.from('winners').select('*', { count: 'exact', head: true })
    const { count: gamesCount } = await supabaseAdmin.from('games').select('*', { count: 'exact', head: true })
    
    // Exemple simple, on pourra enrichir
    return {
        winners: winnersCount || 0,
        games: gamesCount || 0
    }
}

// 4. Récupérer les infos du restaurant (On prend le premier trouvé pour la V1)
export async function getAdminRestaurant() {
  const { data, error } = await supabaseAdmin
    .from('public_restaurants')
    .select('*')
    .single() // On suppose qu'il n'y a qu'un resto pour l'instant

  if (error) return null
  return data
}

// 5. Mettre à jour le restaurant
export async function updateRestaurantAction(id: string, updates: any) {
  const { error } = await supabaseAdmin
    .from('public_restaurants')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}
// ... (Code précédent : getAdminRestaurant, updateRestaurantAction, etc.)

// 6. Récupérer tous les jeux
export async function getAdminGames() {
  const { data, error } = await supabaseAdmin
    .from('games')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Erreur Fetch Games:", error)
    return []
  }
  return data
}

// 7. Changer le statut d'un jeu (Actif / Inactif)
export async function toggleGameStatusAction(id: string, currentStatus: string) {
  const newStatus = currentStatus === 'active' ? 'ended' : 'active'
  
  // Si on active un jeu, on désactive les autres (Optionnel, pour éviter les conflits)
  if (newStatus === 'active') {
     await supabaseAdmin
       .from('games')
       .update({ status: 'ended' })
       .neq('id', id) // Tous sauf celui-ci
  }

  const { error } = await supabaseAdmin
    .from('games')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 8. Supprimer un jeu (Optionnel)
export async function deleteGameAction(id: string) {
  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}
// ... (Code précédent)

// 9. Créer un jeu
export async function createGameAction(restaurantId: string, name: string, actionType: string, actionUrl: string) {
  const { data, error } = await supabaseAdmin
    .from('games')
    .insert({
      restaurant_id: restaurantId,
      name,
      active_action: actionType,
      action_url: actionUrl,
      status: 'active'
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// 10. Récupérer UN jeu par son ID (pour la page [id])
export async function getAdminGameById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('id', id)
    .single()
    
  if (error) return null
  return data
}

// 11. Récupérer les lots (prizes) d'un jeu
export async function getGamePrizes(gameId: string) {
  const { data, error } = await supabaseAdmin
    .from('prizes')
    .select('*')
    .eq('game_id', gameId)
    .order('weight', { ascending: true })

  if (error) return []
  return data
}

// 12. Créer un lot
export async function createPrizeAction(prizeData: any) {
  const { error } = await supabaseAdmin
    .from('prizes')
    .insert(prizeData)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 13. Supprimer un lot
export async function deletePrizeAction(id: string) {
  const { error } = await supabaseAdmin
    .from('prizes')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}