"use server"

import { createClient } from "@supabase/supabase-js"

export async function logSystemError(params: {
  message: string,
  level?: 'info' | 'warning' | 'error',
  restaurant_slug?: string,
  details?: any
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('system_logs').insert([{
    message: params.message,
    level: params.level || 'error',
    restaurant_slug: params.restaurant_slug,
    details: params.details,
    // On pourrait aussi récupérer l'ID de l'utilisateur ici
  }])
}