"use server"

import { createClient } from "@supabase/supabase-js"

export async function deleteSalesUserAction(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Suppression physique du compte Auth (le "fantôme")
  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) return { success: false, error: authError.message }

  // Suppression du profil
  await supabase.from('profiles').delete().eq('id', userId)

  return { success: true }
}