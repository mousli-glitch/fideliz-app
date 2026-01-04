"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function validateWinAction(winnerId: string) {
  try {
    console.log("🔍 Tentative de validation pour l'ID gagnant :", winnerId)

    // 1. VÉRIFICATION (Lecture seule d'abord)
    const { data: win, error: fetchError } = await supabaseAdmin
      .from("winners") 
      .select(`
        id,
        status,
        redeemed_at,
        prizes (
            label,
            color
        )
      `)
      .eq("id", winnerId)
      .single()

    // Gestion des cas d'erreur de lecture
    if (fetchError || !win) {
      console.error("❌ Gain introuvable :", fetchError)
      return { success: false, message: "Ce QR Code est invalide ou introuvable." }
    }

    // CORRECTION TYPE : On gère le fait que 'prizes' puisse être un tableau ou un objet
    // Le 'as any' permet de faire taire TypeScript qui est un peu trop strict ici
    const prizeData = Array.isArray(win.prizes) ? win.prizes[0] : win.prizes

    // 2. LOGIQUE DE SÉCURITÉ : Est-ce DÉJÀ utilisé ?
    if (win.status === 'redeemed') {
      console.warn("⚠️ Tentative de réutilisation du gain :", winnerId)
      
      const dateUtilisation = win.redeemed_at 
        ? new Date(win.redeemed_at).toLocaleString('fr-FR') 
        : "une date inconnue"

      return { 
        success: false, 
        alreadyUsed: true, 
        message: `❌ DÉJÀ UTILISÉ le ${dateUtilisation}`,
        prize: prizeData // On renvoie le lot nettoyé
      }
    }

    // 3. VALIDATION (Écriture)
    const { error: updateError } = await supabaseAdmin
      .from("winners")
      .update({ 
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq("id", winnerId)

    if (updateError) {
      console.error("❌ Erreur lors de la validation :", updateError)
      return { success: false, message: "Erreur technique lors de la validation." }
    }

    // 4. SUCCÈS
    console.log("✅ Gain validé avec succès !")
    
    return { 
      success: true, 
      message: "✅ GAIN VALIDÉ !",
      // Ici on utilise notre variable 'prizeData' sécurisée
      prizeLabel: prizeData?.label || "Lot mystère",
      prizeColor: prizeData?.color
    }

  } catch (error: any) {
    console.error("🚨 Erreur critique validateWinAction:", error)
    return { success: false, message: "Erreur serveur critique." }
  }
}