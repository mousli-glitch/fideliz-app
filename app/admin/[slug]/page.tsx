import { createClient } from "@supabase/supabase-js"
import { Users, Gamepad2, Trophy, TrendingUp, Settings, DollarSign, ArrowUpRight, Zap, Check } from "lucide-react"
import Link from "next/link"
import ParticipationsChart from "@/components/admin/participations-chart"
import GainsDonut from "@/components/admin/gains-donut"

export const dynamic = "force-dynamic"
export const revalidate = 0 

export default async function AdminDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. RÉCUPÉRATION UNIQUE DU RESTO PAR SLUG
  const { data: restaurant } = await (supabase.from("restaurants") as any)
     .select("id, name, avg_basket, subscription_end")
     .eq("slug", slug)
     .single()
  
  if (!restaurant) return <div className="p-8 text-center font-bold text-slate-500">Restaurant introuvable ({slug})</div>

  // 2. RÉCUPÉRATION DES JEUX : On vérifie qu'ils appartiennent bien à CE restaurant
  const { data: games } = await (supabase.from("games") as any)
    .select("id, status")
    .eq("restaurant_id", restaurant.id)

  const allGameIds = (games as any[])?.map(g => g.id) || []
  const activeGame = (games as any[])?.find(g => g.status === 'active')

  // 3. COMPTAGES (parallélisés pour la rapidité)
  const [winnersRes, redeemedRes, contactsRes] = await Promise.all([
    allGameIds.length > 0
      ? (supabase.from("winners") as any).select("*", { count: "exact", head: true }).in("game_id", allGameIds)
      : Promise.resolve({ count: 0 }),
    allGameIds.length > 0
      ? (supabase.from("winners") as any).select("*", { count: "exact", head: true }).in("game_id", allGameIds).eq("status", "redeemed")
      : Promise.resolve({ count: 0 }),
    (supabase.from("contacts") as any).select("*", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
  ])

  const winnersCount = winnersRes.count || 0
  const redeemedCount = redeemedRes.count || 0
  const contactsCount = contactsRes.count || 0

  const avgBasket = Number(restaurant.avg_basket) || 15
  const estimatedRevenue = redeemedCount * avgBasket
  const conversionRate = winnersCount > 0 ? Math.round((redeemedCount / winnersCount) * 100) : 0

  // 4. Série des 14 derniers jours (pour le graphique d'évolution)
  const DAYS = 14
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (DAYS - 1))

  let dailyRows: any[] = []
  if (allGameIds.length > 0) {
    const { data } = await (supabase.from("winners") as any)
      .select("created_at")
      .in("game_id", allGameIds)
      .gte("created_at", since.toISOString())
    dailyRows = data || []
  }

  const buckets: Record<string, number> = {}
  for (const row of dailyRows) {
    const key = new Date(row.created_at).toISOString().slice(0, 10)
    buckets[key] = (buckets[key] || 0) + 1
  }
  const chartData = Array.from({ length: DAYS }).map((_, i) => {
    const d = new Date(since)
    d.setDate(since.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    const label = i === DAYS - 1 ? "Auj." : `J-${DAYS - 1 - i}`
    return { label, value: buckets[key] || 0 }
  })

  // 5. Répartition des gains (à partir des comptages déjà disponibles)
  const availableCount = Math.max(0, winnersCount - redeemedCount)

  // 6. Lots du jeu actif (stock restant / initial)
  let activePrizes: any[] = []
  if (activeGame) {
    const { data } = await (supabase.from("prizes") as any)
      .select("label, quantity, initial_quantity")
      .eq("game_id", activeGame.id)
      .order("weight", { ascending: false })
    activePrizes = data || []
  }

  // 7. Activité récente (5 derniers gagnants)
  let recentWinners: any[] = []
  if (allGameIds.length > 0) {
    const { data } = await (supabase.from("winners") as any)
      .select("first_name, prize_label_snapshot, status, created_at, redeemed_at")
      .in("game_id", allGameIds)
      .order("created_at", { ascending: false })
      .limit(5)
    recentWinners = data || []
  }

  const timeAgo = (iso: string) => {
    if (!iso) return ""
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h} h`
    return `${Math.floor(h / 24)} j`
  }

  // --- Statut d'abonnement (bandeau gérant) ---
  const _subEnd = restaurant.subscription_end ? new Date(restaurant.subscription_end) : null
  const _now = new Date()
  const _isExpired = _subEnd ? _subEnd < _now : false
  const _daysLeft = _subEnd ? Math.ceil((_subEnd.getTime() - _now.getTime()) / 86400000) : null
  const _expiringSoon = _daysLeft !== null && _daysLeft > 0 && _daysLeft <= 15

  return (
    <div className="p-4 md:p-8">
      {/* ... (Le reste de ton JSX reste strictement identique) ... */}
      <div className="max-w-6xl mx-auto space-y-10">

        {_isExpired && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 flex items-start gap-3">
            <span className="text-2xl">⛔</span>
            <div>
              <p className="font-black text-red-800">Votre abonnement a expiré</p>
              <p className="text-sm text-red-700 mt-0.5">Votre jeu est actuellement suspendu pour vos clients. Contactez Fidéliz pour le réactiver.</p>
            </div>
          </div>
        )}
        {_expiringSoon && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="font-black text-amber-800">Votre abonnement expire bientôt</p>
              <p className="text-sm text-amber-700 mt-0.5">Il reste {_daysLeft} jour{_daysLeft! > 1 ? 's' : ''}. Pensez à le renouveler pour ne pas interrompre votre jeu.</p>
            </div>
          </div>
        )}
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

        {/* ACTIONS RAPIDES (accès immédiat, sous le titre) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {activeGame ? (
            <Link href={`/admin/${slug}/games/${activeGame.id}`} className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 font-black text-slate-800 hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition-all text-sm">
              <Settings size={18} className="text-blue-600" /> Configuration
            </Link>
          ) : (
            <Link href={`/admin/${slug}/games/new`} className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-2xl px-4 py-3.5 font-black hover:bg-blue-700 active:scale-[0.98] transition-all text-sm shadow-sm">
              <Gamepad2 size={18} /> Créer un jeu
            </Link>
          )}
          <Link href={`/admin/${slug}/scanner`} className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 font-black text-slate-800 hover:border-emerald-300 hover:shadow-sm active:scale-[0.98] transition-all text-sm">
            <Trophy size={18} className="text-emerald-600" /> Validation Staff
          </Link>
          <Link href={`/admin/${slug}/customers`} className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 font-black text-slate-800 hover:border-purple-300 hover:shadow-sm active:scale-[0.98] transition-all text-sm">
            <Users size={18} className="text-purple-600" /> Portefeuille CRM
          </Link>
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
             <h2 className="text-3xl font-black text-slate-800">{contactsCount}</h2>
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

        {/* GRAPHIQUE D'ÉVOLUTION DES PARTICIPATIONS */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Participations · 14 derniers jours</h3>
          <ParticipationsChart data={chartData} />
        </div>

        {/* RÉPARTITION DES GAINS + ACTIVITÉ RÉCENTE */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Répartition des gains</h3>
            <GainsDonut available={availableCount} redeemed={redeemedCount} />
          </div>
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Activité récente</h3>
            {recentWinners.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Aucune activité pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {recentWinners.map((w, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <span className="flex items-center gap-2 text-slate-700">
                      {w.status === 'redeemed'
                        ? <Check size={15} className="text-green-600 shrink-0" />
                        : <Trophy size={15} className="text-amber-500 shrink-0" />}
                      <span><strong>{w.first_name || 'Client'}</strong> {w.status === 'redeemed' ? 'a validé' : 'a gagné'} « {w.prize_label_snapshot || 'un lot'} »</span>
                    </span>
                    <span className="text-slate-400 text-xs shrink-0">{timeAgo(w.redeemed_at || w.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* STOCK DU JEU ACTIF */}
        {activeGame && activePrizes.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Stock du jeu actif</h3>
            <div className="space-y-3">
              {activePrizes.map((p, i) => {
                const init = p.initial_quantity
                const rem = p.quantity
                if (init == null || rem == null) {
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{p.label}</span>
                      <span className="text-slate-400">Illimité</span>
                    </div>
                  )
                }
                const pct = init > 0 ? Math.round((rem / init) * 100) : 0
                const low = rem <= Math.max(1, init * 0.15)
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{p.label}</span>
                      <span className={low ? 'text-red-600 font-bold' : 'text-slate-500'}>{rem} / {init}{low ? ' — bientôt épuisé' : ''}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div className={`h-1.5 rounded-full ${low ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}