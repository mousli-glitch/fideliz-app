"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function redeemWinner(formData: FormData) {
  const winnerId = formData.get("winnerId") as string

  if (!winnerId) {
    console.error("ID Manquant")
    return
  }

  console.log("🚀 Validation lancée pour :", winnerId)

  // Connexion Admin (Service Role)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Mise à jour dans la BDD
  const { error } = await supabase
    .from("winners")
    .update({ 
      status: "redeemed",
      redeemed_at: new Date().toISOString()
    })
    .eq("id", winnerId)

  if (error) {
    console.error("❌ Erreur Supabase :", error.message)
    throw new Error(error.message)
  }

  console.log("✅ Gain validé en base !")

  // 2. On actualise TOUT (La page de vérif + La liste des gagnants admin)
  revalidatePath("/", "layout") // Actualise tout le site pour être sûr
  
  // 3. Redirection (Recharge la page actuelle pour afficher le statut "Déjà utilisé")
  redirect(`/verify/${winnerId}`)
}