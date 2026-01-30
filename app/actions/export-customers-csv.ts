"use server"

import { createClient } from "@supabase/supabase-js"

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// CSV safe
function csvEscape(v: any) {
  const s = (v ?? "").toString()
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// Phone clean pour Twilio (simple, sans lib)
function normPhone(p: string | null) {
  if (!p) return ""
  return p.trim().replace(/[^\d+]/g, "") // garde chiffres + "+"
}

export async function exportCustomersCsvAction(restaurantSlugOrId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) Restaurant id
  let rq = supabase.from("restaurants").select("id, name").limit(1)
  rq = isUUID(restaurantSlugOrId) ? rq.eq("id", restaurantSlugOrId) : rq.eq("slug", restaurantSlugOrId)

  const { data: restaurant, error: rErr } = await rq.single()
  if (rErr || !restaurant) return { success: false as const, message: "Restaurant introuvable." }

  // 2) Fetch ALL contacts (pagination range)
  const pageSize = 1000
  let offset = 0
  let all: any[] = []

  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, first_name, email, phone, marketing_optin, marketing_optin_at, source_game_id, created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) return { success: false as const, message: error.message }
    const rows = data || []
    all = all.concat(rows)

    if (rows.length < pageSize) break
    offset += pageSize
  }

  // 3) Build CSV (colonnes “campagnes”)
  const header = [
    "restaurant_name",
    "first_name",
    "email",
    "phone",              // phone normalisé
    "marketing_optin",
    "marketing_optin_at", // ✅ timestamp opt-in (recommandé)
    "source_game_id",
    "created_at",
  ].join(";")

  const lines = all.map((c) => {
    return [
      csvEscape(restaurant.name),
      csvEscape(c.first_name),
      csvEscape(c.email),
      csvEscape(normPhone(c.phone)),
      csvEscape(c.marketing_optin ? "true" : "false"),
      csvEscape(c.marketing_optin_at),
      csvEscape(c.source_game_id),
      csvEscape(c.created_at),
    ].join(";")
  })

  const csv = [header, ...lines].join("\n")

  return {
    success: true as const,
    filename: `clients-${restaurant.name}.csv`,
    csv,
    total: all.length,
  }
}