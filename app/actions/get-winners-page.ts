"use server"

import { createClient } from "@supabase/supabase-js"

export type Cursor = { created_at: string; id: string } | null

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * Pagination par GAME (utile si tu affiches des gagnants jeu par jeu)
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
        prize_color_snapshot,
        prizes(label, color)
      `)
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)

    // Pagination curseur (seek method)
    if (cursor?.created_at && cursor?.id) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      )
    }

    const { data, error } = await query

    if (error) {
      return { success: false as const, message: error.message }
    }

    const winners = (data || []).map((w: any) => ({
      ...w,
      prizes: w.prizes || {
        label: w.prize_label_snapshot || "Lot archivé",
        color: w.prize_color_snapshot || "#64748b",
      },
    }))

    const last = winners[winners.length - 1]
    const nextCursor =
      last?.created_at && last?.id ? { created_at: last.created_at, id: last.id } : null

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
 * Pagination par RESTAURANT (slug ou UUID) -> c'est ça qu'utilise ton winners-table
 */
export async function getWinnersPageAction(
  restaurantSlugOrId: string,
  limit: number = 200,
  cursor: Cursor = null
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1) Trouver le restaurant via slug ou UUID
    let restoQuery = supabase.from("restaurants").select("id, name")

    if (isUUID(restaurantSlugOrId)) {
      restoQuery = restoQuery.eq("id", restaurantSlugOrId)
    } else {
      restoQuery = restoQuery.eq("slug", restaurantSlugOrId)
    }

    const { data: restaurant, error: restoError } = await restoQuery.single()
    if (restoError || !restaurant?.id) {
      return { success: false as const, message: "Restaurant introuvable." }
    }

    // 2) Récupérer tous les game_id du restaurant
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id")
      .eq("restaurant_id", restaurant.id)

    if (gamesError) {
      return { success: false as const, message: gamesError.message }
    }

    const gameIds = (games || []).map((g: any) => g.id)
    if (gameIds.length === 0) {
      return {
        success: true as const,
        winners: [],
        hasMore: false,
        nextCursor: null,
        restaurantName: restaurant.name,
      }
    }

    // 3) Query winners paginée (keyset)
    let query = supabase
      .from("winners")
      .select(`
        id,
        created_at,
        first_name,
        email,
        status,
        redeemed_at,
        game_id,
        prize_label_snapshot,
        prize_color_snapshot,
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
    if (error) {
      return { success: false as const, message: error.message }
    }

    const winners = (data || []).map((w: any) => ({
      ...w,
      prizes: w.prizes || {
        label: w.prize_label_snapshot || "Lot archivé",
        color: w.prize_color_snapshot || "#64748b",
      },
    }))

    const last = winners[winners.length - 1]
    const nextCursor =
      last?.created_at && last?.id ? { created_at: last.created_at, id: last.id } : null

    return {
      success: true as const,
      winners,
      hasMore: winners.length === limit,
      nextCursor,
      restaurantName: restaurant.name,
    }
  } catch (e: any) {
    return { success: false as const, message: e?.message || "Erreur serveur" }
  }
}
