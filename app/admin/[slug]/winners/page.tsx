import { createClient } from "@/utils/supabase/server"
import { AdminWinnersTable } from "@/components/admin/winners-table"
import { notFound } from "next/navigation"

// Force la mise à jour des données à chaque visite
export const dynamic = "force-dynamic"

// 1. DÉFINITION DU TYPE
interface Restaurant {
  id: string;
  name: string;
}

// Fonction utilitaire
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export default async function AdminWinnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  // 2. DÉTECTION DU RESTAURANT
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

  // 3. RÉCUPÉRATION DES GAGNANTS (LOGIQUE SÉCURISÉE)
  // On utilise une jointure pour filtrer par restaurant
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
    console.error("Erreur Supabase Winners:", fetchError)
  }

  // 🔥 CORRECTION CRITIQUE DU TYPE "NEVER" 🔥
  // On force winnersData en "any[]" pour que le .map() puisse s'exécuter sans erreur TS
  const rawWinners = (winnersData as any[]) || []

  const formattedWinners = rawWinners.map((winner) => ({
    ...winner,
    // On gère tous les cas : lot présent, snapshot présent, ou lot supprimé
    prizes: winner.prizes || { 
        label: winner.prize_label_snapshot || "Lot archivé/modifié", 
        color: "#64748b" 
    }
  }))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm font-bold">
          ⚠️ Erreur de base de données : {fetchError.message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* On passe les données formatées au tableau interactif */}
        <AdminWinnersTable initialWinners={formattedWinners} />
      </div>
    </div>
  )
}