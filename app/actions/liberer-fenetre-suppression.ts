"use server"

import { createClient } from "@supabase/supabase-js"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LIBÉRER UNE FENÊTRE DE SUPPRESSION RESTÉE OUVERTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une fenêtre de suppression appartient à l'opération qui l'a ouverte, et ne
 * se referme que sur présentation de son jeton. C'est ce qui empêche une
 * seconde suppression du même compte de rouvrir les rattachements pendant que
 * la première n'a pas atteint son irréversible.
 *
 * Le revers : si le processus qui tenait le jeton disparaît — panne, coupure,
 * redéploiement — la fenêtre reste, et plus aucun restaurant ne peut être
 * rattaché à ce compte. Indéfiniment.
 *
 * ─── POURQUOI CETTE ACTION PLUTÔT QU'UN DELETE À LA MAIN ───
 *
 * Signalé le 19/08/2026 : « rends cet état réparable via une voie gardée ; ne
 * demande pas de DELETE manuel non traçable ». C'est juste. Une réparation
 * faite dans une console SQL ne laisse aucune trace de ce qu'elle a défait, et
 * personne ne peut plus dire ensuite si la suppression qui tenait la fenêtre
 * avait abouti ou non.
 *
 * Ici : `root` uniquement, la fonction rend la ligne qu'elle a retirée, et
 * cette ligne part au journal. On sait donc, après coup, quelle opération
 * tenait la fenêtre, depuis quand, et à la demande de qui.
 *
 * ⚠️ Ce que cette action NE FAIT PAS : vérifier que la suppression qui tenait
 * la fenêtre est terminée. Elle ne peut pas le savoir. Libérer une fenêtre
 * dont l'opération est encore en vol rouvre la course. À n'utiliser que sur
 * une fenêtre dont on a établi, par ailleurs, qu'elle est abandonnée — son
 * horodatage d'ouverture est là pour ça.
 */
export async function libererFenetreSuppressionAction(userId: string) {
  const garde = await exigerRole(["root"], "fenetre_suppression.liberation")
  if (!garde.ok) return { success: false, error: garde.error }

  if (!userId) return { success: false, error: "Compte cible manquant." }

  const { data, error } = await supabaseAdmin.rpc("forcer_fermeture_fenetre", {
    p_user_id: userId,
  })

  if (error) {
    return { success: false, error: "Libération impossible : " + error.message }
  }

  const resultat = (data ?? {}) as {
    retiree?: boolean
    jeton?: string
    ouvert_le?: string
    demandeur?: string | null
  }

  if (!resultat.retiree) {
    // Rien à libérer : ce n'est pas une erreur, et ça vaut la peine d'être dit.
    return { success: true, retiree: false }
  }

  /*
   * La trace porte l'ouverture, pas le jeton : le jeton est un secret
   * d'opération, et il ne sert plus à rien une fois la ligne retirée.
   */
  await tracerAction(garde.appelant, "fenetre_suppression.liberation",
    "Fenêtre de suppression libérée de force", {
      cible: userId,
      ouverteLe: resultat.ouvert_le ?? null,
      demandeeParL: resultat.demandeur ?? null,
    })

  return { success: true, retiree: true, ouvertLe: resultat.ouvert_le ?? null }
}
