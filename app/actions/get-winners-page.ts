"use server"

import { createClient } from "@supabase/supabase-js"

export type Cursor = { created_at: string; id: string } | null

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * ✅ Action utilisée par l’UI Admin (slug restaurant)
 * Signature alignée avec ton front : (slug, cursor, limit)
 */
export async function getWinnersPageAction(
  restaurantSlugOrId: string,
  cursor: Cursor = null,
  limit: number = 50
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1) Restaurant
    let rq = supabase.from("restaurants").select("id, name")
    rq = isUUID(restaurantSlugOrId) ? rq.eq("id", restaurantSlugOrId) : rq.eq("slug", restaurantSlugOrId)
    const { data: restaurant, error: rErr } = await rq.single()

    if (rErr || !restaurant) {
      return { success: false as const, message: "Restaurant introuvable." }
    }

    // 2) Tous les games du restaurant
    const { data: gamesData, error: gErr } = await supabase
      .from("games")
      .select("id")
      .eq("restaurant_id", restaurant.id)

    if (gErr) return { success: false as const, message: gErr.message }

    const gameIds = (gamesData || []).map((g: any) => g.id)
    if (gameIds.length === 0) {
      return { success: true as const, winners: [], hasMore: false, nextCursor: null }
    }

    // 3) Winners paginés (keyset)
    let query = supabase
      .from("winners")
      .select(`
        id,
        created_at,
        first_name,
        email,
        status,
        redeemed_at,
        prize_label_snapshot,
        prizes(label, color)
      `)
      .in("game_id", gameIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)

    if (cursor?.created_at && cursor?.id) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      )
    }

    const { data, error } = await query
    if (error) return { success: false as const, message: error.message }

    const winners = (data || []).map((w: any) => ({
      ...w,
      prizes: w.prizes || {
        label: w.prize_label_snapshot || "Lot archivé",
        color: "#64748b", // ✅ fallback SAFE (car prize_color_snapshot n'existe pas)
      },
    }))

    const last = winners[winners.length - 1]
    const nextCursor = last?.created_at && last?.id ? { created_at: last.created_at, id: last.id } : null

    return {
      success: true as const,
      winners,
      hasMore: winners.length === limit,
      nextCursor,
    }
  } catch (e: any) {
    return { success: false as const, message: e?.message || "Erreur serveur" }
  }
}

/**
 * (Optionnel) si tu veux garder une fonction simple par gameId, on la laisse.
 */
export async function getWinnersPage(
  gameId: string,
  limit: number = 50,
  cursor: Cursor = null
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = supabase
      .from("winners")
      .select(`
        id,
        created_at,
        first_name,
        email,
        status,
        redeemed_at,
        prize_label_snapshot,
        prizes(label, color)
      `)
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)

    if (cursor?.created_at && cursor?.id) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      )
    }

    const { data, error } = await query
    if (error) return { success: false as const, message: error.message }

    const winners = (data || []).map((w: any) => ({
      ...w,
      prizes: w.prizes || {
        label: w.prize_label_snapshot || "Lot archivé",
        color: "#64748b", // ✅ fallback SAFE
      },
    }))

    const last = winners[winners.length - 1]
    const nextCursor = last?.created_at && last?.id ? { created_at: last.created_at, id: last.id } : null

    return {
      success: true as const,
      winners,
      hasMore: winners.length === limit,
      nextCursor,
    }
  } catch (e: any) {
    return { success: false as const, message: e?.message || "Erreur serveur" }
  }
}
