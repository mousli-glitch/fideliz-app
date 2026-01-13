"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

// Modification ici : on accepte un tableau string[]
export async function deleteWinnerAction(winnerIds: string[], slug: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("winners")
    .delete()
    .in("id", winnerIds) // Utilisation de .in pour gérer plusieurs IDs

  if (error) {
      console.error("Erreur suppression gagnant(s):", error)
      return { success: false, error: error.message }
  }
  
  revalidatePath(`/admin/${slug}/winners`)
  
  return { success: true }
}