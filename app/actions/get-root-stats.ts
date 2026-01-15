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

  // NOUVEAU : On compte les tickets validés (ceux qui ont une date de scan)
  const { count: redeemedCount } = await supabase
    .from('winners')
    .select('*', { count: 'exact', head: true })
    .not('redeemed_at', 'is', null)

  const { data: orphans } = await supabase
    .from('restaurants')
    .select('id, name, slug')
    .is('owner_id', null)

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
      contacts: contactsCount || 0,
      redeemed: redeemedCount || 0 // Ajouté ici
    },
    orphans: orphans || [],
    logs: recentLogs || []
  }
}