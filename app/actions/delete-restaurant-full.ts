"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Supprime un restaurant. Le compte propriétaire n'est supprimé QUE si :
//  - c'est bien un compte "restaurant" (jamais un root/super-admin ni un sales/commercial)
//  - et qu'il ne gère plus aucun autre restaurant après cette suppression.
// Cette double sécurité évite l'accident où supprimer un restaurant effaçait le profil/compte de l'admin.
export async function deleteRestaurantFullAction(restaurantId: string, ownerId: string) {
  console.log(`🗑️ Suppression restaurant ${restaurantId} (owner ${ownerId || 'aucun'})`)

  try {
    // ÉTAPE 0 : Récupérer le rôle du propriétaire AVANT toute suppression
    let ownerRole: string | null = null
    if (ownerId) {
      const { data: ownerProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', ownerId)
        .single()
      ownerRole = (ownerProfile as any)?.role ?? null
    }

    // ÉTAPE 1 : Supprimer le restaurant
    const { error: restoError } = await supabaseAdmin
      .from('restaurants')
      .delete()
      .eq('id', restaurantId)

    if (restoError) {
      console.error("❌ Echec suppression Restaurant:", restoError)
      throw new Error("Impossible de supprimer le restaurant : " + restoError.message)
    }
    console.log("✅ Restaurant supprimé.")

    // ÉTAPE 2 : Décider si on supprime le compte propriétaire
    let accountDeleted = false

    // 🔒 SÉCURITÉ : on ne touche JAMAIS à un compte root (super-admin) ou sales (commercial)
    if (ownerId && ownerRole === 'restaurant') {
      // Le propriétaire gère-t-il encore d'autres restaurants ?
      const { count } = await supabaseAdmin
        .from('restaurants')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)

      const gereEncoreDAutres = (count ?? 0) > 0

      if (!gereEncoreDAutres) {
        // Plus aucun restaurant rattaché : on peut supprimer le profil + le compte Auth (libère l'e-mail)
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', ownerId)
        if (profileError) {
          console.warn("⚠️ Echec suppression Profil:", profileError.message)
        }

        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(ownerId)
        if (authError) {
          console.warn("⚠️ Echec suppression Auth (e-mail non libéré):", authError.message)
        } else {
          accountDeleted = true
          console.log("✅ Compte propriétaire supprimé (e-mail libéré).")
        }
      } else {
        console.log("ℹ️ Le propriétaire gère encore d'autres restaurants : compte conservé.")
      }
    } else if (ownerRole && ownerRole !== 'restaurant') {
      console.log(`🛡️ Compte '${ownerRole}' protégé : seul le restaurant a été supprimé.`)
    }

    revalidatePath('/super-admin/root/restaurants-management')
    return { success: true, accountDeleted, ownerRole }

  } catch (error: any) {
    console.error("🚨 ERREUR SUPPRESSION:", error)
    return { success: false, error: error.message }
  }
}
