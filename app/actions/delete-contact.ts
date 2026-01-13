"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export async function deleteContactAction(contactIds: string[], slug: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("contacts")
    .delete()
    .in("id", contactIds) // Cible uniquement la table contacts

  if (error) {
      console.error("Erreur suppression contact(s):", error)
      return { success: false, error: error.message }
  }
  
  // On rafraîchit la page customers pour que l'export CSV soit à jour
  revalidatePath(`/admin/${slug}/customers`)
  return { success: true }
}