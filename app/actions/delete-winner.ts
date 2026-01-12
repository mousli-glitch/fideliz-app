"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export async function deleteWinnerAction(winnerId: string, slug: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("winners")
    .delete()
    .eq("id", winnerId)

  if (error) {
      console.error("Erreur suppression gagnant:", error)
      return { success: false, error: error.message }
  }
  
  // On rafraîchit la page des gagnants pour mettre à jour la liste
  revalidatePath(`/admin/${slug}/winners`)
  
  return { success: true }
}