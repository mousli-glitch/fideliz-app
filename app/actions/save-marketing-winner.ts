"use server"

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function saveMarketingWinner(formData: FormData, slug: string, prizeLabel: string) {
  const firstName = formData.get("firstName") as string
  const phone = formData.get("phone") as string
  const marketingOptin = formData.get("marketingOptin") === "on"

  console.log("Tentative sauvegarde:", { firstName, phone, slug, prizeLabel }) 

  if (!firstName || !phone) {
    return { success: false, error: "Champs manquants" }
  }

  // --- 🔥 DÉBUT AJOUT CRM (SÉCURISÉ) ---
  // On récupère l'ID du restaurant pour le CRM
  try {
      const { data: gameInfo } = await supabase
        .from('games')
        .select('restaurant_id')
        .eq('id', slug) // slug est ici l'game_id d'après ton code
        .single()

      if (gameInfo && gameInfo.restaurant_id) {
          // On sauvegarde dans la table PERMANENTE 'contacts'
          await supabase.from('contacts').upsert({
              restaurant_id: gameInfo.restaurant_id,
              phone: phone,
              first_name: firstName,
              marketing_optin: marketingOptin,
              source_game_id: slug
          }, { onConflict: 'restaurant_id, phone' }) // Met à jour si existe déjà
      }
  } catch (err) {
      console.error("Erreur silencieuse CRM:", err) 
      // On ne bloque pas le reste si ça plante ici
  }
  // --- FIN AJOUT CRM ---


  // LA SUITE EST TON CODE D'ORIGINE (INCHANGÉ)
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
    console.error("ERREUR SUPABASE:", error) 
    return { success: false, error: error.message || "Erreur lors de la sauvegarde" }
  }

  return { success: true, winnerId: data.id }
}