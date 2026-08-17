"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

/*
 * GARDE INTERNE (18/08/2026) — le parcours légitime du commercial, conservé
 * mais borné.
 *
 * C'est ici qu'un commercial crée un restaurant client : ce parcours reste
 * ouvert, c'est son métier. Deux choses seulement changent.
 *
 * Le rôle créé n'est plus négociable : `restaurant`, écrit en dur. Cette
 * action ne peut fabriquer ni un root, ni un autre commercial, quoi qu'on
 * lui envoie.
 *
 * `salesId` n'arrive plus du navigateur. Il servait à renseigner
 * `created_by`, c'est-à-dire à qui le restaurant sera compté : l'appelant
 * choisissait donc le portefeuille dans lequel il déposait sa vente. Il est
 * désormais pris dans la session — un commercial crée pour lui-même, et un
 * root peut encore attribuer explicitement.
 */
export async function createRestaurantAction(formData: any) {
  const garde = await exigerRole(["sales", "root"], "restaurant.creation_commerciale")
  if (!garde.ok) return { success: false, error: garde.error }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Force l'admin
  )

  const { name, city, slug, email, password } = formData
  const salesId =
    garde.appelant.role === "root" && formData.salesId ? formData.salesId : garde.appelant.userId

  if (!name || !slug || !email || !password) {
    return { success: false, error: "Nom, slug, e-mail et mot de passe sont requis." }
  }

  // 1. Création de l'utilisateur AUTH (rôle 'restaurant' explicite pour le profil auto-créé)
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'restaurant' }
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

  // 3. Mise à jour du Profil (rôle valide : 'restaurant')
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      role: 'restaurant',
      restaurant_id: resto.id,
      is_active: true
    })
    .eq('id', authUser.user.id)

  if (profileError) return { success: false, error: "Erreur DB Profil: " + profileError.message }

  await tracerAction(garde.appelant, 'restaurant.creation_commerciale', 'Restaurant client créé', {
    restaurantId: resto.id,
    slug,
    commercial: salesId,
  })

  revalidatePath('/super-admin/root')
  return { success: true }
}