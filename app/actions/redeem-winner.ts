"use server"

import { createClient } from "@supabase/supabase-js"

// Utilisation de la clé secrète CÔTÉ SERVEUR UNIQUEMENT
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function redeemWinner(winnerId: string) {
  // On vérifie que la clé secrète est bien là
  if (!supabaseServiceKey) {
    return { success: false, error: "Configuration serveur manquante (Clé)" }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { error } = await supabase
    .from("winners")
    .update({ 
      status: "redeemed",
      redeemed_at: new Date().toISOString()
    })
    .eq("id", winnerId)

  if (error) {
    console.error("Erreur redeem:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}