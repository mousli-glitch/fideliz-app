"use server"

import { createClient } from '@supabase/supabase-js'
import { exigerRole } from '@/lib/securite/garde-action'

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  MODULE SANS AUCUN APPELANT — gardé quand même
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Les douze actions de ce fichier ne sont importées par personne. Elles
 * l'ont longtemps paru : mon premier inventaire cherchait le module par
 * sous-chaîne, et `admin-actions` contient `admin`. Corrigé le 18/08/2026 —
 * ce module est mort.
 *
 * Il est gardé quand même, à la racine (`root`), pour trois raisons.
 *
 * Il porte la clé de service et lit SANS AUCUN FILTRE : `getAdminWinners`
 * renvoie tous les gagnants de toutes les enseignes, prénom et téléphone
 * compris. Une lecture non autorisée est une faille au même titre qu'une
 * écriture.
 *
 * Il est trivial de le réveiller : un import suffit, et la garde vaut alors
 * mieux qu'une bonne intention.
 *
 * Et surtout, `toggleGameStatusAction` portait une mine — voir son
 * commentaire. Laisser du code mort armé est pire que du code mort.
 */

// 👇 ON UTILISE LA CLÉ SERVICE ROLE (ADMIN SUPRÊME)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Racine exigée. Rend `null` si l'appelant passe, un message sinon. */
async function racine(quoi: string): Promise<string | null> {
  const g = await exigerRole(['root'], `admin.${quoi}`)
  return g.ok ? null : g.error
}

// 1. Récupérer tous les gagnants (Pour la liste)
export async function getAdminWinners() {
  if (await racine('winners')) return []

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
    if (await racine('stats')) return { winners: 0, games: 0 }

    const { count: winnersCount } = await supabaseAdmin.from('winners').select('*', { count: 'exact', head: true })
    const { count: gamesCount } = await supabaseAdmin.from('games').select('*', { count: 'exact', head: true })
    
    return {
        winners: winnersCount || 0,
        games: gamesCount || 0
    }
}

// 4. Récupérer les infos du restaurant
export async function getAdminRestaurant() {
  if (await racine('restaurant_lecture')) return null

  const { data, error } = await supabaseAdmin
    .from('public_restaurants')
    .select('*')
    .single()

  if (error) return null
  return data
}

// 5. Mettre à jour le restaurant
export async function updateRestaurantAction(id: string, updates: any) {
  const refus = await racine('restaurant_maj')
  if (refus) return { success: false, error: refus }

  const { error } = await supabaseAdmin
    .from('public_restaurants')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 6. Récupérer tous les jeux
export async function getAdminGames() {
  if (await racine('jeux_lecture')) return []

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

/*
 * 7. Changer le statut d'un jeu (Actif / Inactif)
 *
 * ⚠ CETTE ACTION PORTAIT UNE MINE — corrigée le 18/08/2026.
 *
 * En activant un jeu, elle passait en « ended » tous les jeux dont l'id
 * différait — `.neq('id', id)`, SANS filtre sur le restaurant. Un seul
 * appel aurait éteint les jeux de La Ruche, de Best Pizza et de Soukara
 * en même temps : trois vrais clients, trois QR imprimés menant soudain à
 * « Pas de jeu en cours ».
 *
 * Elle n'a jamais tiré : le module n'a aucun appelant. Mais un import
 * suffisait, et rien dans le code ne signalait le danger. Le `restaurant_id`
 * du jeu visé borne désormais la désactivation — la règle « un seul jeu
 * actif » vaut PAR restaurant, comme partout ailleurs dans le produit
 * (voir la contrainte `one_active_game_per_restaurant`).
 */
export async function toggleGameStatusAction(id: string, currentStatus: string) {
  const refus = await racine('jeu_statut')
  if (refus) return { success: false, error: refus }

  const newStatus = currentStatus === 'active' ? 'ended' : 'active'

  // Si on active un jeu, on désactive les autres — DU MÊME RESTAURANT.
  if (newStatus === 'active') {
    const { data: jeu } = await supabaseAdmin
      .from('games')
      .select('restaurant_id')
      .eq('id', id)
      .maybeSingle()

    const restaurantId = (jeu as { restaurant_id?: string } | null)?.restaurant_id
    if (!restaurantId) return { success: false, error: "Jeu introuvable." }

    await supabaseAdmin
      .from('games')
      .update({ status: 'ended' })
      .eq('restaurant_id', restaurantId)
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
  const refus = await racine('jeu_suppression')
  if (refus) return { success: false, error: refus }

  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 9. Créer un jeu (CORRIGÉ : Archive les anciens d'abord)
export async function createGameAction(restaurantId: string, name: string, actionType: string, actionUrl: string) {
  const refus = await racine('jeu_creation')
  if (refus) throw new Error(refus)
  
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
  if (await racine('jeu_lecture')) return null

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
  if (await racine('lots_lecture')) return []

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
  const refus = await racine('lot_creation')
  if (refus) return { success: false, error: refus }

  const { error } = await supabaseAdmin
    .from('prizes')
    .insert(prizeData)

  if (error) throw new Error(error.message)
  return { success: true }
}

// 13. Supprimer un lot
export async function deletePrizeAction(id: string) {
  const refus = await racine('lot_suppression')
  if (refus) return { success: false, error: refus }

  const { error } = await supabaseAdmin
    .from('prizes')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { success: true }
}