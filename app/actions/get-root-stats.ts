"use server"

import { createClient } from "@supabase/supabase-js"

export async function getRootStats() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { count: restoCount } = await supabase.from('restaurants').select('*', { count: 'exact', head: true })
  const { count: winnersCount } = await supabase.from('winners').select('*', { count: 'exact', head: true })
  const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
  const { count: contactsCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true })

  const { data: orphans } = await supabase
    .from('restaurants')
    .select('id, name, slug')
    .is('owner_id', null)

  // RÉCUPÉRATION DES 10 DERNIERS LOGS D'ERREURS
  const { data: recentLogs } = await supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  return {
    stats: {
      restaurants: restoCount || 0,
      winners: winnersCount || 0,
      users: usersCount || 0,
      contacts: contactsCount || 0
    },
    orphans: orphans || [],
    logs: recentLogs || [] // On envoie les logs à la page
  }
}