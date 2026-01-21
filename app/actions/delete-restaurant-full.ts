"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

// On utilise la clé SERVICE ROLE pour avoir le droit de tout supprimer
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function deleteRestaurantFullAction(restaurantId: string, ownerId: string) {
  console.log(`🗑 SUPPRESSION TOTALE : Resto ${restaurantId} + Owner ${ownerId}`)

  try {
    // ÉTAPE 1 : On supprime le COMPTE AUTH (C'est ça qui libère l'email) 
    // Grâce aux liens "Cascade" de ta base de données :
    // Supprimer le User -> Supprime le Profil -> Supprime le Restaurant
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(ownerId)

    if (authError) {
      console.error("Erreur suppression Auth:", authError)
      // Si l'utilisateur n'existe plus dans Auth mais est encore dans la BDD (cas rare de désynchro)
      // On force la suppression manuelle du restaurant
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurantId)
    }

    console.log("✅ Restaurant et Propriétaire supprimés avec succès.")
    
    // On rafraîchit la liste des restaurants
    revalidatePath('/super-admin/root/restaurants-management')
    return { success: true }

  } catch (error: any) {
    console.error("🚨 Erreur critique suppression resto:", error)
    return { success: false, error: error.message }
  }
}