"use server"

import { createClient } from "@supabase/supabase-js" // Import direct pour utiliser la clé maître
import { revalidatePath } from "next/cache"

export async function deleteWinnerAction(winnerIds: string[], slug: string) {
  // 1. INITIALISATION AVEC LA CLÉ MAÎTRESSE
  // Cela permet de bypasser le RLS et de forcer la suppression en tant que Super Admin
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // 2. SUPPRESSION CIBLÉE
  // On ne touche qu'à la table 'winners'. Les 'contacts' (CRM) ne sont pas affectés.
  const { error } = await supabase
    .from("winners")
    .delete()
    .in("id", winnerIds) 

  if (error) {
      console.error("Erreur suppression gagnant(s):", error)
      return { success: false, error: error.message }
  }
  
  // 3. RAFRAÎCHISSEMENT DE LA PAGE
  revalidatePath(`/admin/${slug}/winners`)
  return { success: true }
}