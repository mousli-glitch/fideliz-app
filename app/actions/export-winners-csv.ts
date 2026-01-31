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

// Nettoyage basique (garde + et chiffres)
function cleanPhone(p: string | null) {
  if (!p) return ""
  return p.trim().replace(/[^\d+]/g, "")
}

// ✅ Convertit FR "06..." -> "+336..."
function toE164FR(phoneRaw: string) {
  const p = cleanPhone(phoneRaw)

  if (!p) return ""
  if (p.startsWith("+")) return p

  // 00XX -> +XX
  if (p.startsWith("00")) return "+" + p.slice(2)

  // FR classique 06/07...
  if (/^0[67]\d{8}$/.test(p)) return "+33" + p.slice(1)

  // Si c'est déjà "33..." sans +
  if (/^33\d{9}$/.test(p)) return "+" + p

  // Sinon on renvoie tel quel (à toi de corriger)
  return p
}

function buildBody(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "")
}

async function getRestaurantIdAndName(supabase: any, restaurantSlugOrId: string) {
  let rq = supabase.from("restaurants").select("id, name").limit(1)
  rq = isUUID(restaurantSlugOrId) ? rq.eq("id", restaurantSlugOrId) : rq.eq("slug", restaurantSlugOrId)
  const { data: restaurant, error } = await rq.single()
  if (error || !restaurant) return null
  return restaurant
}

async function fetchAllWinnersForRestaurant(
  supabase: any,
  restaurantId: string,
  optInOnly: boolean,
  statusFilter: string | null
) {
  const pageSize = 1000
  let offset = 0
  let all: any[] = []

  while (true) {
    let q = supabase
      .from("winners")
      .select(
        [
          "id",
          "created_at",
          "first_name",
          "email",
          "phone",
          "marketing_optin",
          "status",
          "source_game_id", // si pas présent chez toi => retire du select
          "game_id",
          "prize_title",
          "prize_label_snapshot",
        ].join(",")
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (optInOnly) q = q.eq("marketing_optin", true)
    if (statusFilter) q = q.eq("status", statusFilter)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    const rows = data || []
    all = all.concat(rows)

    if (rows.length < pageSize) break
    offset += pageSize
  }

  return all
}

/**
 * ✅ Export Twilio-ready
 * - optInOnly : true => uniquement marketing_optin = true
 * - statusFilter : ex "redeemed" | "available" | null (pas de filtre)
 * - template : message avec variables {{firstName}} {{restaurant}} {{prize}}
 */
export async function exportWinnersTwilioCsvAction(
  restaurantSlugOrId: string,
  options?: {
    optInOnly?: boolean
    statusFilter?: string | null
    template?: string
  }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const restaurant = await getRestaurantIdAndName(supabase, restaurantSlugOrId)
    if (!restaurant) return { success: false as const, message: "Restaurant introuvable." }

    const optInOnly = Boolean(options?.optInOnly)
    const statusFilter = options?.statusFilter ?? null

    const template =
      options?.template ??
      "Bonjour {{firstName}}, merci pour votre visite chez {{restaurant}}. 🎁 Offre: {{prize}}. Répondez STOP pour vous désinscrire."

    const winners = await fetchAllWinnersForRestaurant(supabase, restaurant.id, optInOnly, statusFilter)

    const header = [
      "To",
      "Body",
      "FirstName",
      "Email",
      "Restaurant",
      "SourceGameId",
      "CreatedAt",
      "WinnerId",
      "OptIn",
      "Status",
    ].join(";")

    const lines = winners
      .map((w) => {
        const to = toE164FR(w.phone || "")
        if (!to) return null // skip si pas de téléphone

        const prize = w.prize_title || w.prize_label_snapshot || "Votre offre"
        const firstName = w.first_name || "Client"

        const body = buildBody(template, {
          firstName,
          restaurant: restaurant.name,
          prize,
        })

        return [
          csvEscape(to),
          csvEscape(body),
          csvEscape(firstName),
          csvEscape(w.email || ""),
          csvEscape(restaurant.name),
          csvEscape(w.source_game_id || w.game_id || ""),
          csvEscape(w.created_at || ""),
          csvEscape(w.id || ""),
          csvEscape(w.marketing_optin ? "true" : "false"),
          csvEscape(w.status || ""),
        ].join(";")
      })
      .filter(Boolean)

    const csv = [header, ...(lines as string[])].join("\n")

    const filename = optInOnly
      ? `twilio-optin-${restaurant.name}.csv`
      : `twilio-all-${restaurant.name}.csv`

    return { success: true as const, csv, filename, total: lines.length }
  } catch (e: any) {
    return { success: false as const, message: e?.message || "Erreur serveur" }
  }
}