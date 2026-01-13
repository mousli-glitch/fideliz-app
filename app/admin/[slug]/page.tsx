import { createClient } from "@supabase/supabase-js"
import { Users, Gamepad2, Trophy, TrendingUp, Settings, DollarSign, ArrowUpRight, Zap } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const PANIER_MOYEN = 15 

  // Utilisation de la clé service pour outrepasser les RLS si nécessaire, 
  // mais avec un filtrage manuel ultra-strict.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. On récupère le restaurant de manière UNIQUE via son slug
  const { data: restaurant } = await supabase
     .from("restaurants")
     .select("id, name")
     .eq("slug", slug)
     .single()
  
  if (!restaurant) return <div className="p-8 text-center font-bold">Restaurant introuvable ({slug})</div>

  // 2. On récupère les jeux uniquement pour CE restaurant (Liaison renforcée)
  const { data: games } = await supabase
    .from("games")
    .select("id, status")
    .eq("restaurant_id", restaurant.id)

  const allGameIds = games?.map(g => g.id) || []
  const activeGame = games?.find(g => g.status === 'active')

  let winnersCount = 0
  let redeemedCount = 0

  // 3. Calcul des gagnants : On s'assure que si allGameIds est vide, on n'interroge pas la table
  if (allGameIds.length > 0) {
    // FILTRAGE CRITIQUE : .in("game_id", allGameIds) garantit que seuls les gagnants 
    // de ce restaurant spécifique sont comptés.
    const { count: total } = await supabase
        .from("winners")
        .select("*", { count: "exact", head: true })
        .in("game_id", allGameIds)

    const { count: redeemed } = await supabase
        .from("winners")
        .select("*", { count: "exact", head: true })
        .in("game_id", allGameIds)
        .eq("status", "redeemed")

    winnersCount = total || 0
    redeemedCount = redeemed || 0
  }

  const estimatedRevenue = redeemedCount * PANIER_MOYEN
  const conversionRate = winnersCount > 0 ? Math.round((redeemedCount / winnersCount) * 100) : 0

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-slate-500 font-medium text-lg italic">{restaurant.name} — Performance en direct</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
               <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
               <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">En Ligne</span>
            </div>
          </div>
        </div>

        {/* CARTES DE STATS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden group">
             <DollarSign className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5" />
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">CA Généré (Est.)</p>
             <div className="flex items-baseline gap-2">
                <h2 className="text-4xl font-black">{estimatedRevenue}€</h2>
                <ArrowUpRight size={20} className="text-green-400" />
             </div>
             <p className="text-slate-500 text-[10px] mt-4 font-bold italic">Basé sur {redeemedCount} retours</p>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
             <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                <Users size={20} />
             </div>
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Base Clients</p>
             <h2 className="text-3xl font-black text-slate-800">{winnersCount}</h2>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
             <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp size={20} />
             </div>
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Taux Retour</p>
             <h2 className="text-3xl font-black text-slate-800">{conversionRate}%</h2>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
             <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                <Zap size={20} />
             </div>
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Jeux Joués</p>
             <h2 className="text-3xl font-black text-slate-800">{winnersCount}</h2>
          </div>
        </div>

        {/* ACTIONS RAPIDES */}
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Pilotage</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activeGame ? (
              <Link href={`/admin/${slug}/games/${activeGame.id}`} className="group bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col items-center text-center">
                <Settings className="text-blue-600 mb-6" size={32} />
                <h4 className="font-black text-slate-800 text-lg">Configuration</h4>
                <div className="mt-6 px-4 py-1.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full">EN DIRECT</div>
              </Link>
            ) : (
              <Link href={`/admin/${slug}/games/new`} className="bg-blue-600 p-8 rounded-[2rem] flex flex-col items-center text-center text-white shadow-lg">
                <Gamepad2 size={32} className="mb-6" />
                <h4 className="font-black text-lg">Créer un Jeu</h4>
              </Link>
            )}

            <Link href={`/admin/${slug}/winners`} className="group bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col items-center text-center">
              <Trophy className="text-emerald-600 mb-6" size={32} />
              <h4 className="font-black text-slate-800 text-lg">Validation Staff</h4>
            </Link>

            <Link href={`/admin/${slug}/customers`} className="group bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col items-center text-center">
              <Users className="text-purple-600 mb-6" size={32} />
              <h4 className="font-black text-slate-800 text-lg">Portefeuille CRM</h4>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}