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
 *
 * ─── P0 SUIVANT (19/08/2026) : « REJOUER L'ACTION » ÉTAIT UN MENSONGE ───
 *
 * Le commentaire du correctif précédent promettait, après une panne de
 * comptage : « L'appel est rejouable ». Il ne l'était pas. Le restaurant
 * était DÉJÀ supprimé ; au second appel, la première lecture ne retrouvait
 * plus la ligne, donc plus le propriétaire, et l'action n'avait aucun moyen
 * de reprendre. Même impasse quand la primitive échouait après la
 * suppression du restaurant : la réponse annonçait `restaurantSupprime:
 * true` et plus personne ne pouvait rien en faire. Une issue partielle
 * annoncée mais irrattrapable n'est pas meilleure qu'une issue partielle
 * silencieuse.
 *
 * Deux corrections, ensemble :
 *
 *   1. TOUTES LES LECTURES FAILLIBLES PASSENT AVANT L'IRRÉVERSIBLE. Le
 *      comptage des autres restaurants se fait maintenant AVANT la
 *      suppression, et sa panne annule l'opération entière au lieu de
 *      laisser un état partiel. Il n'y a plus de branche « restaurant
 *      supprimé, compte conservé faute d'avoir su compter ».
 *
 *   2. UNE INTENTION DURABLE, écrite avant l'irréversible
 *      (`suppressions_restaurant`, migration 20260819010000). Elle porte le
 *      propriétaire RÉEL — lu sur la ligne, jamais reçu de l'appelant — et
 *      la décision déjà prise. Quand le restaurant a disparu, c'est elle qui
 *      permet à un second appel de reprendre à l'identique. Si elle ne
 *      s'écrit pas, rien n'est détruit : elle précède l'irréversible.
 *
 * La reprise se déclenche sur « restaurant absent + intention non terminée »,
 * sans regarder l'étape enregistrée : la mise à jour de l'étape est un repère
 * d'observation, et si ELLE échouait après la suppression, en faire une
 * condition rouvrirait exactement l'impasse qu'on ferme.
 *
 * Un restaurant absent SANS intention reste un refus : on ne devine pas une
 * opération dont rien n'atteste qu'elle a été décidée.
 */
export async function deleteRestaurantFullAction(restaurantId: string, ownerIdAnnonce?: string) {
  const garde = await exigerRole(["root"], "restaurant.suppression")
  if (!garde.ok) return { success: false, error: garde.error }

  if (!restaurantId) return { success: false, error: "Restaurant manquant." }

  try {
    /*
     * ÉTAPE 0 — une opération est-elle déjà en cours sur ce restaurant ?
     * C'est la première question, avant même de lire le restaurant : sa
     * réponse décide si l'absence de la ligne est une anomalie ou une reprise.
     */
    const { data: intentions, error: eIntention } = await supabaseAdmin
      .from('suppressions_restaurant')
      .select('restaurant_id, owner_id, owner_role, compte_a_supprimer, etape')
      .eq('restaurant_id', restaurantId)
      .limit(2)

    if (eIntention) {
      return { success: false, error: "Lecture de l'intention de suppression impossible : opération annulée." }
    }
    const lignesIntention = (intentions as Intention[] | null) ?? []
    if (lignesIntention.length > 1) {
      return { success: false, error: "Intentions de suppression multiples pour ce restaurant : opération annulée." }
    }
    const intention = lignesIntention[0] ?? null

    if (intention?.etape === 'termine') {
      // Rien à faire, et surtout rien à re-détruire.
      return { success: true, idempotent: true, accountDeleted: false, ownerRole: intention.owner_role }
    }

    /*
     * ÉTAPE 1 — l'état du restaurant. `limit(2)` plutôt que `single()` : on
     * veut distinguer « absent » de « ambigu », et refuser les deux, plutôt
     * que recevoir une erreur indifférenciée.
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
    if (restos.length > 1) {
      return { success: false, error: "Restaurant ambigu : suppression annulée." }
    }

    // ── REPRISE : le restaurant est parti, l'intention dit ce qu'il reste ──
    if (restos.length === 0) {
      if (!intention) {
        return {
          success: false,
          error: "Restaurant introuvable et aucune suppression enregistrée : rien à reprendre.",
        }
      }
      return await terminerLeCompte(garde.appelant, intention, true)
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
     * ÉTAPE 2 — TOUTES les décisions faillibles, AVANT l'irréversible.
     * Une erreur de lecture, un profil absent ou dupliqué, un comptage
     * indisponible : on refuse, et rien n'a encore été détruit.
     */
    let ownerRole: string | null = null
    let compteASupprimer = false

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

      if (ownerRole === 'restaurant') {
        /*
         * Le comptage a lieu AVANT la suppression : le compte part si ce
         * restaurant est le SEUL du propriétaire, donc si le comptage vaut
         * exactement 1. L'ancienne version comptait après, exigeait 0, et
         * `(count ?? 0) > 0` transformait une PANNE de lecture en « aucun
         * autre restaurant », donc en suppression de compte.
         */
        const { count, error: eCount } = await supabaseAdmin
          .from('restaurants')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', ownerId)

        if (eCount || count === null || count === undefined) {
          return {
            success: false,
            error: "Impossible d'établir le nombre de restaurants du propriétaire : suppression annulée. Rien n'a été supprimé.",
          }
        }
        compteASupprimer = count === 1
      }
    }

    /*
     * ÉTAPE 3 — L'INTENTION, avant l'irréversible.
     * Si elle ne s'écrit pas, on n'entre pas dans la partie destructive :
     * une opération dont on ne saurait pas retrouver le propriétaire ne doit
     * pas commencer.
     */
    const { error: eEcriture } = await supabaseAdmin
      .from('suppressions_restaurant')
      .upsert({
        restaurant_id: restaurantId,
        owner_id: ownerId,
        owner_role: ownerRole,
        compte_a_supprimer: compteASupprimer,
        etape: 'intention',
        demandeur: garde.appelant.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'restaurant_id' })

    if (eEcriture) {
      return {
        success: false,
        error: "Impossible d'enregistrer l'intention de suppression : opération annulée avant toute destruction.",
      }
    }

    // ÉTAPE 4 — l'irréversible.
    const { error: restoError } = await supabaseAdmin
      .from('restaurants')
      .delete()
      .eq('id', restaurantId)

    if (restoError) {
      // L'intention reste ouverte : l'opération est reprenable telle quelle.
      return { success: false, error: "Impossible de supprimer le restaurant : " + restoError.message }
    }

    // Repère d'observation, jamais une condition de reprise (voir l'en-tête).
    await supabaseAdmin
      .from('suppressions_restaurant')
      .update({ etape: 'restaurant_supprime', updated_at: new Date().toISOString() })
      .eq('restaurant_id', restaurantId)

    return await terminerLeCompte(garde.appelant, {
      restaurant_id: restaurantId,
      owner_id: ownerId,
      owner_role: ownerRole,
      compte_a_supprimer: compteASupprimer,
      etape: 'restaurant_supprime',
    }, false)

  } catch (error: any) {
    console.error("🚨 ERREUR SUPPRESSION:", error)
    return { success: false, error: error.message }
  }
}

type Intention = {
  restaurant_id: string
  owner_id: string | null
  owner_role: string | null
  compte_a_supprimer: boolean
  etape: string
}

/**
 * Le compte, à partir de la seule intention — jamais d'un paramètre reçu.
 *
 * Appelée aussi bien dans la foulée de la suppression qu'à la reprise : les
 * deux chemins traitent exactement le même état, et c'est le point. Rien ici
 * ne dépend de l'existence du restaurant, qui a disparu.
 *
 * 🔒 Seul un rôle `restaurant` est éligible, et la primitive commune refuse
 * de toute façon un root.
 */
async function terminerLeCompte(
  appelant: Parameters<typeof tracerAction>[0],
  intention: Intention,
  reprise: boolean,
) {
  let compteSupprime = false

  if (intention.owner_id && intention.compte_a_supprimer && intention.owner_role === 'restaurant') {
    const r = await supprimerCompteEtReattribuer(supabaseAdmin, intention.owner_id, appelant.userId)
    if (!r.success) {
      // L'intention reste ouverte : un nouvel appel reprendra ici même.
      return {
        success: false,
        error: (reprise ? "Reprise : " : "Restaurant supprimé, mais ") +
          "la suppression du compte propriétaire a échoué : " + r.error,
        restaurantSupprime: true,
        reprenable: true,
      }
    }
    compteSupprime = !r.idempotent
  }

  const { error: eCloture } = await supabaseAdmin
    .from('suppressions_restaurant')
    .update({
      etape: 'termine',
      resultat: compteSupprime ? 'restaurant+compte' : 'restaurant',
      updated_at: new Date().toISOString(),
    })
    .eq('restaurant_id', intention.restaurant_id)

  await tracerAction(appelant, 'restaurant.suppression',
    reprise ? 'Suppression de restaurant reprise et terminée' : 'Restaurant supprimé', {
      restaurantId: intention.restaurant_id,
      ownerId: intention.owner_id,
      ownerRole: intention.owner_role,
      compteSupprime,
      reprise,
    })

  revalidatePath('/super-admin/root/restaurants-management')
  return {
    success: true,
    accountDeleted: compteSupprime,
    ownerRole: intention.owner_role,
    reprise,
    /*
     * Une clôture qui échoue ne défait rien de ce qui a été fait, mais elle
     * laisse une intention ouverte que la prochaine tentative reprendra à
     * vide. On le dit plutôt que de l'avaler.
     */
    avertissement: eCloture
      ? "Opération terminée, mais son intention n'a pas pu être clôturée : " + eCloture.message
      : null,
  }
}
