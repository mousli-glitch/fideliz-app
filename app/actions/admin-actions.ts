"use server"

import { createClient } from "@supabase/supabase-js"
import { supprimerCompteEtReattribuer } from "@/lib/securite/suppression-compte"
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
    /* Même primitive que `deleteSalesUserAction` — un seul exemplaire de la
     * séquence, pour qu'un correctif ne puisse pas n'en corriger qu'une. */
    const r = await supprimerCompteEtReattribuer(supabase, userId)
    if (!r.success) return r

    /* `idempotent` : l'état visé était déjà atteint, rien n'a été détruit.
     * Le journal doit dire lequel des deux s'est produit — sinon une reprise
     * ressemble à une suppression, et une suppression à une reprise. */
    await tracerAction(
      garde.appelant,
      'compte.suppression',
      r.idempotent ? 'Compte déjà supprimé — reprise sans effet' : 'Compte supprimé',
      { cible: userId, idempotent: !!r.idempotent },
    )

    return { success: true, idempotent: r.idempotent, avertissement: r.avertissement }
  } catch (err: any) {
    console.error("Erreur MasterDelete:", err)
    return { success: false, error: err.message }
  }
}