"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"
import { supprimerCompteEtReattribuer } from "@/lib/securite/suppression-compte"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUPPRIMER UN RESTAURANT — et le compte SEULEMENT si c'est prouvé sûr
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GARDE INTERNE (18/08/2026) : root uniquement. L'action ne tenait que par
 * le matcher du middleware, qui protège la PAGE, pas l'action. C'est la
 * plus destructrice du produit.
 *
 * ─── P0 CORRIGÉ LE 19/08/2026 : QUATRE DÉFAUTS, TOUS VÉRIFIÉS ───
 *
 * Ce chemin `service_role` contournait toutes les garanties construites
 * pour les deux autres suppressions.
 *
 * 1. L'OWNER VENAIT DE L'APPELANT. `ownerId` arrivait en second paramètre,
 *    sans qu'on prouve jamais qu'il appartenait au restaurant supprimé.
 *    Un appel incohérent — bug d'interface ou paramètre forgé — faisait
 *    donc supprimer le compte de QUELQU'UN D'AUTRE. L'owner est désormais
 *    LU sur la ligne restaurant, autoritativement. Le paramètre reste
 *    accepté pour compatibilité d'appel, mais il est seulement COMPARÉ :
 *    une divergence fait échouer l'action au lieu de la guider.
 *
 * 2. `(count ?? 0) > 0` — LE PIRE. Si le comptage des autres restaurants
 *    ÉCHOUAIT, `count` valait `null`, donc `0 > 0` = faux, donc
 *    « ne gère plus rien », donc SUPPRESSION DU COMPTE. Une panne de
 *    lecture devenait une suppression de compte. Il faut désormais un
 *    comptage positivement réussi ET égal à zéro.
 *
 * 3. L'erreur de lecture du profil était ignorée, et un profil absent ou
 *    ambigu ne se distinguait pas d'un rôle non-restaurant.
 *
 * 4. Les erreurs de suppression profil/Auth devenaient des `console.warn`,
 *    et l'action répondait `success: true` sur un état partiel.
 *
 * La suppression du compte passe maintenant par la primitive commune
 * `supprimerCompteEtReattribuer` — celle qui réattribue `user_id` (sans
 * quoi la cascade emporte des données), laisse le profil partir par
 * cascade, et traite l'issue Auth ambiguë. Dupliquer `deleteUser` ici,
 * c'était garantir qu'un correctif futur n'en corrigerait qu'un sur deux.
 */
export async function deleteRestaurantFullAction(restaurantId: string, ownerIdAnnonce?: string) {
  const garde = await exigerRole(["root"], "restaurant.suppression")
  if (!garde.ok) return { success: false, error: garde.error }

  if (!restaurantId) return { success: false, error: "Restaurant manquant." }

  try {
    /*
     * ÉTAPE 0 — l'owner se LIT, il ne se reçoit pas.
     * `limit(2)` plutôt que `single()` : on veut distinguer « absent » de
     * « ambigu », et refuser les deux, plutôt que recevoir une erreur
     * indifférenciée.
     */
    const { data: lignes, error: eResto } = await supabaseAdmin
      .from('restaurants')
      .select('id, owner_id')
      .eq('id', restaurantId)
      .limit(2)

    if (eResto) {
      return { success: false, error: "Lecture du restaurant impossible : suppression annulée." }
    }
    const restos = (lignes as { id: string; owner_id: string | null }[] | null) ?? []
    if (restos.length !== 1) {
      return { success: false, error: "Restaurant introuvable ou ambigu : suppression annulée." }
    }
    const ownerId = restos[0].owner_id

    // Le paramètre de l'appelant ne guide rien ; il est seulement contrôlé.
    if (ownerIdAnnonce && ownerId && ownerIdAnnonce !== ownerId) {
      return {
        success: false,
        error: "Propriétaire annoncé incohérent avec le restaurant : suppression annulée.",
      }
    }

    /*
     * ÉTAPE 1 — le rôle du propriétaire, AVANT toute suppression.
     * Une erreur de lecture, un profil absent ou dupliqué : on refuse.
     * On ne supprime pas un restaurant dont on ne sait pas décrire le
     * propriétaire.
     */
    let ownerRole: string | null = null
    if (ownerId) {
      const { data: profils, error: eProfil } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', ownerId)
        .limit(2)

      if (eProfil) {
        return { success: false, error: "Lecture du profil propriétaire impossible : suppression annulée." }
      }
      const p = (profils as { role: string }[] | null) ?? []
      if (p.length !== 1) {
        return { success: false, error: "Profil propriétaire absent ou ambigu : suppression annulée." }
      }
      ownerRole = p[0].role
    }

    // ÉTAPE 2 — supprimer le restaurant.
    const { error: restoError } = await supabaseAdmin
      .from('restaurants')
      .delete()
      .eq('id', restaurantId)

    if (restoError) {
      return { success: false, error: "Impossible de supprimer le restaurant : " + restoError.message }
    }

    /*
     * ÉTAPE 3 — le compte, seulement si TOUT est positivement établi.
     *
     * 🔒 Jamais un root, jamais un commercial : seul un rôle `restaurant`
     * est éligible, et la primitive commune refuse de toute façon un root.
     */
    let compteSupprime = false
    let avertissement: string | null = null

    if (ownerId && ownerRole === 'restaurant') {
      const { count, error: eCount } = await supabaseAdmin
        .from('restaurants')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)

      if (eCount || count === null || count === undefined) {
        /*
         * On ne sait pas s'il reste d'autres restaurants. Le restaurant est
         * déjà supprimé — c'est fait et c'était demandé — mais le COMPTE
         * reste intact : une panne de lecture ne supprime personne. L'appel
         * est rejouable, et la réponse le dit au lieu de prétendre au
         * succès complet.
         */
        avertissement =
          "Restaurant supprimé, mais le nombre d'autres restaurants du propriétaire n'a pas pu être établi : " +
          "le compte a été CONSERVÉ. Rejouer l'action pour le traiter."
      } else if (count === 0) {
        const r = await supprimerCompteEtReattribuer(supabaseAdmin, ownerId)
        if (r.success) {
          compteSupprime = true
        } else {
          // Issue partielle explicite — jamais un `success: true` silencieux.
          return {
            success: false,
            error: "Restaurant supprimé, mais la suppression du compte propriétaire a échoué : " + r.error,
            restaurantSupprime: true,
          }
        }
      }
    }

    await tracerAction(garde.appelant, 'restaurant.suppression', 'Restaurant supprimé', {
      restaurantId,
      ownerId: ownerId || null,
      ownerRole,
      compteSupprime,
    })

    revalidatePath('/super-admin/root/restaurants-management')
    return { success: true, accountDeleted: compteSupprime, ownerRole, avertissement }

  } catch (error: any) {
    console.error("🚨 ERREUR SUPPRESSION:", error)
    return { success: false, error: error.message }
  }
}
