"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { exigerRestaurantParSlug, tracerAction } from "@/lib/securite/garde-action"

/*
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SES clients.
 *
 * Celle-ci passait par le client de session, donc la RLS s'appliquait déjà :
 * c'est la moins exposée du lot. Mais la RLS de `contacts` est une politique
 * qu'on ne relit pas à chaque fois, et le `slug` venait quand même du
 * navigateur. Le contrôle explicite dit ce qui est attendu, à l'endroit où
 * on le lit.
 */
export async function deleteContactAction(contactIds: string[], slug: string) {
  const garde = await exigerRestaurantParSlug(slug, ["restaurant", "root"], "client.suppression")
  if (!garde.ok) return { success: false, error: garde.error }

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return { success: false, error: "Aucun client sélectionné." }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("contacts")
    .delete()
    .in("id", contactIds) // Cible uniquement la table contacts
    .eq("restaurant_id", garde.restaurant!.id) // et uniquement ceux de ce restaurant

  if (error) {
      console.error("Erreur suppression contact(s):", error)
      return { success: false, error: error.message }
  }
  
  await tracerAction(garde.appelant, 'client.suppression', `${contactIds.length} client(s) supprimé(s)`, {
    restaurantId: garde.restaurant!.id,
    combien: contactIds.length,
  })

  // On rafraîchit la page customers pour que l'export CSV soit à jour
  revalidatePath(`/admin/${slug}/customers`)
  return { success: true }
}