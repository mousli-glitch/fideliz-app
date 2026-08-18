"use server"

import { createClient } from "@supabase/supabase-js"
import { exigerRole } from "@/lib/securite/garde-action"

export async function logSystemError(params: {
  message: string,
  level?: 'info' | 'warning' | 'error',
  restaurant_slug?: string,
  details?: any
}) {
  /*
   * Sans garde, cette action est une primitive d'écriture anonyme : n'importe
   * qui remplit `system_logs` du texte de son choix, sous le slug de son choix.
   * Les seuls appelants réels sont les écrans root et `delete-winner` — une
   * session authentifiée est donc suffisante et ne casse rien.
   */
  const garde = await exigerRole(["root", "restaurant", "sales"], "journal.ecriture")
  if (!garde.ok) return

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('system_logs').insert([{
    message: String(params.message ?? '').slice(0, 2000),
    level: params.level || 'error',
    restaurant_slug: params.restaurant_slug,
    details: params.details,
  }])
}