import { createClient } from "@supabase/supabase-js"
import { AdminWinnersTable } from "@/components/admin/winners-table"
import { notFound } from "next/navigation"

// Force la mise à jour des données
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

  // ✅ LIMIT SAFE : évite de charger 2000+ gagnants d’un coup (tu pourras paginer après)
  const PAGE_LIMIT = 200

  // INITIALISATION AVEC LA CLÉ MAÎTRESSE (Bypasse le RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. DÉTECTION DU RESTAURANT
  let query = supabase.from("restaurants").select("id, name")

  if (isUUID(slug)) query = query.eq("id", slug)
  else query = query.eq("slug", slug)

  const { data: rawRestaurant, error: restoError } = await query.single()

  if (restoError || !rawRestaurant) return notFound()

  const restaurant = rawRestaurant as unknown as Restaurant

  // 2. RÉCUPÉRATION DES JEUX (Tous les jeux, sans exception)
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

  // ✅ Si aucun jeu => aucun gagnant, on évite une requête .in([]) qui peut être reloue
  if (gameIds.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <AdminWinnersTable initialWinners={[]} />
        </div>
      </div>
    )
  }

  // 3.A ✅ COUNT total (pour informer si > PAGE_LIMIT)
  const { count: totalWinners, error: countError } = await supabase
    .from("winners")
    .select("*", { count: "exact", head: true })
    .in("game_id", gameIds)

  // 3.B ✅ RÉCUPÉRATION DES GAGNANTS (LIMIT + tri stable)
  const { data: winnersData, error: fetchError } = await supabase
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
    .in("game_id", gameIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50)
    .order("id", { ascending: false })
    .limit(PAGE_LIMIT)

  // --- LE MOUCHARD (Regarde ton terminal après rafraîchissement) ---
  console.log("=== DIAGNOSTIC WINNERS PAGE ===")
  console.log("RESTAURANT:", restaurant.name)
  console.log("TOTAL GAGNANTS (count):", totalWinners ?? "n/a")
  console.log("GAGNANTS CHARGÉS:", winnersData?.length || 0)
  if (fetchError) console.error("ERREUR TECHNIQUE:", fetchError.message)
  if (countError) console.error("ERREUR COUNT:", countError.message)

  const winnersList = (winnersData as any) || []

  const formattedWinners = winnersList.map((winner: any) => ({
    ...winner,
    prizes: winner.prizes || {
      label: winner.prize_label_snapshot || "Lot archivé",
      color: "#64748b",
    },
  }))

  const showMoreBanner =
    typeof totalWinners === "number" && totalWinners > PAGE_LIMIT

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

      {countError && (
        <div className="p-4 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-[10px] font-mono">
          Warning count : {countError.message}
        </div>
      )}

      {/* ✅ Bandeau “il y en a plus”, sans casser ton tableau */}
      {showMoreBanner && (
        <div className="p-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 text-[11px] font-semibold">
          Il y a <span className="font-black">{totalWinners}</span> gagnants au total.
          <span className="font-black"> Affichage limité à {PAGE_LIMIT}</span> pour éviter de ralentir le dashboard.
          <span className="block text-[10px] font-mono opacity-70 mt-1">
            Prochaine étape : pagination “Charger plus” (on la branche proprement).
          </span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadowReceiving-sm border border-slate-200 overflow-hidden">
        <AdminWinnersTable initialWinners={formattedWinners} />
      </div>
    </div>
  )
}
