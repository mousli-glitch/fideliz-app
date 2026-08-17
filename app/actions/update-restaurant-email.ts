"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { exigerRole, tracerAction } from "@/lib/securite/garde-action"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Super Admin : modifie l'e-mail d'un compte (restaurateur/commercial).
// Contrôle format + unicité, met à jour Auth ET profil, conserve l'accès (mot de passe inchangé),
// et journalise l'action.
//
// GARDE INTERNE (18/08/2026) : root uniquement.
// Le commentaire disait « Super Admin » ; le code ne le vérifiait pas.
// Changer l'e-mail d'un compte, c'est en déplacer la récupération de mot de
// passe : quiconque pouvait appeler cette action pouvait s'attribuer
// n'importe quel compte de la plateforme en deux étapes.
export async function updateRestaurantEmailAction(userId: string, newEmail: string) {
  const garde = await exigerRole(["root"], "compte.email")
  if (!garde.ok) return { success: false, error: garde.error }

  const email = (newEmail || "").trim().toLowerCase()

  // 1. Format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Format d'e-mail invalide." }
  }

  // 2. Unicité (un autre compte utilise-t-il déjà cet e-mail ?)
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .neq("id", userId)
    .maybeSingle()
  if (existing) {
    return { success: false, error: "Cette adresse e-mail est déjà utilisée par un autre compte." }
  }

  // 3. Mise à jour dans Supabase Auth (e-mail confirmé → accès conservé immédiatement)
  const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  })
  if (authErr) {
    return { success: false, error: "Erreur Auth : " + authErr.message }
  }

  // 4. Mise à jour du profil public
  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .update({ email })
    .eq("id", userId)
  if (profErr) {
    return { success: false, error: "Erreur profil : " + profErr.message }
  }

  // 5. Journalisation (non bloquante)
  try {
    await supabaseAdmin.from("activity_logs_legacy").insert({
      action_type: "UPDATE_EMAIL",
      entity_type: "user",
      entity_id: userId,
      details: "E-mail modifié vers " + email,
    })
  } catch {
    /* non bloquant */
  }

  revalidatePath("/super-admin/root/restaurants-management")
  return { success: true }
}
