"use server"

import { createClient } from "@supabase/supabase-js"
import { supprimerCompteEtReattribuer } from "@/lib/securite/suppression-compte"
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
    /*
     * Séquence entière déléguée à `supprimerCompteEtReattribuer` : les deux
     * actions de suppression la répétaient presque à l'identique, et un
     * correctif futur n'aurait ferme qu'un chemin sur deux. Elle réattribue
     * `created_by`, `owner_id` ET `user_id` (ce dernier CASCADE vers
     * `auth.users` — sans lui, la suppression Auth détruisait le restaurant),
     * puis laisse la cascade emporter le profil pour rester rejouable.
     */
    const r = await supprimerCompteEtReattribuer(supabaseAdmin, userId)
    if (!r.success) return r

    await tracerAction(
      garde.appelant,
      'commercial.suppression',
      r.idempotent ? 'Compte commercial déjà supprimé — reprise sans effet' : 'Compte commercial supprimé',
      { cible: userId, idempotent: !!r.idempotent },
    )

    return { success: true, idempotent: r.idempotent }
  } catch (err: any) {
    console.error("🚨 deleteSalesUserAction:", err)
    return { success: false, error: err.message }
  }
}
