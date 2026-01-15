"use server"

import { createClient } from "@supabase/supabase-js"

export async function getSalesData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Récupérer les profils "sales"
  const { data: agents, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'sales')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  // 2. Compter les restaurants rattachés (Transfert vers toi si suppression)
  const agentsWithStats = await Promise.all(agents.map(async (agent) => {
    const { count } = await supabase
      .from('restaurants')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', agent.id) // On garde ta logique owner_id
    
    return { ...agent, restaurants_count: count || 0 }
  }))

  return { success: true, data: agentsWithStats }
}