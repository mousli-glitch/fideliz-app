"use server"

// 1. On garde l'import standard pour l'ADMIN (Lecture + écriture sécurisée côté serveur)
import { createClient as createAdminClient } from '@supabase/supabase-js'
// 2. On garde l'import pour l'UTILISATEUR (session)
import { createClient as createAuthClient } from '@/utils/supabase/server'

import { revalidatePath } from 'next/cache'

// Instance Admin (Service Role) côté serveur
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function validateWinAction(winnerId: string) {
  try {
    console.log("🔍 Tentative de validation pour l'ID gagnant :", winnerId)

    // =========================================================================
    // ÉTAPE 1 : LECTURE & VÉRIFICATION (INCHANGÉ)
    // =========================================================================
    const { data: win, error: fetchError } = await supabaseAdmin
      .from("winners")
      .select(`
        id,
        status,
        redeemed_at,
        game_id,
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
    // ÉTAPE 2 : LOGIQUE DÉJÀ UTILISÉ (INCHANGÉ)
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
    // ÉTAPE 3 : VALIDATION SÉCURISÉE (PATCH : on ne dépend plus de la RLS)
    // Objectif : seul le restaurant qui a généré le ticket peut valider.
    // =========================================================================
    const supabaseAuth = await createAuthClient()

    // 3.1 Vérifier qu'il y a une session utilisateur
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser()
    if (userErr || !userData?.user) {
      console.error("⛔ Pas de session utilisateur :", userErr)
      return { success: false, message: "⛔ Connexion au dashboard du restaurant requise." }
    }

    const userId = userData.user.id

    // 3.2 Charger le profil (Service Role pour éviter les soucis RLS)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, restaurant_id, is_active")
      .eq("id", userId)
      .single()

    if (profileErr || !profile) {
      console.error("❌ Profil introuvable :", profileErr)
      return { success: false, message: "Impossible de charger le profil utilisateur." }
    }

    if (profile.is_active === false) {
      return { success: false, message: "⛔ Compte désactivé. Contactez l’administrateur." }
    }

    // 3.3 Autoriser uniquement l’équipe restaurant
    const allowedRoles = ['admin', 'owner', 'staff', 'root']
    if (!allowedRoles.includes(profile.role)) {
      return { success: false, message: "⛔ Accès refusé : compte restaurant requis." }
    }

    // 3.4 Vérifier l’étanchéité : winner.restaurant === profile.restaurant
    const { data: game, error: gameErr } = await supabaseAdmin
      .from("games")
      .select("id, restaurant_id")
      .eq("id", win.game_id)
      .single()

    if (gameErr || !game) {
      console.error("❌ Game introuvable :", gameErr)
      return { success: false, message: "Erreur : jeu introuvable pour ce ticket." }
    }

    // Root passe tout (optionnel) ; sinon on impose la même enseigne
    if (profile.role !== 'root') {
      if (!profile.restaurant_id || profile.restaurant_id !== game.restaurant_id) {
        return { success: false, message: "⛔ Accès refusé : ce ticket ne correspond pas à votre restaurant." }
      }
    }

    // 3.5 Update réel (Service Role) + sécurité anti double validation
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("winners")
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq("id", winnerId)
      .eq("status", "available")
      .select("id,status,redeemed_at")

    if (updateError) {
      console.error("❌ Erreur lors de la validation :", updateError)
      return { success: false, message: "Erreur technique lors de la validation." }
    }

    if (!updated || updated.length === 0) {
      return {
        success: false,
        message: "⛔ Aucune ligne validée (déjà utilisé, ID invalide, ou état du ticket incompatible)."
      }
    }

    // =========================================================================
    // ÉTAPE 4 : SUCCÈS (INCHANGÉ)
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
