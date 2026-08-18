"use server"

import { createClient } from "@supabase/supabase-js"
import { resoudreRootHeritier, cibleEstProtegee } from "@/lib/securite/root"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Supprime un commercial proprement :
//  - ses restaurants APPORTÉS (created_by) sont réattribués au root (le vrai propriétaire/restaurateur est conservé)
//  - les restaurants éventuellement POSSÉDÉS par le commercial (cas de test) passent au root
//  - les liens de portefeuille (sales_restaurants) sont nettoyés (sinon ils resteraient orphelins, pas de FK)
//  - puis on supprime le profil et le compte Auth (libère l'e-mail)
// Garde-fou : impossible de supprimer un compte root.
//
// GARDE INTERNE (18/08/2026) : root uniquement.
// Le garde-fou d'origine protégeait la CIBLE — on ne supprime pas un root.
// Il ne disait rien de l'APPELANT : un commercial identifié pouvait
// supprimer un autre commercial. Les deux contrôles sont nécessaires, et
// ils ne se remplacent pas.
export async function deleteSalesUserAction(userId: string) {
  const garde = await exigerRole(["root"], "commercial.suppression")
  if (!garde.ok) return { success: false, error: garde.error }

  try {
    if (!userId) return { success: false, error: "ID utilisateur manquant." }

    /* 🔒 Ne jamais supprimer un super-admin. Le contrôle par RÔLE ci-dessous
     * suffit et suffisait déjà : le test par UUID qui le précédait était
     * redondant, et il aurait laissé passer un second root. */
    if (await cibleEstProtegee(userId)) {
      return { success: false, error: "Ce compte super-admin est protégé." }
    }

    /* L'héritier n'est plus figé : on le résout. Si aucun root actif n'existe,
     * on refuse plutôt que d'inventer un propriétaire — un restaurant sans
     * propriétaire valide vaut mieux qu'un restaurant attribué au hasard. */
    const heritier = await resoudreRootHeritier()
    if (!heritier.ok) {
      return { success: false, error: heritier.cause === "aucun_root"
        ? "Aucun compte root : réattribution impossible."
        : "Lecture des profils impossible : réattribution annulée." }
    }
    const rootHeritier = heritier.rootId

    // 1. Restaurants APPORTÉS par le commercial -> attribués au root (on garde le propriétaire réel)
    const { error: e1 } = await supabaseAdmin
      .from('restaurants')
      .update({ created_by: rootHeritier })
      .eq('created_by', userId)
    if (e1) throw new Error("Réattribution (créateur) échouée : " + e1.message)

    // 2. Restaurants éventuellement POSSÉDÉS par le commercial -> propriété au root
    const { error: e2 } = await supabaseAdmin
      .from('restaurants')
      .update({ owner_id: rootHeritier })
      .eq('owner_id', userId)
    if (e2) throw new Error("Réattribution (propriétaire) échouée : " + e2.message)

    /*
     * ─── CHAQUE ÉTAPE SE VÉRIFIE AVANT LA SUIVANTE (19/08/2026) ───
     *
     * Les étapes 3 et 4 ignoraient leur `error`. Une suppression de profil
     * échouée n'empêchait donc pas la suppression Auth : le compte Auth
     * disparaissait en laissant derrière lui une ligne `profiles` pointant
     * vers un utilisateur inexistant — un fantôme, impossible à recréer
     * puisque l'e-mail redevient libre. On s'arrête désormais AVANT
     * l'étape destructive suivante, jamais après.
     *
     * Pas de transaction possible ici : `auth.admin.deleteUser` est un
     * appel d'API, hors de la transaction SQL. D'où l'ordre choisi — du
     * moins destructif au plus destructif — et un arrêt à la première
     * erreur. Un rejeu après échec partiel est sûr : chaque étape est
     * idempotente (`delete ... eq` sur une ligne déjà absente ne fait
     * rien, `update ... eq` sur des lignes déjà réattribuées non plus).
     */

    // 3. Nettoyer les liens de portefeuille commercial (table sans clé étrangère côté commercial)
    const { error: e3 } = await supabaseAdmin
      .from('sales_restaurants').delete().eq('sales_user_id', userId)
    if (e3) throw new Error("Nettoyage du portefeuille échoué : " + e3.message)

    // 4. Supprimer le profil public
    const { error: e4 } = await supabaseAdmin
      .from('profiles').delete().eq('id', userId)
    if (e4) throw new Error("Suppression du profil échouée : " + e4.message)

    // 5. Supprimer le compte Auth (libère l'e-mail)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authError) return { success: false, error: authError.message }

    await tracerAction(garde.appelant, 'commercial.suppression', 'Compte commercial supprimé', {
      cible: userId,
    })

    return { success: true }
  } catch (err: any) {
    console.error("🚨 deleteSalesUserAction:", err)
    return { success: false, error: err.message }
  }
}
