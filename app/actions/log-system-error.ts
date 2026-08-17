"use server"

import { createClient } from "@supabase/supabase-js"
import { exigerRole } from "@/lib/securite/garde-action"

export async function logSystemError(params: {
  message: string,
  level?: 'info' | 'warning' | 'error',
  restaurant_slug?: string,
  details?: any
}) {
  /* Un journal ouvert à tous est un journal qu'on peut noyer : quelques
     milliers d'insertions et les lignes qui comptent deviennent
     introuvables. Une session suffit — les appelants légitimes sont des
     actions déjà gardées. */
  const garde = await exigerRole(["root", "sales", "restaurant"], "journal.ecriture")
  if (!garde.ok) return

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /* `action_type` et `metadata` sont NOT NULL : sans eux, chaque insertion
     échouait en silence et ce mouchard n'a jamais rien enregistré. */
  await supabase.from('system_logs').insert([{
    message: params.message,
    level: params.level || 'error',
    restaurant_slug: params.restaurant_slug,
    details: params.details ?? {},
    action_type: 'app.erreur',
    metadata: { source: 'logSystemError' },
    user_id: garde.appelant.userId,
    user_email: garde.appelant.email,
  }])
}