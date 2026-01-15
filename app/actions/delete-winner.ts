"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { logSystemError } from "./log-system-error" // Import du mouchard

export async function deleteWinnerAction(winnerIds: string[], slug: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
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
  
  revalidatePath(`/admin/${slug}/winners`)
  return { success: true }
}