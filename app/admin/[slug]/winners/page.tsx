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

  // 2. RÉCUPÉRATION DES GAGNANTS
  const { data: winnersData, error: fetchError } = await supabase
    .from("winners")
    .select(`
      *,
      games!inner(name, restaurant_id), 
      prizes(label, color)
    `)
    .eq("games.restaurant_id", restaurant.id) 
    .order("created_at", { ascending: false })

  // 🔥 --- DÉBUT DIAGNOSTIQUE --- 🔥
  console.log("-----------------------------------------")
  console.log("🔍 DIAGNOSTIQUE ADMIN GAGNANTS")
  console.log("📍 Slug recherché :", slug)
  console.log("🆔 Restaurant ID identifié :", restaurant.id)
  
  if (fetchError) {
    console.error("❌ ERREUR SQL SUPABASE :", fetchError.message)
    console.error("Détails :", fetchError.details)
  } else {
    console.log("✅ Nombre de lignes reçues de la DB :", winnersData?.length || 0)
    if (winnersData && winnersData.length > 0) {
        console.log("📝 Premier gagnant trouvé (game_id) :", (winnersData[0] as any).game_id)
    }
  }
  console.log("-----------------------------------------")
  // 🔥 --- FIN DIAGNOSTIQUE --- 🔥

  // 3. FIX CRITIQUE DU TYPE 'NEVER'
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

      {/* Affichage visuel de l'erreur si elle existe */}
      {fetchError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-mono">
            Error: {fetchError.message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <AdminWinnersTable initialWinners={formattedWinners} />
      </div>
    </div>
  )
}