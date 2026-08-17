"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { logSystemError } from "./log-system-error" // Import du mouchard
import { exigerRestaurantParSlug, tracerAction } from "@/lib/securite/garde-action"

/*
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SES gagnants.
 *
 * L'action supprimait par `in("id", winnerIds)` avec la clé de service, sans
 * rien vérifier : ni qui appelait, ni à qui appartenaient ces tickets. Le
 * `slug` reçu ne servait qu'à rafraîchir la bonne page — c'est un paramètre
 * d'URL, donc quelque chose que l'appelant écrit lui-même.
 *
 * Deux contrôles, pas un : le slug est résolu et confronté à la session,
 * puis chaque ticket visé est remonté jusqu'à son jeu pour vérifier qu'il
 * appartient bien à ce restaurant. Le premier sans le second laisserait un
 * restaurateur supprimer les tickets d'un confrère en passant son propre
 * slug.
 */
export async function deleteWinnerAction(winnerIds: string[], slug: string) {
  const garde = await exigerRestaurantParSlug(slug, ["restaurant", "root"], "gagnant.suppression")
  if (!garde.ok) return { success: false, error: garde.error }

  if (!Array.isArray(winnerIds) || winnerIds.length === 0) {
    return { success: false, error: "Aucun gagnant sélectionné." }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Chaque ticket visé appartient-il bien à ce restaurant ?
  const { data: vises } = await supabase
    .from("winners")
    .select("id, games!inner(restaurant_id)")
    .in("id", winnerIds)

  const lignes = (vises ?? []) as unknown as { id: string; games: { restaurant_id: string } }[]
  const etrangers = lignes.filter((l) => l.games?.restaurant_id !== garde.restaurant!.id)

  if (lignes.length !== winnerIds.length || etrangers.length > 0) {
    return { success: false, error: "Certains tickets ne sont pas ceux de ce restaurant." }
  }

  const { error } = await supabase
    .from("winners")
    .delete()
    .in("id", winnerIds)

  if (error) {
      // ON ENREGISTRE L'ERREUR DANS LE TERMINAL ROOT
      await logSystemError({
        message: `Échec suppression gagnant(s)`,
        restaurant_slug: slug,
        details: error
      })
      console.error("Erreur suppression gagnant(s):", error)
      return { success: false, error: error.message }
  }
  
  await tracerAction(garde.appelant, 'gagnant.suppression', `${winnerIds.length} ticket(s) supprimé(s)`, {
    restaurantId: garde.restaurant!.id,
    combien: winnerIds.length,
  })

  revalidatePath(`/admin/${slug}/winners`)
  return { success: true }
}