"use server"

// 1. On garde l'import standard pour l'ADMIN (Lecture)
import { createClient as createAdminClient } from '@supabase/supabase-js'
// 2. On ajoute l'import pour l'UTILISATEUR (Écriture sécurisée)
import { createClient as createAuthClient } from '@/utils/supabase/server'

import { revalidatePath } from 'next/cache'

// On garde votre instance Admin globale pour la lecture
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function validateWinAction(winnerId: string) {
  try {
    console.log("🔍 Tentative de validation pour l'ID gagnant :", winnerId)

    // =========================================================================
    // ÉTAPE 1 : LECTURE & VÉRIFICATION (Code INCHANGÉ)
    // =========================================================================
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

    if (fetchError || !win) {
      console.error("❌ Gain introuvable :", fetchError)
      return { success: false, message: "Ce QR Code est invalide ou introuvable." }
    }

    const prizeData = Array.isArray(win.prizes) ? win.prizes[0] : win.prizes

    // =========================================================================
    // ÉTAPE 2 : LOGIQUE DÉJÀ UTILISÉ (Code INCHANGÉ)
    // =========================================================================
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

    // =========================================================================
    // ÉTAPE 3 : VALIDATION SÉCURISÉE (PATCH ICI)
    // =========================================================================
    const supabaseAuth = await createAuthClient()

    // ✅ AJOUT 1 : Vérifie que la Server Action a bien une session (sinon update refusé)
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser()
    if (userErr || !userData?.user) {
      console.error("⛔ Pas de session utilisateur côté server action :", userErr)
      return {
        success: false,
        message: "⛔ Vous devez être connecté au dashboard du restaurant pour valider ce ticket."
      }
    }

    const { data: updated, error: updateError } = await supabaseAuth
      .from("winners")
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq("id", winnerId)
      .eq("status", "available") // ✅ évite double validation + détecte incohérences
      .select("id,status,redeemed_at") // ✅ force un retour pour savoir si une ligne a été modifiée

    if (updateError) {
      console.error("❌ Erreur lors de la validation :", updateError)

      if (
        updateError.code === '42501' ||
        updateError.message?.toLowerCase().includes('row-level security')
      ) {
        // ✅ AJOUT 2 : Message plus clair (même logique)
        return { success: false, message: "⛔ ACCÈS REFUSÉ : connexion au dashboard du restaurant requise." }
      }

      return { success: false, message: "Erreur technique lors de la validation." }
    }

    // ✅ Cas critique : aucune ligne n’a été modifiée (RLS / mauvais ID / status != available)
    if (!updated || updated.length === 0) {
      return {
        success: false,
        message: "⛔ Aucune ligne validée (déjà utilisé, ID invalide, ou droits insuffisants)."
      }
    }

    // =========================================================================
    // ÉTAPE 4 : SUCCÈS (Code INCHANGÉ)
    // =========================================================================
    console.log("✅ Gain validé avec succès !")

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
