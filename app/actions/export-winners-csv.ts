"use server"

import { createClient } from "@supabase/supabase-js"

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

function csvEscape(v: any) {
  const s = (v ?? "").toString()
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function normPhone(p: string | null) {
  if (!p) return ""
  return p.trim().replace(/[^\d+]/g, "")
}

async function exportWinnersBase(restaurantSlugOrId: string, optInOnly: boolean) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Restaurant id
  let rq = supabase.from("restaurants").select("id, name").limit(1)
  rq = isUUID(restaurantSlugOrId) ? rq.eq("id", restaurantSlugOrId) : rq.eq("slug", restaurantSlugOrId)

  const { data: restaurant, error: rErr } = await rq.single()
  if (rErr || !restaurant) return { success: false as const, message: "Restaurant introuvable." }

  // Fetch ALL winners paginés
  const pageSize = 1000
  let offset = 0
  let all: any[] = []

  while (true) {
    let q = supabase
      .from("winners")
      .select(
        [
          "id",
          "restaurant_id",
          "game_id",
          "prize_id",
          "prize_title",
          "prize_label_snapshot",
          "first_name",
          "email",
          "phone",
          "marketing_optin",
          "created_at",
          "status",
          "redeemed_at",
          "consumed_at",
          "expires_at",
        ].join(",")
      )
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (optInOnly) q = q.eq("marketing_optin", true)

    const { data, error } = await q
    if (error) return { success: false as const, message: error.message }

    const rows = data || []
    all = all.concat(rows)

    if (rows.length < pageSize) break
    offset += pageSize
  }

  const header = [
    "restaurant_name",
    "winner_id",
    "created_at",
    "first_name",
    "email",
    "phone",
    "marketing_optin",
    "game_id",
    "prize_id",
    "prize_title",
    "status",
    "redeemed_at",
    "consumed_at",
    "expires_at",
  ].join(";")

  const lines = all.map((w) => {
    const prizeTitle = w.prize_title || w.prize_label_snapshot || ""
    return [
      csvEscape(restaurant.name),
      csvEscape(w.id),
      csvEscape(w.created_at),
      csvEscape(w.first_name),
      csvEscape(w.email),
      csvEscape(normPhone(w.phone)),
      csvEscape(w.marketing_optin ? "true" : "false"),
      csvEscape(w.game_id),
      csvEscape(w.prize_id),
      csvEscape(prizeTitle),
      csvEscape(w.status),
      csvEscape(w.redeemed_at),
      csvEscape(w.consumed_at),
      csvEscape(w.expires_at),
    ].join(";")
  })

  const csv = [header, ...lines].join("\n")

  return {
    success: true as const,
    filename: optInOnly ? `gagnants-optin-${restaurant.name}.csv` : `gagnants-${restaurant.name}.csv`,
    csv,
    total: all.length,
  }
}

export async function exportWinnersCsvAction(restaurantSlugOrId: string) {
  return exportWinnersBase(restaurantSlugOrId, false)
}

export async function exportWinnersCampaignCsvAction(restaurantSlugOrId: string) {
  return exportWinnersBase(restaurantSlugOrId, true)
}