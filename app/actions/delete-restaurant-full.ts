"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function deleteRestaurantFullAction(restaurantId: string, ownerId: string) {
  console.log(`☢️ DÉBUT PROTOCOLE NUCLÉAIRE : Resto ${restaurantId} + Owner ${ownerId}`)

  try {
    if (!ownerId) {
      throw new Error("ID Propriétaire manquant !")
    }

    // ÉTAPE 1 : On supprime d'abord le RESTAURANT (physiquement)
    // Cela évite que le restaurant bloque la suppression du profil
    const { error: restoError } = await supabaseAdmin
      .from('restaurants')
      .delete()
      .eq('id', restaurantId)

    if (restoError) {
      console.error("❌ Echec suppression Restaurant:", restoError)
      throw new Error("Impossible de supprimer le restaurant : " + restoError.message)
    }
    console.log("✅ 1. Restaurant supprimé.")

    // ÉTAPE 2 : On supprime le PROFIL public
    // C'est souvent lui qui empêche la suppression du compte Auth
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', ownerId)

    if (profileError) {
      console.warn("⚠️ Attention: Echec suppression Profil (Peut-être déjà supprimé ?):", profileError)
      // On continue quand même, car le but ultime est l'Auth
    } else {
      console.log("✅ 2. Profil supprimé.")
    }

    // ÉTAPE 3 : On supprime le COMPTE AUTH (Libération de l'email)
    // Maintenant qu'il n'y a plus de liens, Supabase devrait accepter
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(ownerId)

    if (authError) {
      console.error("❌ Echec suppression Auth:", authError)
      throw new Error("L'email n'a pas pu être libéré : " + authError.message)
    }
    console.log("✅ 3. Compte Auth supprimé (Email libéré).")

    // Rafraîchissement
    revalidatePath('/super-admin/root/restaurants-management')
    return { success: true }

  } catch (error: any) {
    console.error("🚨 ERREUR CRITIQUE PROTOCOLE:", error)
    return { success: false, error: error.message }
  }
}