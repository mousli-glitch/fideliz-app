"use server"

import { createClient } from "@supabase/supabase-js"

export async function getSalesData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: agents, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'sales')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  const agentsWithStats = await Promise.all(agents.map(async (agent) => {
    // MODIFICATION ICI : On utilise created_by au lieu de owner_id
    const { count } = await supabase
      .from('restaurants')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', agent.id) 
    
    return { ...agent, restaurants_count: count || 0 }
  }))

  return { success: true, data: agentsWithStats }
}