"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export async function activateGameAction(gameId: string, restaurantId: string, slug: string) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) throw new Error("Non connecté")

  if (!gameId || !restaurantId) {
    throw new Error("Paramètres manquants (gameId/restaurantId).")
  }

  // 1) Désactiver le jeu actuellement actif (du resto), sauf celui qu'on veut activer
  // ✅ 'inactive' est autorisé par games_status_check
  const { error: disableError } = await supabase
    .from("games")
    // @ts-ignore
    .update({ status: "inactive" })
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .neq("id", gameId)

  if (disableError) {
    console.error("Erreur désactivation jeux:", disableError)
    throw new Error("Erreur désactivation: " + disableError.message)
  }

  // 2) Activer le jeu demandé (scopé au restaurant)
  const { error: activateError } = await supabase
    .from("games")
    // @ts-ignore
    .update({ status: "active" })
    .eq("id", gameId)
    .eq("restaurant_id", restaurantId)

  if (activateError) {
    console.error("Erreur activation:", activateError)
    throw new Error("Erreur activation: " + activateError.message)
  }

  revalidatePath(`/admin/${slug}/games`)
  return { success: true as const }
}