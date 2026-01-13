"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export async function deleteContactAction(contactId: string, slug: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("contacts") // On cible la table des contacts
    .delete()
    .eq("id", contactId)

  if (error) {
      console.error("Erreur suppression contact:", error)
      return { success: false, error: error.message }
  }
  
  // On rafraîchit la page des contacts pour mettre à jour la liste
  revalidatePath(`/admin/${slug}/contacts`)
  
  return { success: true }
}