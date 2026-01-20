"use server"

import { createClient } from '@/utils/supabase/server'

export async function getRootStats() {
  const supabase = await createClient()

  // 1. Récupération des compteurs (Stats)
  const [resRestos, resContacts, resWinners, resRedeemed] = await Promise.all([
    supabase.from('restaurants').select('*', { count: 'exact', head: true }),
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase.from('winners').select('*', { count: 'exact', head: true }),
    supabase.from('winners').select('*', { count: 'exact', head: true }).eq('status', 'redeemed')
  ])

  // 2. Scan des orphelins (Restaurants sans propriétaire valide)
  const { data: orphans } = await supabase
    .from('restaurants')
    .select('id, name, slug')
    .is('created_by', null)

  // 3. RÉCUPÉRATION DES NOUVEAUX LOGS (Activity Logs)
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(15)

  return {
    stats: {
      restaurants: resRestos.count || 0,
      contacts: resContacts.count || 0,
      winners: resWinners.count || 0,
      redeemed: resRedeemed.count || 0
    },
    orphans: orphans || [],
    logs: logs || []
  }
}