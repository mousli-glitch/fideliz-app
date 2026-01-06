import { createClient } from "@supabase/supabase-js"
import { Users, Gamepad2, Trophy, TrendingUp, Settings, DollarSign, ArrowUpRight, Zap, Lock } from "lucide-react"
import Link from "next/link"
// On importe le bouton qu'on vient de créer
import LogoutButton from "@/components/LogoutButton" 

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const PANIER_MOYEN = 15 

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. On récupère le restaurant ET son statut is_active
  const { data: restaurant } = await supabase
     .from("restaurants")
     .select("id, name, is_active") // J'ai ajouté is_active ici
     .eq("slug", slug)
     .single()
  
  if (!restaurant) return <div>Restaurant introuvable</div>

  // 🛑 2. LE VIGILE : BLOCAGE IMMÉDIAT SI DÉSACTIVÉ
  if (restaurant.is_active === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-red-900/10 border border-red-900 p-8 rounded-3xl max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Lock size={40} />
          </div>
          
          <div>
            <h1 className="text-3xl font-black text-white uppercase">Accès Suspendu</h1>
            <p className="text-red-400 font-medium mt-2">
              L'accès au dashboard de <strong>{restaurant.name}</strong> a été temporairement désactivé par l'administrateur.
            </p>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl text-slate-400 text-sm">
            Raison possible : Facture impayée ou maintenance technique. Veuillez contacter le support.
          </div>

          <div className="pt-4 flex justify-center">
            {/* Le bouton déconnexion pour qu'il puisse partir */}
            <LogoutButton />
          </div>
        </div>
      </div>
    )
  }

  // --- SI TOUT EST OK, ON CHARGE LA SUITE (Ton code original) ---

  const { data: games } = await supabase
    .from("games")
    .select("id, status")
    .eq("restaurant_id", restaurant.id)

  const allGameIds = games?.map(g => g.id) || []
  const activeGame = games?.find(g => g.status === 'active')

  let winnersCount = 0
  let redeemedCount = 0

  if (allGameIds.length > 0) {
    const { count: total } = await supabase.from("winners").select("*", { count: "exact", head: true }).in("game_id", allGameIds)
    const { count: redeemed } = await supabase.from("winners").select("*", { count: "exact", head: true }).in("game_id", allGameIds).eq("status", "redeemed")
    winnersCount = total || 0
    redeemedCount = redeemed || 0
  }

  const estimatedRevenue = redeemedCount * PANIER_MOYEN
  const conversionRate = winnersCount > 0 ? Math.round((redeemedCount / winnersCount) * 100) : 0

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* HEADER RELOOKÉ AVEC BOUTON DECONNEXION */}
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
            {/* LE BOUTON EST ICI */}
            <LogoutButton />
          </div>
        </div>

        {/* CARTES DE STATS "PREMIUM" */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* CARD CA ESTIMÉ */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl shadow-slate-200 relative overflow-hidden group">
             <DollarSign className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 group-hover:text-white/10 transition-all" />
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">CA Généré (Est.)</p>
             <div className="flex items-baseline gap-2">
                <h2 className="text-4xl font-black">{estimatedRevenue}€</h2>
                <ArrowUpRight size={20} className="text-green-400" />
             </div>
             <p className="text-slate-500 text-[10px] mt-4 font-bold italic">Basé sur {redeemedCount} retours clients</p>
          </div>

          {/* CARD BASE CLIENTS */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
             <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                <Users size={20} />
             </div>
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Base Clients</p>
             <h2 className="text-3xl font-black text-slate-800">{winnersCount}</h2>
             <p className="text-green-600 text-[10px] font-black mt-2">+100% Croissance</p>
          </div>

          {/* CARD TAUX DE RETOUR */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
             <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp size={20} />
             </div>
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Taux de Retour</p>
             <h2 className="text-3xl font-black text-slate-800">{conversionRate}%</h2>
             <p className="text-slate-400 text-[10px] font-bold mt-2">Conversion des gains</p>
          </div>

          {/* CARD JEUX JOUÉS */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
             <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                <Zap size={20} />
             </div>
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Jeux Joués</p>
             <h2 className="text-3xl font-black text-slate-800">{winnersCount}</h2>
             <p className="text-slate-400 text-[10px] font-bold mt-2">Parties totales</p>
          </div>
        </div>

        {/* ACTIONS RAPIDES */}
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Pilotage de l'activité</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {activeGame ? (
              <Link href={`/admin/${slug}/games/${activeGame.id}`} className="group bg-white border-2 border-transparent hover:border-blue-500 p-8 rounded-[2rem] transition-all shadow-sm flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Settings size={32} />
                </div>
                <h4 className="font-black text-slate-800 text-lg">Configuration</h4>
                <p className="text-slate-500 text-sm mt-2 font-medium">Modifier les lots et le design de votre jeu actif</p>
                <div className="mt-6 px-4 py-1.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full flex items-center gap-2">
                   <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> EN DIRECT
                </div>
              </Link>
            ) : (
              <Link href={`/admin/${slug}/games/new`} className="group bg-blue-600 p-8 rounded-[2rem] transition-all shadow-lg shadow-blue-200 flex flex-col items-center text-center text-white">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-12 transition-transform">
                  <Gamepad2 size={32} />
                </div>
                <h4 className="font-black text-lg">Créer un Jeu</h4>
                <p className="text-blue-100 text-sm mt-2 font-medium">Lancez votre première campagne en 2 minutes</p>
              </Link>
            )}

            <Link href={`/admin/${slug}/winners`} className="group bg-white border-2 border-transparent hover:border-emerald-500 p-8 rounded-[2rem] transition-all shadow-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Trophy size={32} />
              </div>
              <h4 className="font-black text-slate-800 text-lg">Validation Staff</h4>
              <p className="text-slate-500 text-sm mt-2 font-medium">Accéder à la liste des gagnants et scanner les QR</p>
            </Link>

            <Link href={`/admin/${slug}/customers`} className="group bg-white border-2 border-transparent hover:border-purple-500 p-8 rounded-[2rem] transition-all shadow-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users size={32} />
              </div>
              <h4 className="font-black text-slate-800 text-lg">Portefeuille CRM</h4>
              <p className="text-slate-500 text-sm mt-2 font-medium">Voir vos {winnersCount} clients et exporter en CSV</p>
            </Link>

          </div>
        </div>
      </div>
    </div>
  )
}