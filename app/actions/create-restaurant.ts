"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

export async function createRestaurantAction(formData: any) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Force l'admin
  )

  const { name, city, slug, email, password, salesId } = formData

  // 1. Création de l'utilisateur AUTH (évite le bug User Already Registered)
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (authError) return { success: false, error: "Erreur Auth: " + authError.message }

  // 2. Création du Restaurant (lié au Sales et au nouvel Admin)
  const { data: resto, error: restoError } = await supabase
    .from('restaurants')
    .insert({
      name,
      city,
      slug,
      owner_id: authUser.user.id, // Le nouveau client est le proprio
      created_by: salesId,        // Le commercial est le créateur
      is_active: true
    })
    .select()
    .single()

  if (restoError) return { success: false, error: "Erreur DB Restaurant: " + restoError.message }

  // 3. Mise à jour du Profil
  await supabase
    .from('profiles')
    .update({
      role: 'admin',
      restaurant_id: resto.id,
      is_active: true
    })
    .eq('id', authUser.user.id)

  revalidatePath('/super-admin/root')
  return { success: true }
}