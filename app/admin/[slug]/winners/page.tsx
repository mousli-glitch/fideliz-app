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
  // On retire le !inner sur prizes pour ne pas cacher les lignes dont le lot est null
  const { data: winnersData, error: fetchError } = await supabase
    .from("winners")
    .select(`
      *,
      games!inner(name, restaurant_id), 
      prizes(label, color)
    `)
    .eq("games.restaurant_id", restaurant.id) 
    .order("created_at", { ascending: false })

  if (fetchError) {
    console.error("Erreur de récupération :", fetchError.message)
  }

  // 3. FIX CRITIQUE DU TYPE 'NEVER' (Capture d'écran 5)
  // On force le passage en 'any' pour que le code puisse s'exécuter malgré l'erreur VS Code
  const winnersList = (winnersData as any) || []

  const formattedWinners = winnersList.map((winner: any) => ({
    ...winner,
    // Gestion du lot manquant : si prizes est null, on cherche le snapshot, sinon texte de secours
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* On envoie les données formatées au tableau */}
        <AdminWinnersTable initialWinners={formattedWinners} />
      </div>
    </div>
  )
}