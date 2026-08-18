"use server"

import { createClient } from "@supabase/supabase-js"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

// Ton compte super-admin (root) : il hérite des restaurants des commerciaux supprimés.
const ROOT_ID = '04eb7091-6876-41e0-84c6-5891658a5768'

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

    // 🔒 Sécurité : ne jamais supprimer le super-admin
    if (userId === ROOT_ID) {
      return { success: false, error: "Ce compte super-admin est protégé." }
    }
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('role').eq('id', userId).single()
    if ((prof as any)?.role === 'root') {
      return { success: false, error: "Ce compte super-admin est protégé." }
    }

    // 1. Restaurants APPORTÉS par le commercial -> attribués au root (on garde le propriétaire réel)
    const { error: e1 } = await supabaseAdmin
      .from('restaurants')
      .update({ created_by: ROOT_ID })
      .eq('created_by', userId)
    if (e1) throw new Error("Réattribution (créateur) échouée : " + e1.message)

    // 2. Restaurants éventuellement POSSÉDÉS par le commercial -> propriété au root
    const { error: e2 } = await supabaseAdmin
      .from('restaurants')
      .update({ owner_id: ROOT_ID })
      .eq('owner_id', userId)
    if (e2) throw new Error("Réattribution (propriétaire) échouée : " + e2.message)

    // 3. Nettoyer les liens de portefeuille commercial (table sans clé étrangère côté commercial)
    await supabaseAdmin.from('sales_restaurants').delete().eq('sales_user_id', userId)

    // 4. Supprimer le profil public
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

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
