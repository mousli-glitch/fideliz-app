"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { 
  LogOut, Store, PlusCircle, Trophy, Star, Instagram, 
  Facebook, Smartphone, Bell, AlertCircle, Ban, CheckCircle,
  Share2, X, TrendingUp, DollarSign, MousePointer2, AlertTriangle, Clock
} from 'lucide-react'
import Link from 'next/link'

export default function SalesDashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [selectedBilan, setSelectedBilan] = useState<any>(null)
  
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function getData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return 
      }
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)

      // RÉCUPÉRATION AVEC DATE DU DERNIER GAGNANT
      const { data: restoData } = await (supabase.from('restaurants') as any)
        .select(`
          *,
          winners:winners(count, created_at)
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })

      setRestaurants(restoData || [])
      setLoading(false)
    }
    getData()
  }, [])

  // FONCTION DE CALCUL D'ALERTE
  const getAtRiskStatus = (resto: any) => {
    if (!resto.is_retention_alert_enabled || !resto.winners || resto.winners.length === 0) return false;
    
    // On trouve le gagnant le plus récent
    const dates = resto.winners.map((w: any) => new Date(w.created_at).getTime());
    const lastWinnerTime = Math.max(...dates);
    const now = new Date().getTime();
    
    const diffDays = (now - lastWinnerTime) / (1000 * 60 * 60 * 24);
    return diffDays > (resto.alert_threshold_days || 7);
  }

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setUpdatingId(id)
    const { error } = await (supabase.from('restaurants') as any).update({ is_active: !currentStatus }).eq('id', id)
    if (!error) {
      setRestaurants(restaurants.map(r => r.id === id ? { ...r, is_active: !currentStatus } : r))
    }
    setUpdatingId(null)
  }

  const saveSettings = async (id: string, notes: string, threshold: number, alertEnabled: boolean) => {
    setUpdatingId(id)
    await (supabase.from('restaurants') as any).update({ 
      internal_notes: notes,
      alert_threshold_days: threshold,
      is_retention_alert_enabled: alertEnabled
    }).eq('id', id)
    setUpdatingId(null)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const totalWinners = restaurants.reduce((acc, r) => acc + (r.winners?.[0]?.count || 0), 0)
  const totalGoogle = restaurants.reduce((acc, r) => acc + (r.google_clicks || 0), 0)
  const totalSocial = restaurants.reduce((acc, r) => acc + ((r.tiktok_clicks || 0) + (r.instagram_clicks || 0) + (r.facebook_clicks || 0)), 0)
  const atRiskCount = restaurants.filter(r => getAtRiskStatus(r)).length;

  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-black italic">ANALSYE DU RÉSEAU...</div>

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      
      {/* MODAL BILAN FLASH (CONSERVÉ) */}
      {selectedBilan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedBilan(null)} />
          <div className="relative bg-slate-900 border border-white/10 w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl animate-in zoom-in-95">
            <button onClick={() => setSelectedBilan(null)} className="absolute right-6 top-6 text-slate-500 hover:text-white bg-white/5 p-2 rounded-full transition-colors"><X size={20} /></button>
            <div className="p-10">
              <div className="flex items-center gap-3 mb-8"><div className="bg-blue-600 p-2 rounded-lg"><Trophy size={16} /></div><span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">Bilan Fideliz</span></div>
              <h2 className="text-3xl font-black mb-2">{selectedBilan.name}</h2>
              <div className="grid grid-cols-2 gap-4 my-10">
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5"><DollarSign className="text-green-500 mb-2" size={24}/><div className="text-2xl font-black">{(selectedBilan.winners?.length || 0) * 15}€</div><div className="text-[10px] font-bold text-slate-500 uppercase">CA Estimé</div></div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5"><Trophy className="text-blue-500 mb-2" size={24}/><div className="text-2xl font-black">{selectedBilan.winners?.length || 0}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Gagnants</div></div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between p-4 bg-black/20 rounded-2xl border border-white/5"><span className="text-sm font-bold">Avis Google</span><span className="font-black">+{selectedBilan.google_clicks || 0}</span></div>
                <div className="flex justify-between p-4 bg-black/20 rounded-2xl border border-white/5"><span className="text-sm font-bold">Clics Sociaux</span><span className="font-black">+{ (selectedBilan.tiktok_clicks || 0) + (selectedBilan.instagram_clicks || 0) + (selectedBilan.facebook_clicks || 0) }</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-12 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black italic">ESPACE <span className="text-blue-500">COMMERCIAL</span></h1>
          <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-widest">Portefeuille de {profile?.email}</p>
        </div>
        <button onClick={handleLogout} className="bg-slate-900 border border-slate-800 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500 text-slate-400 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all">
          <LogOut size={16} /> DÉCONNEXION
        </button>
      </div>

      {/* STATS GLOBALES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <Trophy className="text-blue-500 mb-2" size={20} />
          <div className="text-2xl font-black">{totalWinners}</div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter">Gagnants Totaux</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <Star className="text-yellow-500 mb-2" size={20} />
          <div className="text-2xl font-black">{totalGoogle}</div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter">Avis Google</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden">
          {atRiskCount > 0 && <div className="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg animate-pulse">{atRiskCount} ALERTES</div>}
          <Smartphone className="text-purple-500 mb-2" size={20} />
          <div className="text-2xl font-black">{totalSocial}</div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter">Clics Réseaux</div>
        </div>
        <div className="bg-blue-600 p-6 rounded-3xl shadow-lg shadow-blue-900/20">
          <Store className="text-white mb-2" size={20} />
          <div className="text-2xl font-black">{restaurants.length}</div>
          <div className="text-blue-100 text-[10px] font-bold uppercase tracking-tighter">Restaurants Actifs</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LISTE PRINCIPALE */}
        <div className="lg:col-span-2 space-y-6">
          <Link href="/super-admin/sales/new-restaurant" className="group bg-slate-900 border-2 border-dashed border-slate-800 hover:border-blue-500 p-6 rounded-3xl transition-all flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl group-hover:scale-110 transition-transform"><PlusCircle size={24} /></div>
            <div><h2 className="font-black text-xl">NOUVEAU CLIENT</h2><p className="text-slate-500 text-sm">Inscrire un établissement</p></div>
          </Link>

          <div className="space-y-4">
            {restaurants.map((resto) => {
              const isAtRisk = getAtRiskStatus(resto);
              return (
                <div key={resto.id} className={`bg-slate-900 border ${isAtRisk ? 'border-red-600/50 shadow-lg shadow-red-900/10' : 'border-slate-800'} p-6 rounded-3xl transition-all`}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-xl font-black tracking-tight">{resto.name}</h4>
                        {isAtRisk && <span className="bg-red-600 text-white text-[8px] px-2 py-1 rounded-full font-black animate-bounce">ALERTE RÉTENTION</span>}
                      </div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">{resto.city}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedBilan(resto)} className="bg-blue-600/10 text-blue-500 p-2.5 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><Share2 size={18} /></button>
                      <button 
                        disabled={updatingId === resto.id}
                        onClick={() => toggleStatus(resto.id, resto.is_active)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${resto.is_active ? 'bg-red-500/10 text-red-500' : 'bg-green-500 text-white'}`}
                      >
                        {resto.is_active ? <Ban size={14} /> : <CheckCircle size={14} />}
                        {resto.is_active ? 'Bloquer' : 'Débloquer'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <Trophy className="text-blue-500 mb-1" size={14} />
                      <p className="text-lg font-black">{resto.winners?.length || 0}</p>
                    </div>
                    <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <Star className="text-yellow-500 mb-1" size={14} />
                      <p className="text-lg font-black">{resto.google_clicks || 0}</p>
                    </div>
                    <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <Smartphone className="text-purple-500 mb-1" size={14} />
                      <p className="text-lg font-black">{(resto.tiktok_clicks || 0) + (resto.instagram_clicks || 0) + (resto.facebook_clicks || 0)}</p>
                    </div>
                  </div>

                  {/* CRM & RÉTENTION */}
                  <div className="space-y-4 pt-4 border-t border-slate-800">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Notes CRM</label>
                        <textarea 
                          defaultValue={resto.internal_notes}
                          onBlur={(e) => saveSettings(resto.id, e.target.value, resto.alert_threshold_days, resto.is_retention_alert_enabled)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 outline-none h-16"
                        />
                      </div>
                      <div className="w-full md:w-48">
                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Seuil Alerte</label>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" defaultValue={resto.alert_threshold_days}
                              onBlur={(e) => saveSettings(resto.id, resto.internal_notes, parseInt(e.target.value), resto.is_retention_alert_enabled)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-center font-bold"
                            />
                            <span className="text-[10px] font-bold text-slate-600">Jours</span>
                          </div>
                          <button 
                            onClick={() => saveSettings(resto.id, resto.internal_notes, resto.alert_threshold_days, !resto.is_retention_alert_enabled)}
                            className={`flex items-center justify-center gap-2 p-2 rounded-lg text-[9px] font-black uppercase transition-all ${resto.is_retention_alert_enabled ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}
                          >
                            <Bell size={12} /> {resto.is_retention_alert_enabled ? 'Surveillance On' : 'Surveillance Off'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLONNE DROITE : ALERTES CRITIQUES */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl sticky top-8">
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="text-red-500" size={24} />
              <h3 className="text-xl font-black uppercase tracking-tighter">Alertes Clients</h3>
            </div>
            
            <div className="space-y-4">
              {restaurants.filter(r => getAtRiskStatus(r)).length === 0 ? (
                <div className="p-6 bg-green-500/5 border border-green-500/20 rounded-2xl text-center">
                  <CheckCircle className="text-green-500 mx-auto mb-2" size={32} />
                  <p className="text-[10px] font-black text-green-500 uppercase">Tout est sous contrôle</p>
                  <p className="text-[9px] text-slate-500 italic mt-1">Tous tes clients sont actifs.</p>
                </div>
              ) : (
                restaurants.filter(r => getAtRiskStatus(r)).map(r => (
                  <div key={r.id} className="p-4 bg-red-600/10 border border-red-600/20 rounded-2xl group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2"><Clock size={12} className="text-red-500" /></div>
                    <h4 className="font-black text-sm text-red-500 uppercase">{r.name}</h4>
                    <p className="text-[9px] text-slate-400 mt-1 italic">Aucun gagnant depuis +{r.alert_threshold_days} jours.</p>
                    <div className="mt-3 flex gap-2">
                       <button onClick={() => setSelectedBilan(r)} className="text-[9px] font-black bg-red-600 text-white px-3 py-1.5 rounded-lg uppercase">Voir Bilan</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8 p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <h4 className="text-[10px] font-black text-blue-500 uppercase mb-2">Conseil Commercial</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed italic">
                "Un client qui n'a plus de gagnant est un client qui risque de résilier. Appelle-le pour vérifier si son QR Code est bien visible !"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}