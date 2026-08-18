"use server"

import { createClient } from '@supabase/supabase-js'
import { exigerRole } from '@/lib/securite/garde-action'

// 👇 ON UTILISE LA CLÉ SERVICE ROLE (ADMIN SUPRÊME)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  FICHIER D'AVANT LE MULTI-TENANT — root uniquement
 *
 *  `getAdminWinners()` ne filtre par rien : elle renvoie les gagnants de TOUS
 *  les restaurants, e-mails et prénoms compris. `updateRestaurantAction(id,
 *  updates)` modifie n'importe quel restaurant avec n'importe quel champ. Ces
 *  signatures datent de l'époque où Fideliz servait un seul établissement.
 *
 *  Aucun écran ne les appelle aujourd'hui (vérifié par symbole, pas seulement
 *  par chemin d'import). On ne les supprime pas pour autant — rien ne prouve
 *  qu'elles soient mortes — mais elles sont fermées à tout sauf root.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function garderRoot(action: string) {
  const g = await exigerRole(['root'], action)
  return g.ok
}

// 1. Récupérer tous les gagnants (Pour la liste)
export async function getAdminWinners() {
  if (!await garderRoot("admin_legacy.getAdminWinners")) return []
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

// Récupérer les stats
export async function getAdminStats() {
  if (!await garderRoot("admin_legacy.getAdminStats")) return { winners: 0, games: 0 }
    const { count: winnersCount } = await supabaseAdmin.from('winners').select('*', { count: 'exact', head: true })
    const { count: gamesCount } = await supabaseAdmin.from('games').select('*', { count: 'exact', head: true })
    
    return {
        winners: winnersCount || 0,
        games: gamesCount || 0
    }
}

// 4. Récupérer les infos du restaurant
export async function getAdminRestaurant() {
  if (!await garderRoot("admin_legacy.getAdminRestaurant")) return null
  const { data, error } = await supabaseAdmin
    .from('public_restaurants')
    .select('*')
    .single()

  if (error) return null
  return data
}

// 5. Mettre à jour le restaurant
export async function updateRestaurantAction(id: string, updates: any) {
  if (!await garderRoot("admin_legacy.updateRestaurantAction")) return { success: false }
  const { error } = await supabaseAdmin
    .from('public_restaurants')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 6. Récupérer tous les jeux
export async function getAdminGames() {
  if (!await garderRoot("admin_legacy.getAdminGames")) return []
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
  if (!await garderRoot("admin_legacy.toggleGameStatusAction")) return { success: false }
  const newStatus = currentStatus === 'active' ? 'ended' : 'active'
  
  // Si on active un jeu, on désactive les autres
  if (newStatus === 'active') {
     await supabaseAdmin
       .from('games')
       .update({ status: 'ended' })
       .neq('id', id)
  }

  const { error } = await supabaseAdmin
    .from('games')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 8. Supprimer un jeu
export async function deleteGameAction(id: string) {
  if (!await garderRoot("admin_legacy.deleteGameAction")) return { success: false }
  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 9. Créer un jeu (CORRIGÉ : Archive les anciens d'abord)
export async function createGameAction(restaurantId: string, name: string, actionType: string, actionUrl: string) {
  if (!await garderRoot("admin_legacy.createGameAction")) return { success: false }
  
  // A. On passe tous les jeux existants de ce resto en "ended"
  // pour éviter le conflit "one_active_game_per_restaurant"
  await supabaseAdmin
    .from('games')
    .update({ status: 'ended' })
    .eq('restaurant_id', restaurantId)

  // B. On crée le nouveau jeu "active"
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

// 10. Récupérer UN jeu par son ID
export async function getAdminGameById(id: string) {
  if (!await garderRoot("admin_legacy.getAdminGameById")) return null
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
  if (!await garderRoot("admin_legacy.getGamePrizes")) return []
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
  if (!await garderRoot("admin_legacy.createPrizeAction")) return { success: false }
  const { error } = await supabaseAdmin
    .from('prizes')
    .insert(prizeData)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 13. Supprimer un lot
export async function deletePrizeAction(id: string) {
  if (!await garderRoot("admin_legacy.deletePrizeAction")) return { success: false }
  const { error } = await supabaseAdmin
    .from('prizes')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}