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

  // 🔥 --- DIAGNOSTIQUE SERVEUR (Pour les logs) --- 🔥
  console.log("-----------------------------------------")
  console.log("🔍 DIAGNOSTIQUE ADMIN GAGNANTS")
  console.log("📍 Slug recherché :", slug)
  console.log("🆔 Restaurant ID identifié :", restaurant.id)
  if (fetchError) {
    console.error("❌ ERREUR SQL SUPABASE :", fetchError.message)
  } else {
    console.log("✅ Nombre de lignes reçues :", winnersData?.length || 0)
  }
  console.log("-----------------------------------------")

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

      {/* 🔥 --- NOUVEAU : BLOC DE DIAGNOSTIC VISUEL (Aide au débugage) --- 🔥 */}
      <div className="bg-slate-900 text-green-400 p-5 rounded-2xl font-mono text-xs space-y-2 shadow-2xl border border-slate-700 animate-in fade-in zoom-in duration-300">
        <div className="flex items-center gap-2 text-slate-400 font-bold mb-2 border-b border-slate-700 pb-2 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            🛠 Console de Diagnostic (Live)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <p><span className="text-slate-500">Slug URL:</span> {slug}</p>
            <p><span className="text-slate-500">Base Restaurant ID:</span> {restaurant.id}</p>
            <p className="font-bold text-white">
                <span className="text-slate-500 font-normal">Résultats Supabase :</span> {winnersData?.length || 0} ligne(s)
            </p>
            <p><span className="text-slate-500">Status SQL:</span> {fetchError ? "❌ ERREUR" : "✅ OK"}</p>
        </div>
        {fetchError && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">
                <p className="font-bold">Détail erreur :</p>
                {fetchError.message}
            </div>
        )}
      </div>

      {/* Affichage visuel de l'erreur d'origine */}
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