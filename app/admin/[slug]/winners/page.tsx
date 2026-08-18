import { createClient } from "@supabase/supabase-js"
import { AdminWinnersTable } from "@/components/admin/winners-table"
import { notFound } from "next/navigation"
import { autoriserRestaurant } from "@/lib/securite/garde-page-restaurant"

export const dynamic = "force-dynamic"

interface Restaurant {
  id: string
  name: string
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export default async function AdminWinnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ page?: string; q?: string }>
}) {
  const { slug } = await params

  /*
   * AUTORISATION AVANT TOUTE LECTURE — la clé de service contourne la RLS.
   * On repart de l'identifiant rendu par la garde, jamais du slug de l'URL :
   * une page qui résout elle-même le slug peut oublier de le vérifier, une
   * page qui reçoit un identifiant déjà autorisé ne le peut pas.
   */
  const acces = await autoriserRestaurant(slug, "gagnants.consultation")
  if (!acces.autorise) {
    return (
      <div className="p-8 text-center">
        <p className="font-bold text-slate-500">Ce restaurant n&apos;est pas accessible avec ce compte.</p>
      </div>
    )
  }

  const sp = (await searchParams) || {}

  // ✅ EXACTEMENT comme CRM, mais 50 lignes / page
  const PAGE_SIZE = 50
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1)
  const q = (sp.q || "").trim()

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) Restaurant
  let restaurantQuery = supabase.from("restaurants").select("id, name")
  restaurantQuery = restaurantQuery.eq("id", acces.restaurantId)

  const { data: rawRestaurant, error: restoError } = await restaurantQuery.single()
  if (restoError || !rawRestaurant) return notFound()

  const restaurant = rawRestaurant as unknown as Restaurant

  // 2) Games du restaurant
  const { data: gamesData, error: gamesError } = await supabase
    .from("games")
    .select("id")
    .eq("restaurant_id", restaurant.id)

  const Header = () => (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
    </div>
  )

  if (gamesError) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Header />
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-[10px] font-mono">
          Erreur récupération jeux : {gamesError.message}
        </div>
      </div>
    )
  }

  const gameIds = (gamesData as any[])?.map((g) => g.id) || []

  // ✅ Cas 0 jeux
  if (gameIds.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Header />
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <AdminWinnersTable initialWinners={[]} totalCount={0} page={1} totalPages={1} initialQuery="" />
        </div>
      </div>
    )
  }

  // ✅ Filtre SSR (comme CRM)
  const orFilter = q
    ? `first_name.ilike.%${q}%,email.ilike.%${q}%,prize_label_snapshot.ilike.%${q}%`
    : null

  // 3) Count total (pour totalPages)
  let countQuery = supabase
    .from("winners")
    .select("*", { count: "exact", head: true })
    .in("game_id", gameIds)

  if (orFilter) countQuery = countQuery.or(orFilter)

  const { count: totalWinners, error: countError } = await countQuery

  const totalCount = typeof totalWinners === "number" ? totalWinners : 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // 4) Winners (page N) — offset/range (exact CRM)
  let winnersQuery = supabase
    .from("winners")
    .select(
      `
        id,
        created_at,
        first_name,
        email,
        status,
        redeemed_at,
        consumed_at,
        prize_label_snapshot,
        prizes(label, color)
      `
    )
    .in("game_id", gameIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  if (orFilter) winnersQuery = winnersQuery.or(orFilter)

  const { data: winnersData, error: fetchError } = await winnersQuery

  if (fetchError) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Header />
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-[10px] font-mono">
          Mode Maintenance : {fetchError.message}
        </div>
      </div>
    )
  }

  const winnersList = (winnersData as any[]) || []

  const formattedWinners = winnersList.map((winner: any) => ({
    ...winner,
    prizes: winner.prizes || {
      label: winner.prize_label_snapshot || "Lot archivé",
      color: "#64748b",
    },
  }))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Header />

      {countError && (
        <div className="p-4 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-[10px] font-mono">
          Warning count : {countError.message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <AdminWinnersTable
          initialWinners={formattedWinners}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          initialQuery={q}
        />
      </div>
    </div>
  )
}