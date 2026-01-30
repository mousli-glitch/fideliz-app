import { createClient } from "@supabase/supabase-js"
import { AdminWinnersTable } from "@/components/admin/winners-table"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

interface Restaurant {
  id: string
  name: string
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export default async function AdminWinnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // ✅ Page size = 30 (cohérent avec la pagination UI)
  const FETCH_LIMIT = 30

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) Restaurant
  let query = supabase.from("restaurants").select("id, name")
  query = isUUID(slug) ? query.eq("id", slug) : query.eq("slug", slug)

  const { data: rawRestaurant, error: restoError } = await query.single()
  if (restoError || !rawRestaurant) return notFound()

  const restaurant = rawRestaurant as unknown as Restaurant

  // 2) Games du restaurant
  const { data: gamesData, error: gamesError } = await supabase
    .from("games")
    .select("id")
    .eq("restaurant_id", restaurant.id)

  if (gamesError) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-[10px] font-mono">
          Erreur récupération jeux : {gamesError.message}
        </div>
      </div>
    )
  }

  const gameIds = (gamesData as any[])?.map((g) => g.id) || []

  if (gameIds.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <AdminWinnersTable initialWinners={[]} hasMoreInitial={false} />
        </div>
      </div>
    )
  }

  // 3) Count total
  const { count: totalWinners } = await supabase
    .from("winners")
    .select("*", { count: "exact", head: true })
    .in("game_id", gameIds)

  // 4) Winners (page 1)
  const { data: winnersData, error: fetchError } = await supabase
    .from("winners")
    .select(
      `
      id,
      created_at,
      first_name,
      email,
      status,
      redeemed_at,
      prize_label_snapshot,
      prizes(label, color)
    `
    )
    .in("game_id", gameIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FETCH_LIMIT)

  const winnersList = (winnersData as any[]) || []

  const formattedWinners = winnersList.map((winner: any) => ({
    ...winner,
    prizes: winner.prizes || {
      label: winner.prize_label_snapshot || "Lot archivé",
      color: "#64748b",
    },
  }))

  const hasMoreInitial =
    typeof totalWinners === "number" ? totalWinners > FETCH_LIMIT : winnersList.length === FETCH_LIMIT

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-[10px] font-mono">
          Mode Maintenance : {fetchError.message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <AdminWinnersTable initialWinners={formattedWinners} hasMoreInitial={hasMoreInitial} />
      </div>
    </div>
  )
}