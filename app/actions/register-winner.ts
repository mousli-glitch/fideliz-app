"use server"

import { createClient } from '@supabase/supabase-js'

console.log("🔑 Vérification Clé Admin:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "Présente" : "ABSENTE !")

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function registerWinnerAction(data: any) {
  console.log("🚀 Action registerWinnerAction lancée avec :", data)

  try {
    // 1. On vérifie le jeu
    // 🔥 MODIF : J'ai ajouté 'restaurant_id' dans le select pour pouvoir l'utiliser après
    const { data: game, error: gameError } = await supabaseAdmin
      .from('games')
      .select('validity_days, min_spend, restaurant_id') 
      .eq('id', data.game_id)
      .single()
    
    if (gameError) {
        console.error("❌ Erreur Récupération Jeu:", gameError)
        return { success: false, error: "Jeu introuvable: " + gameError.message }
    }

    console.log("✅ Jeu trouvé, calcul expiration...")

    // --- 🔥 DÉBUT AJOUT CRM (SÉCURISÉ) ---
    // On profite qu'on a toutes les données pour sauvegarder dans le CRM
    if (game.restaurant_id) {
       try {
         await supabaseAdmin.from('contacts').upsert({
            restaurant_id: game.restaurant_id,
            email: data.email,
            phone: data.phone || null, // Peut être null ici
            first_name: data.first_name,
            marketing_optin: data.opt_in,
            source_game_id: data.game_id
         }, { onConflict: 'restaurant_id, email' })
       } catch (crmError) {
         console.error("⚠️ Erreur sauvegarde CRM (non bloquant):", crmError)
       }
    }
    // --- FIN AJOUT CRM ---

    // 2. Calcul date (Code d'origine)
    const days = game.validity_days || 30
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + days)

    // 3. Insertion (Code d'origine)
    console.log("💾 Tentative d'insertion dans 'winners'...")
    const { data: winner, error: insertError } = await supabaseAdmin
      .from('winners')
      .insert({
        game_id: data.game_id,
        prize_id: data.prize_id,
        email: data.email,
        phone: data.phone || "Non renseigné",
        first_name: data.first_name,
        marketing_optin: data.opt_in,
        expires_at: expiresAt.toISOString(),
        status: 'available'
      })
      .select()
      .single()

    if (insertError) {
        console.error("❌ ERREUR INSERTION SQL:", insertError)
        return { success: false, error: "Erreur SQL: " + insertError.message }
    }

    console.log("✨ Gagnant enregistré avec succès :", winner.id)

    return {
      success: true,
      ticket: {
        winner_id: winner.id,
        qr_code: winner.id,
        expires_at: winner.expires_at,
        min_spend: game.min_spend || 0
      }
    }

  } catch (error: any) {
    console.error("🚨 CRASH SERVEUR:", error)
    return { success: false, error: "Crash: " + error.message }
  }
}