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
  if (!gameId || !restaurantId) throw new Error("Paramètres manquants (gameId/restaurantId).")

  // 1) Désactiver tous les AUTRES jeux du resto
  // ⚠️ On fait un select() pour savoir si RLS/filtre empêche la mise à jour (sinon: 0 rows sans erreur)
  const { data: disabledRows, error: disableError } = await supabase
    .from("games")
    // @ts-ignore
    .update({ status: "inactive" })
    .eq("restaurant_id", restaurantId)
    .neq("id", gameId)
    .select("id,status")

  if (disableError) {
    console.error("Erreur désactivation jeux:", disableError)
    throw new Error("Erreur désactivation: " + disableError.message)
  }

  // 2) Vérif : est-ce qu’il reste un autre jeu actif ?
  const { data: stillActive, error: stillActiveError } = await supabase
    .from("games")
    .select("id,name,status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .neq("id", gameId)

  if (stillActiveError) {
    console.error("Erreur check stillActive:", stillActiveError)
    throw new Error("Erreur check active: " + stillActiveError.message)
  }

  if (stillActive && stillActive.length > 0) {
    // Si tu arrives ici, c’est quasi certain que ton UPDATE précédent n’a pas eu le droit de toucher ce(s) jeu(x)
    console.error("Conflit: jeux encore actifs", stillActive)
    throw new Error(
      `Conflit: un autre jeu est encore actif (${stillActive[0].id}). Vérifie la policy UPDATE sur games.`
    )
  }

  // 3) Activer le jeu demandé (scopé au restaurant)
  const { data: activatedRows, error: activateError } = await supabase
    .from("games")
    // @ts-ignore
    .update({ status: "active" })
    .eq("id", gameId)
    .eq("restaurant_id", restaurantId)
    .select("id,status")

  if (activateError) {
    console.error("Erreur activation:", activateError)
    throw new Error("Erreur activation: " + activateError.message)
  }

  if (!activatedRows || activatedRows.length === 0) {
    // typiquement RLS qui empêche l’UPDATE sur ce jeu
    throw new Error("Activation refusée (0 ligne modifiée). Vérifie la policy UPDATE sur games.")
  }

  revalidatePath(`/admin/${slug}/games`)
}