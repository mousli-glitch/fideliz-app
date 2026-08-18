"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

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

  // ✅ SÉCURISÉ : On ne met plus l'ID en dur dans le code
  const ROOT_ID = process.env.ROOT_ADMIN_ID;

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