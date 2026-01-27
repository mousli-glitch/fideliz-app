"use server"

import { createClient } from "@supabase/supabase-js"

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

type Cursor = { created_at: string; id: string } | null

export async function getWinnersPageAction(
  slug: string,
  cursor: Cursor,
  limit: number = 200
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1) Restaurant
    let restoQuery = supabase.from("restaurants").select("id, name")
    restoQuery = isUUID(slug) ? restoQuery.eq("id", slug) : restoQuery.eq("slug", slug)

    const { data: restaurant, error: restoErr } = await restoQuery.single()
    if (restoErr || !restaurant) {
      return { success: false, message: "Restaurant introuvable." }
    }

    // 2) Games IDs
    const { data: gamesData, error: gamesErr } = await supabase
      .from("games")
      .select("id")
      .eq("restaurant_id", restaurant.id)

    if (gamesErr) {
      return { success: false, message: gamesErr.message }
    }

    const gameIds = (gamesData as any[])?.map((g) => g.id) || []
    if (gameIds.length === 0) {
      return {
        success: true,
        winners: [],
        hasMore: false,
        nextCursor: null,
        restaurantName: restaurant.name,
      }
    }

    // 3) Winners query (keyset pagination: created_at desc, id desc)
    let winnersQuery = supabase
      .from("winners")
      .select(
        `
        *,
        games(name, status),
        prizes(label, color)
      `
      )
      .in("game_id", gameIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)

    // Cursor: (created_at, id) < (cursor.created_at, cursor.id)
    // => created_at < ts OR (created_at = ts AND id < cursorId)
    if (cursor?.created_at && cursor?.id) {
      const ts = cursor.created_at
      const cid = cursor.id
      winnersQuery = winnersQuery.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${cid})`)
    }

    const { data: winnersData, error: winnersErr } = await winnersQuery
    if (winnersErr) {
      return { success: false, message: winnersErr.message }
    }

    const winners = (winnersData as any[]) || []
    const hasMore = winners.length === limit
    const last = winners[winners.length - 1]
    const nextCursor = last ? { created_at: last.created_at, id: last.id } : null

    return {
      success: true,
      winners,
      hasMore,
      nextCursor,
      restaurantName: restaurant.name,
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Erreur serveur." }
  }
}
