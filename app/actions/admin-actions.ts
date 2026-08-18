"use server"

import { createClient } from "@supabase/supabase-js"
import { resoudreRootHeritier, cibleEstProtegee } from "@/lib/securite/root"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

const createAdminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


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
    /* 🔒 Ne jamais supprimer un super-admin — par RÔLE, pas par identifiant.
     * Le test par UUID qui figurait ici ne protégeait qu'UN seul compte : un
     * second root aurait été supprimable. */
    if (await cibleEstProtegee(userId)) {
      return { success: false, error: "Ce compte super-admin est protégé." }
    }

    const heritier = await resoudreRootHeritier()
    if (!heritier.ok) {
      return { success: false, error: heritier.cause === "aucun_root"
        ? "Aucun compte root : réattribution impossible."
        : "Lecture des profils impossible : réattribution annulée." }
    }
    const rootHeritier = heritier.rootId

    /*
     * ─── CHAQUE ÉTAPE SE VÉRIFIE AVANT LA SUIVANTE (19/08/2026) ───
     *
     * Les trois étapes ci-dessous ignoraient leur `error`. Une réattribution
     * échouée n'empêchait donc PAS la suppression du profil ni celle du
     * compte Auth : les restaurants restaient rattachés à un utilisateur
     * qui n'existait plus. On s'arrête désormais avant chaque étape
     * destructive, jamais après.
     *
     * Pas de transaction possible : `auth.admin.deleteUser` est un appel
     * d'API, hors de la transaction SQL. D'où l'ordre du moins destructif
     * au plus destructif, et l'arrêt à la première erreur. Rejeu sûr après
     * échec partiel : chaque étape est idempotente.
     */

    // 1. RÉATTRIBUTION AU ROOT (sans voler le restaurant au vrai propriétaire)
    //    a) Restaurants APPORTÉS par cet utilisateur (created_by) -> créateur = root,
    //       on CONSERVE owner_id (le restaurateur réel garde son restaurant).
    const { error: eA } = await supabase
      .from('restaurants')
      .update({ created_by: rootHeritier })
      .eq('created_by', userId)
    if (eA) throw new Error("Réattribution (créateur) échouée : " + eA.message)

    //    b) Restaurants POSSÉDÉS par cet utilisateur (owner_id) -> propriété au root.
    const { error: eB } = await supabase
      .from('restaurants')
      .update({ owner_id: rootHeritier })
      .eq('owner_id', userId)
    if (eB) throw new Error("Réattribution (propriétaire) échouée : " + eB.message)

    //    c) Nettoyer les liens de portefeuille commercial (pas de FK côté commercial).
    const { error: eC } = await supabase
      .from('sales_restaurants').delete().eq('sales_user_id', userId)
    if (eC) throw new Error("Nettoyage du portefeuille échoué : " + eC.message)

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