"use server"

import { createClient } from "@supabase/supabase-js"

// 👇 CORRECTION ICI : On utilise la clé ANON que tu as déjà
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function saveMarketingWinner(formData: FormData, slug: string, prizeLabel: string) {
  const firstName = formData.get("firstName") as string
  const phone = formData.get("phone") as string
  const marketingOptin = formData.get("marketingOptin") === "on"

  console.log("Tentative sauvegarde:", { firstName, phone, slug, prizeLabel }) // Debug log

  if (!firstName || !phone) {
    return { success: false, error: "Champs manquants" }
  }

  // Insertion
  const { data, error } = await supabase
    .from("winners")
    .insert({
      game_id: slug,            
      prize_title: prizeLabel,
      first_name: firstName,
      phone: phone,
      marketing_optin: marketingOptin,
      status: "available",
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    // 👇 Regarde ton terminal VS Code si ça échoue encore, l'erreur s'affichera là
    console.error("ERREUR SUPABASE:", error) 
    return { success: false, error: error.message || "Erreur lors de la sauvegarde" }
  }

  return { success: true, winnerId: data.id }
}