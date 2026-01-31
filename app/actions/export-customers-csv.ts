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

// Nettoyage basique (garde + et chiffres)
function cleanPhone(p: string | null) {
  if (!p) return ""
  return p.trim().replace(/[^\d+]/g, "")
}

// ✅ Convertit FR vers E164 (robuste) + corrige le bug +330
function toE164FR(phoneRaw: string | null) {
  const p0 = cleanPhone(phoneRaw)
  if (!p0) return ""

  // 00XX -> +XX
  let p = p0.startsWith("00") ? "+" + p0.slice(2) : p0

  // Si déjà +33 mais avec 0 derrière (ex: +3306...) => on enlève ce 0
  if (p.startsWith("+330")) {
    p = "+33" + p.slice(4)
  }

  // Si déjà 33 mais avec 0 derrière (ex: 3306...) => +33 + enlever 0
  if (/^330/.test(p)) {
    p = "+33" + p.slice(3)
  }

  // Si déjà +XX, ok
  if (p.startsWith("+")) return p

  // FR classique 06/07XXXXXXXX
  if (/^0[67]\d{8}$/.test(p)) return "+33" + p.slice(1)

  // Cas fréquent : saisi sans le 0 => 6XXXXXXXX ou 7XXXXXXXX
  if (/^[67]\d{8}$/.test(p)) return "+33" + p

  // Déjà 33XXXXXXXXX sans +
  if (/^33\d{9}$/.test(p)) return "+" + p

  // Sinon (étranger / format inattendu)
  return p
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

  // 3) Build CSV
  const header = [
    "restaurant_name",
    "first_name",
    "email",
    "phone",              // ✅ E164 (+33...)
    "marketing_optin",
    "marketing_optin_at",
    "source_game_id",
    "created_at",
  ].join(";")

  const lines = all.map((c) => {
    return [
      csvEscape(restaurant.name),
      csvEscape(c.first_name),
      csvEscape(c.email),
      csvEscape(toE164FR(c.phone)),
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