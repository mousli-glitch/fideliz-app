"use server"

import { createClient } from "@supabase/supabase-js"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

const createAdminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * L'identifiant du root n'est plus écrit ici. Deux usages s'y mélangeaient :
 * la PROTECTION du compte, qui relève du rôle, et l'HÉRITAGE des restaurants,
 * qui relève d'une recherche. Voir `lib/securite/compte-root.ts`.
 */
import { idDuCompteRoot, estCompteProtege } from "@/lib/securite/compte-root"

/*
 * GARDES INTERNES (18/08/2026) — root uniquement, sur les trois actions.
 *
 * Ces trois-là créent des comptes Auth et en suppriment. `POST
 * /api/admin/create-user` a été durci le 15/08 et n'est appelée par
 * personne ; celles-ci sont le vrai chemin de création, depuis
 * /super-admin/root. Fermer l'endpoint mort sans fermer celles-ci aurait
 * été un correctif de façade.
 *
 * `creatorId` arrivait du navigateur et servait à renseigner `created_by` :
 * l'appelant choisissait donc au nom de qui il créait. Il est désormais
 * ignoré au profit de l'identité de session.
 */
export async function masterCreateRestaurant(data: any) {
  const garde = await exigerRole(["root"], "restaurant.creation")
  if (!garde.ok) return { success: false, error: garde.error }

  const supabase = createAdminClient()
  const { name, city, slug, email, password } = data
  const creatorId = garde.appelant.userId

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

  await tracerAction(garde.appelant, 'restaurant.creation', 'Restaurant et compte créés', {
    restaurantId: resto.id,
    slug,
  })

  return { success: true }
}

export async function masterCreateSalesAction(data: any) {
  const garde = await exigerRole(["root"], "commercial.creation")
  if (!garde.ok) return { success: false, error: garde.error }

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

  await tracerAction(garde.appelant, 'commercial.creation', 'Compte commercial créé', {
    cible: authUser.user.id,
  })

  return { success: true }
}

// VERSION AMÉLIORÉE POUR LE TEST B (FANTÔME)
export async function masterDeleteUser(userId: string) {
  const garde = await exigerRole(["root"], "compte.suppression")
  if (!garde.ok) return { success: false, error: garde.error }

  const supabase = createAdminClient()

  try {
    /*
     * 🔒 Protection du super-admin. Elle interrogeait un UUID écrit en dur ;
     * elle interroge maintenant le RÔLE. Un second root créé demain sera
     * protégé sans qu'on ait à y penser, et un root synthétique l'est aussi —
     * donc le garde se teste hors production.
     */
    const { data: cible } = await supabase
      .from('profiles').select('role').eq('id', userId).maybeSingle()
    if (estCompteProtege(cible?.role)) {
      return { success: false, error: "Ce compte super-admin est protégé." }
    }

    /*
     * L'héritage, lui, a besoin d'un IDENTIFIANT et non d'un test de rôle :
     * on désigne un destinataire, on n'accorde aucun droit. D'où la
     * recherche. `null` laisse les lignes orphelines — ce que faisait déjà
     * l'UUID en dur le jour où il pointait vers un compte supprimé.
     */
    const rootId = await idDuCompteRoot(supabase)

    // 1. RÉATTRIBUTION AU ROOT (sans voler le restaurant au vrai propriétaire)
    //    a) Restaurants APPORTÉS par cet utilisateur (created_by) -> créateur = root,
    //       on CONSERVE owner_id (le restaurateur réel garde son restaurant).
    await supabase
      .from('restaurants')
      .update({ created_by: rootId })
      .eq('created_by', userId)

    //    b) Restaurants POSSÉDÉS par cet utilisateur (owner_id) -> propriété au root.
    await supabase
      .from('restaurants')
      .update({ owner_id: rootId })
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

    await tracerAction(garde.appelant, 'compte.suppression', 'Compte supprimé', { cible: userId })

    return { success: true }
  } catch (err: any) {
    console.error("Erreur MasterDelete:", err)
    return { success: false, error: err.message }
  }
}