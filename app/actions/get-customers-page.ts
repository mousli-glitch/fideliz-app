"use server"

import { createClient } from "@supabase/supabase-js"

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * Pagination OFFSET (range) : page=1 => 0..limit-1, page=2 => limit..2*limit-1
 */
export async function getCustomersPageAction(
  restaurantSlugOrId: string,
  page: number = 1,
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

    const safePage = Math.max(1, Number(page || 1))
    const from = (safePage - 1) * limit
    const to = from + limit - 1

    // 2) Contacts paginés + count total
    const { data, error, count } = await supabase
      .from("contacts")
      .select("id, first_name, email, phone, created_at, marketing_optin", { count: "exact" })
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)

    if (error) return { success: false as const, message: error.message }

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    return {
      success: true as const,
      customers: data || [],
      total,
      totalPages,
      page: safePage,
      hasMore: safePage < totalPages,
    }
  } catch (e: any) {
    return { success: false as const, message: e?.message || "Erreur serveur" }
  }
}