'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { exigerRestaurantParSlug, tracerAction } from '@/lib/securite/garde-action'

/*
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SON restaurant.
 *
 * L'action vérifiait la session, puis faisait confiance au `restaurantId`
 * reçu du navigateur : seule la RLS empêchait d'activer le jeu d'un
 * confrère. Une politique RLS est une protection qu'on ne relit pas à
 * chaque fois, et qui ne dit rien à qui lit ce fichier.
 *
 * La règle métier est préservée exactement : un seul jeu actif PAR
 * restaurant, les autres repassent en `inactive` — pas en `ended`, comme
 * avant.
 */
export async function activateGameAction(gameId: string, restaurantId: string, slug: string) {
  const garde = await exigerRestaurantParSlug(restaurantId, ['restaurant', 'root'], 'jeu.activation')
  if (!garde.ok) throw new Error(garde.error)

  const supabase = await createClient()

  if (!gameId || !restaurantId) {
    throw new Error("Paramètres manquants (gameId/restaurantId).")
  }

  // ✅ 0) Si le jeu est déjà actif, on ne fait rien (évite un update inutile + course condition)
  const { data: current, error: currentErr } = await supabase
    .from('games')
    .select('id, status')
    .eq('id', gameId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (currentErr || !current) {
    throw new Error("Jeu introuvable pour ce restaurant.")
  }

  if (current.status === 'active') {
    revalidatePath(`/admin/${slug}/games`)
    return { success: true as const }
  }

  // 1) Désactiver (inactive) le jeu actuellement actif du resto (sauf celui qu'on active)
  const { error: pauseError } = await supabase
    .from('games')
    // @ts-ignore
    .update({ status: 'inactive' })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .neq('id', gameId)

  if (pauseError) {
    console.error("Erreur désactivation jeux:", pauseError)
    throw new Error("Erreur désactivation: " + pauseError.message)
  }

  // 2) Activer le jeu demandé (scopé au restaurant)
  const { error: activateError } = await supabase
    .from('games')
    // @ts-ignore
    .update({ status: 'active' })
    .eq('id', gameId)
    .eq('restaurant_id', restaurantId)

  if (activateError) {
    console.error("Erreur activation:", activateError)
    throw new Error("Erreur activation: " + activateError.message)
  }

  revalidatePath(`/admin/${slug}/games`)
  return { success: true as const }
}