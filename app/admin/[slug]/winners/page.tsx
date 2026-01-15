import { createClient } from "@/utils/supabase/server"
import { AdminWinnersTable } from "@/components/admin/winners-table"
import { notFound } from "next/navigation"

// Force la mise à jour des données à chaque visite
export const dynamic = "force-dynamic"

interface Restaurant {
  id: string;
  name: string;
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export default async function AdminWinnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  // 1. DÉTECTION DU RESTAURANT
  let query = supabase.from("restaurants").select("id, name")
  
  if (isUUID(slug)) {
    query = query.eq("id", slug)
  } else {
    query = query.eq("slug", slug)
  }

  const { data: rawRestaurant, error: restoError } = await query.single()

  if (restoError || !rawRestaurant) {
    return notFound()
  }

  const restaurant = rawRestaurant as unknown as Restaurant

  // 2. RÉCUPÉRATION DES GAGNANTS (VERSION ROBUSTE)
  // ÉTAPE A : On récupère d'abord tous les IDs de jeux du restaurant (même archivés)
  const { data: gamesData } = await supabase
    .from("games")
    .select("id")
    .eq("restaurant_id", restaurant.id)

  const gameIds = (gamesData as any[])?.map(g => g.id) || []

  // ÉTAPE B : On récupère les gagnants filtrés par ces IDs
  // Cette méthode est plus fiable que la jointure directe qui peut être filtrée par le RLS des jeux
  const { data: winnersData, error: fetchError } = await supabase
    .from("winners")
    .select(`
      *,
      games(name, status), 
      prizes(label, color)
    `)
    .in("game_id", gameIds) 
    .order("created_at", { ascending: false })

  // 3. FIX DU TYPE 'NEVER' ET GESTION DU SNAPSHOT
  const winnersList = (winnersData as any) || []

  const formattedWinners = winnersList.map((winner: any) => ({
    ...winner,
    prizes: winner.prizes || { 
        label: winner.prize_label_snapshot || "Lot archivé", 
        color: "#64748b" 
    }
  }))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-mono">
            Erreur technique : {fetchError.message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <AdminWinnersTable initialWinners={formattedWinners} />
      </div>
    </div>
  )
}