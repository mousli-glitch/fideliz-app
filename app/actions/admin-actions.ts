"use server"

import { createClient } from "@supabase/supabase-js"

const createAdminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// TON ID ROOT (Pour l'héritage des restaurants)
const ROOT_ID = '04eb7091-6876-41e0-84c6-5891658a5768'

export async function masterCreateRestaurant(data: any) {
  const supabase = createAdminClient()
  const { name, city, slug, email, password, creatorId } = data

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'restaurant' }
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

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      role: 'restaurant',
      restaurant_id: resto.id,
      is_active: true
    })
    .eq('id', authUser.user.id)

  if (profileError) return { success: false, error: "Profil: " + profileError.message }

  return { success: true }
}

export async function masterCreateSalesAction(data: any) {
  const supabase = createAdminClient()
  const { email, password } = data

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'sales' }
  })

  if (authError) return { success: false, error: authError.message }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'sales', is_active: true })
    .eq('id', authUser.user.id)

  if (profileError) return { success: false, error: profileError.message }

  return { success: true }
}

// VERSION AMÉLIORÉE POUR LE TEST B (FANTÔME)
export async function masterDeleteUser(userId: string) {
  const supabase = createAdminClient()
  
  try {
    // 🔒 Sécurité : ne jamais supprimer le super-admin
    if (userId === ROOT_ID) {
      return { success: false, error: "Ce compte super-admin est protégé." }
    }

    // 1. RÉATTRIBUTION AU ROOT (sans voler le restaurant au vrai propriétaire)
    //    a) Restaurants APPORTÉS par cet utilisateur (created_by) -> créateur = root,
    //       on CONSERVE owner_id (le restaurateur réel garde son restaurant).
    await supabase
      .from('restaurants')
      .update({ created_by: ROOT_ID })
      .eq('created_by', userId)

    //    b) Restaurants POSSÉDÉS par cet utilisateur (owner_id) -> propriété au root.
    await supabase
      .from('restaurants')
      .update({ owner_id: ROOT_ID })
      .eq('owner_id', userId)

    //    c) Nettoyer les liens de portefeuille commercial (pas de FK côté commercial).
    await supabase.from('sales_restaurants').delete().eq('sales_user_id', userId)

    // 2. SUPPRESSION DU PROFIL PUBLIC
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) throw profileError

    // 3. SUPPRESSION DÉFINITIVE DE L'AUTH (Le fantôme)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId)
    if (authError) throw authError
    
    return { success: true }
  } catch (err: any) {
    console.error("Erreur MasterDelete:", err)
    return { success: false, error: err.message }
  }
}