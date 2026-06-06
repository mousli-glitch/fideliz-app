"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

// Action dédiée : écrit directement dans la table `restaurants`
// (la vue public_restaurants n'expose que 7 colonnes, donc impossible
//  d'y enregistrer contact_email ou avg_basket).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type RestaurantSettingsUpdate = {
  name?: string
  contact_email?: string | null
  avg_basket?: number
}

export async function updateRestaurantSettings(id: string, updates: RestaurantSettingsUpdate) {
  const { error } = await supabaseAdmin
    .from("restaurants")
    .update(updates)
    .eq("id", id)

  if (error) {
    console.error("Erreur updateRestaurantSettings:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/admin", "layout")
  return { success: true }
}
