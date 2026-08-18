"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"
import { resoudreRootHeritier } from "@/lib/securite/root"

// GARDE INTERNE (18/08/2026) : root uniquement.
// L'action réattribue en masse tous les restaurants sans propriétaire au
// compte root. Elle écrit sur `restaurants` sans qu'aucun identifiant ne
// soit fourni — donc sans qu'aucun contrôle d'objet soit possible. Le seul
// garde-fou envisageable est le rôle de l'appelant.
export async function repairOrphansAction() {
  const garde = await exigerRole(["root"], "donnees.reparation")
  if (!garde.ok) return { success: false, error: garde.error }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /*
   * L'identifiant venait de `ROOT_ADMIN_ID`. C'était déjà mieux qu'un UUID
   * écrit dans le fichier, mais ça reste un couplage à une identité : la
   * variable pointe vers le root de production, donc ce chemin ne peut pas
   * s'exercer avec un compte synthétique — il n'était testable qu'en
   * production. On cherche le root par son rôle, comme ailleurs.
   *
   * ─── FAIL-CLOSED, CORRIGÉ LE 19/08/2026 ───
   *
   * Ce chemin appelait `idDuCompteRoot()`, qui rendait `null` aussi bien
   * pour « aucun root » que pour « lecture impossible » — son `error`
   * n'était pas même lu. Ce `null` partait ensuite dans l'`update`
   * ci-dessous, mené à la CLÉ DE SERVICE : une panne de lecture écrivait
   * donc `user_id = null` sur tous les restaurants sans propriétaire, et
   * l'action répondait `success: true`. Une panne devenait une perte de
   * données silencieuse.
   *
   * Désormais : résultat discriminé, et AUCUNE écriture tant qu'un root
   * n'est pas positivement identifié.
   */
  const heritier = await resoudreRootHeritier()
  if (!heritier.ok) {
    return { success: false, error: heritier.cause === "aucun_root"
      ? "Aucun compte root : réattribution impossible."
      : "Lecture des profils impossible : réattribution annulée." }
  }
  const ROOT_ID = heritier.rootId

  // On ne met à jour QUE owner_id et user_id pour ne pas casser le lien commercial
  const { error } = await supabase
    .from('restaurants')
    .update({
        owner_id: ROOT_ID,
        user_id: ROOT_ID
    })
    .is('owner_id', null)

  if (error) return { success: false, error: error.message }

  await tracerAction(garde.appelant, 'donnees.reparation', 'Restaurants orphelins réattribués au root')

  revalidatePath('/super-admin/root')
  return { success: true }
}