"use server"

import { createClient } from "@/utils/supabase/server"

export async function getRootStats() {
  const supabase = await createClient()

  // 1. Récupération des compteurs (Stats)
  const [resRestos, resBlocked, resContacts, resWinners, resRedeemed] = await Promise.all([
    supabase.from("restaurants").select("*", { count: "exact", head: true }),
    // ✅ restaurants bloqués (source de vérité = restaurants.is_blocked)
    supabase.from("restaurants").select("*", { count: "exact", head: true }).eq("is_blocked", true),

    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("winners").select("*", { count: "exact", head: true }),
    supabase.from("winners").select("*", { count: "exact", head: true }).eq("status", "redeemed"),
  ])

  // 2. Scan des orphelins (Restaurants sans propriétaire valide)
  const { data: orphans } = await supabase
    .from("restaurants")
    .select("id, name, slug")
    .is("created_by", null)

  // 3. ✅ LOGS SYSTÈME (system_logs = source de vérité)
  // (on sélectionne seulement les colonnes utiles pour éviter des payloads lourds)
  const { data: logs } = await supabase
    .from("system_logs")
    .select("id, created_at, level, action_type, message, user_email, restaurant_id, metadata")
    .order("created_at", { ascending: false })
    .limit(100)

  return {
    stats: {
      restaurants: resRestos.count || 0,
      blocked: resBlocked.count || 0,
      contacts: resContacts.count || 0,
      winners: resWinners.count || 0,
      redeemed: resRedeemed.count || 0,
    },

    // ✅ Pour ton KPI “Restaurants Bloqués” dans root/page.tsx
    blocked_count: resBlocked.count || 0,

    orphans: orphans || [],
    logs: logs || [],
  }
}
