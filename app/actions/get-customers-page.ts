"use server"

import { createClient } from "@supabase/supabase-js"

export type Cursor = { created_at: string; id: string } | null

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * Pagination keyset des contacts par restaurant (slug OU id)
 * Signature: (restaurantSlugOrId, cursor, limit)
 */
export async function getCustomersPageAction(
  restaurantSlugOrId: string,
  cursor: Cursor = null,
  limit: number = 30
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
    if (rErr || !restaurant) return { success: false as const, message: "Restaurant introuvable." }

    // 2) Contacts paginés
    let query = supabase
      .from("contacts")
      .select(`id, created_at, first_name, email, phone, marketing_optin`)
      .eq("restaurant_id", restaurant.id)
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

    const customers = data || []
    const last = customers[customers.length - 1]
    const nextCursor = last?.created_at && last?.id ? { created_at: last.created_at, id: last.id } : null

    return {
      success: true as const,
      customers,
      hasMore: customers.length === limit,
      nextCursor,
    }
  } catch (e: any) {
    return { success: false as const, message: e?.message || "Erreur serveur" }
  }
}