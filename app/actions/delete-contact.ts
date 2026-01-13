"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

// Modification ici : on accepte un tableau string[]
export async function deleteContactAction(contactIds: string[], slug: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("contacts")
    .delete()
    .in("id", contactIds) // Utilisation de .in pour gérer plusieurs IDs

  if (error) {
      console.error("Erreur suppression contact(s):", error)
      return { success: false, error: error.message }
  }
  
  revalidatePath(`/admin/${slug}/contacts`)
  
  return { success: true }
}