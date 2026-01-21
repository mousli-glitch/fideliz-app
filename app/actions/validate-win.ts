"use server"

// 1. On garde le client Admin pour la LECTURE (Vérifications)
import { createClient as createAdminClient } from '@supabase/supabase-js'
// 2. On importe le client Auth pour l'ÉCRITURE (Sécurité RLS)
import { createClient as createAuthClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Client Admin (Service Role) - Pour lire les infos sans blocage
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function validateWinAction(winnerId: string) {
  try {
    console.log("🔍 Tentative de validation pour l'ID gagnant :", winnerId)

    // --- ÉTAPE 1 : LECTURE (On garde votre code intact avec supabaseAdmin) ---
    // On utilise l'Admin pour récupérer les infos et vérifier si c'est déjà utilisé
    // Cela permet d'afficher les détails du lot même avant validation
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

    // Gestion du type Array/Object pour prizes
    const prizeData = Array.isArray(win.prizes) ? win.prizes[0] : win.prizes

    // --- ÉTAPE 2 : LOGIQUE MÉTIER (Déjà utilisé ?) ---
    if (win.status === 'redeemed') {
      console.warn("⚠️ Tentative de réutilisation du gain :", winnerId)
      
      const dateUtilisation = win.redeemed_at 
        ? new Date(win.redeemed_at).toLocaleString('fr-FR') 
        : "une date inconnue"

      return { 
        success: false, 
        alreadyUsed: true, 
        message: `❌ DÉJÀ UTILISÉ le ${dateUtilisation}`,
        prize: prizeData
      }
    }

    // --- ÉTAPE 3 : VALIDATION SÉCURISÉE (C'est ici que ça change) ---
    
    // Au lieu d'utiliser 'supabaseAdmin' (qui a tous les droits),
    // on crée un client lié à l'utilisateur connecté.
    const supabaseAuth = await createAuthClient()

    const { error: updateError } = await supabaseAuth
      .from("winners")
      .update({ 
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq("id", winnerId)

    // Si une erreur survient ici, c'est soit technique, soit un REFUS DE SÉCURITÉ (RLS)
    if (updateError) {
      console.error("❌ Erreur validation :", updateError.message)
      
      // Si c'est une erreur de permission (RLS), on renvoie un message clair
      // (Supabase renvoie souvent "new row violates row-level security policy" ou code 42501)
      if (updateError.code === '42501' || updateError.message.includes('security policy')) {
         return { success: false, message: "⛔ ACCÈS REFUSÉ : Vous devez être Staff pour valider." }
      }

      return { success: false, message: "Erreur technique lors de la validation." }
    }

    // --- ÉTAPE 4 : SUCCÈS ---
    console.log("✅ Gain validé avec succès !")
    
    // On rafraîchit les données pour que le front soit à jour
    revalidatePath("/", "layout")

    return { 
      success: true, 
      message: "✅ GAIN VALIDÉ !",
      prizeLabel: prizeData?.label || "Lot mystère",
      prizeColor: prizeData?.color
    }

  } catch (error: any) {
    console.error("🚨 Erreur critique validateWinAction:", error)
    return { success: false, message: "Erreur serveur critique." }
  }
}