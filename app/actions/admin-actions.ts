"use server"

import { createClient } from "@supabase/supabase-js"

// Client maître réutilisable
const createAdminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function masterCreateRestaurant(data: any) {
  const supabase = createAdminClient()
  const { name, city, slug, email, password, creatorId } = data

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (authError) return { success: false, error: authError.message }

  const { data: resto, error: restoError } = await supabase
    .from('restaurants')
    .insert({
      name,
      city,
      slug,
      owner_id: authUser.user.id,
      created_by: creatorId,
      is_active: true
    })
    .select().single()

  if (restoError) return { success: false, error: restoError.message }

  await supabase
    .from('profiles')
    .update({
      role: 'admin',
      restaurant_id: resto.id,
      is_active: true
    })
    .eq('id', authUser.user.id)

  return { success: true }
}

// NOUVEAU : Création Maître pour les Commerciaux
export async function masterCreateSalesAction(data: any) {
  const supabase = createAdminClient()
  const { email, password } = data

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (authError) return { success: false, error: authError.message }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'sales', is_active: true })
    .eq('id', authUser.user.id)

  if (profileError) return { success: false, error: profileError.message }

  return { success: true }
}

export async function masterDeleteUser(userId: string) {
  const supabase = createAdminClient()
  // Supprime le compte Auth (le fantôme) + le profil
  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) return { success: false, error: authError.message }
  
  await supabase.from('profiles').delete().eq('id', userId)
  return { success: true }
}