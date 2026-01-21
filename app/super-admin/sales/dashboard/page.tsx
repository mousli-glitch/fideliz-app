"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import {
  LogOut, Store, PlusCircle, Trophy, Star,
  Facebook, Smartphone, Bell, Ban, CheckCircle,
  Share2, X, DollarSign, AlertTriangle, Clock, ExternalLink, Power
} from "lucide-react";
import Link from "next/link";

export default function SalesDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedBilan, setSelectedBilan] = useState<any>(null);

  const supabase = createClient();
  const router = useRouter();

  // 1. CHARGEMENT DES DONNÉES
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sales/dashboard", { cache: "no-store" });

        if (res.status === 401) {
          router.push("/login");
          return;
        }

        const json = await res.json();
        if (!res.ok) {
          console.error(json);
          setLoading(false);
          return;
        }

        setProfile(json.profile);
        // On s'assure que is_active est bien pris en compte
        setRestaurants(json.restaurants || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // 2. LOGIQUE RISQUE (Ta logique existante)
  const getAtRiskStatus = (resto: any) => {
    if (!resto.is_retention_alert_enabled) return false;
    const last = resto.winners?.last_winner_at;
    if (!last) return false;

    const lastWinnerTime = new Date(last).getTime();
    const now = Date.now();
    const diffDays = (now - lastWinnerTime) / (1000 * 60 * 60 * 24);
    return diffDays > (resto.alert_threshold_days || 7);
  };

  // 3. ACTION BLOCAGE / DÉBLOCAGE (Connecté à is_active)
  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setUpdatingId(id);
    
    // Optimistic UI : Mise à jour immédiate
    setRestaurants(restaurants.map(r => r.id === id ? { ...r, is_active: !currentStatus } : r));

    const { error } = await (supabase.from("restaurants") as any)
      .update({ is_active: !currentStatus })
      .eq("id", id);

    if (error) {
      alert("Erreur lors de la modification du statut.");
      // Rollback si erreur
      setRestaurants(restaurants.map(r => r.id === id ? { ...r, is_active: currentStatus } : r));
    }
    setUpdatingId(null);
  };

  const saveSettings = async (id: string, notes: string, threshold: number, alertEnabled: boolean) => {
    setUpdatingId(id);
    await (supabase.from("restaurants") as any).update({
      internal_notes: notes,
      alert_threshold_days: threshold,
      is_retention_alert_enabled: alertEnabled
    }).eq("id", id);
    setUpdatingId(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const totalWinners = restaurants.reduce((acc, r) => acc + (r.winners?.count || 0), 0);
  const totalGoogle = restaurants.reduce((acc, r) => acc + (r.google_clicks || 0), 0);
  const totalSocial = restaurants.reduce((acc, r) => acc + ((r.tiktok_clicks || 0) + (r.instagram_clicks || 0) + (r.facebook_clicks || 0)), 0);
  const atRiskCount = restaurants.filter(r => getAtRiskStatus(r)).length;

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-black italic animate-pulse">FIDELIZ ANALYSE...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      {/* MODAL BILAN FLASH (INCHANGÉ) */}
      {selectedBilan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedBilan(null)} />
          <div className="relative bg-slate-900 border border-white/10 w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl animate-in zoom-in-95">
            <button onClick={() => setSelectedBilan(null)} className="absolute right-6 top-6 text-slate-500 hover:text-white bg-white/5 p-2 rounded-full transition-colors"><X size={20} /></button>
            <div className="p-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="bg-blue-600 p-2 rounded-lg"><Trophy size={16} /></div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">Bilan Fideliz</span>
              </div>
              <h2 className="text-3xl font-black mb-2">{selectedBilan.name}</h2>
              <div className="grid grid-cols-2 gap-4 my-10">
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                  <DollarSign className="text-green-500 mb-2" size={24} />
                  <div className="text-2xl font-black">{(selectedBilan.winners?.count || 0) * 15}€</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">CA Estimé</div>
                </div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                  <Trophy className="text-blue-500 mb-2" size={24} />
                  <div className="text-2xl font-black">{selectedBilan.winners?.count || 0}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Gagnants</div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                  <span className="text-sm font-bold">Avis Google</span>
                  <span className="font-black">+{selectedBilan.google_clicks || 0}</span>
                </div>
                <div className="flex justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                  <span className="text-sm font-bold">Clics Sociaux</span>
                  <span className="font-black">+{(selectedBilan.tiktok_clicks || 0) + (selectedBilan.instagram_clicks || 0) + (selectedBilan.facebook_clicks || 0)}</span>
                </div>
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

      {/* STATS */}
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
          <div className="text-blue-100 text-[10px] font-bold uppercase tracking-tighter">Restaurants</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Link href="/super-admin/sales/new-restaurant" className="group bg-slate-900 border-2 border-dashed border-slate-800 hover:border-blue-500 p-6 rounded-3xl transition-all flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl group-hover:scale-110 transition-transform"><PlusCircle size={24} /></div>
            <div><h2 className="font-black text-xl">NOUVEAU CLIENT</h2><p className="text-slate-500 text-sm">Inscrire un établissement</p></div>
          </Link>

          <div className="space-y-4">
            {restaurants.map((resto) => {
              const isAtRisk = getAtRiskStatus(resto);
              // 👇 MODIF IMPORTANTE : On détecte si c'est bloqué
              const isBlocked = resto.is_active === false; 

              return (
                <div 
                  key={resto.id} 
                  // 👇 STYLE CONDITIONNEL : Rouge si bloqué, sinon style normal
                  className={`
                    transition-all border p-6 rounded-3xl relative overflow-hidden
                    ${isBlocked 
                        ? "bg-red-950/20 border-red-900/50" // Style Bloqué
                        : isAtRisk 
                            ? "bg-slate-900 border-red-600/50 shadow-lg shadow-red-900/10" // Style Risque
                            : "bg-slate-900 border-slate-800" // Style Normal
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-3">
                        {/* 👇 NOM BARRÉ SI BLOQUÉ */}
                        <h4 className={`text-xl font-black tracking-tight ${isBlocked ? 'text-slate-500 line-through' : 'text-white'}`}>
                          {resto.name}
                        </h4>
                        
                        {/* BADGES */}
                        {isBlocked && <span className="bg-red-600 text-white text-[8px] px-2 py-1 rounded-full font-black">ACCÈS BLOQUÉ</span>}
                        {isAtRisk && !isBlocked && <span className="bg-red-600 text-white text-[8px] px-2 py-1 rounded-full font-black animate-bounce">ALERTE RÉTENTION</span>}
                      </div>
                      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">{resto.city} <span className="font-mono opacity-50">/{resto.slug}</span></p>
                    </div>

                    <div className="flex gap-2">
                      {/* BOUTON VOIR DASHBOARD (Désactivé si bloqué) */}
                      <Link 
                        href={`/admin/${resto.slug}`} 
                        className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${isBlocked ? 'bg-red-900/20 text-red-500 cursor-not-allowed opacity-50' : 'bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white'}`}
                      >
                         <ExternalLink size={18} />
                      </Link>

                      <button onClick={() => setSelectedBilan(resto)} className="bg-slate-800 text-slate-400 p-2.5 rounded-xl hover:bg-white hover:text-black transition-all"><Share2 size={18} /></button>
                      
                      {/* BOUTON BLOQUER / DÉBLOQUER (Synchronisé Root) */}
                      <button
                        disabled={updatingId === resto.id}
                        onClick={() => toggleStatus(resto.id, resto.is_active)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${
                            // Si is_active !== false (donc true ou null), c'est Actif -> Bouton pour Désactiver
                            resto.is_active !== false 
                            ? "bg-slate-800 text-slate-400 hover:bg-red-500 hover:text-white" 
                            : "bg-green-600 text-white hover:bg-green-500"
                        }`}
                      >
                        {resto.is_active !== false ? <Ban size={14} /> : <CheckCircle size={14} />}
                        {resto.is_active !== false ? "Bloquer" : "Débloquer"}
                      </button>
                    </div>
                  </div>

                  {/* STATS (Grisées si bloqué) */}
                  <div className={`grid grid-cols-3 gap-4 mb-6 ${isBlocked ? 'opacity-30 grayscale' : ''}`}>
                    <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                      <Trophy className="text-blue-500 mb-1" size={14} />
                      <p className="text-lg font-black">{resto.winners?.count || 0}</p>
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

                  {/* NOTES CRM (Toujours accessibles même si bloqué, pour noter pourquoi) */}
                  <div className="space-y-4 pt-4 border-t border-slate-800">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Notes CRM</label>
                        <textarea
                          defaultValue={resto.internal_notes}
                          onBlur={(e) => saveSettings(resto.id, e.target.value, resto.alert_threshold_days, resto.is_retention_alert_enabled)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 outline-none h-16 focus:border-blue-500 transition-colors"
                          placeholder="Note interne..."
                        />
                      </div>
                      <div className="w-full md:w-48">
                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Seuil Alerte</label>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              defaultValue={resto.alert_threshold_days}
                              onBlur={(e) => saveSettings(resto.id, resto.internal_notes, parseInt(e.target.value || "7", 10), resto.is_retention_alert_enabled)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-center font-bold outline-none focus:border-blue-500"
                            />
                            <span className="text-[10px] font-bold text-slate-600">Jours</span>
                          </div>
                          <button
                            onClick={() => saveSettings(resto.id, resto.internal_notes, resto.alert_threshold_days, !resto.is_retention_alert_enabled)}
                            className={`flex items-center justify-center gap-2 p-2 rounded-lg text-[9px] font-black uppercase transition-all ${resto.is_retention_alert_enabled ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500"}`}
                          >
                            <Bell size={12} /> {resto.is_retention_alert_enabled ? "Surveillance On" : "Surveillance Off"}
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

        {/* SIDEBAR ALERTES (INCHANGÉE) */}
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
                  <div key={r.id} className="p-4 bg-red-600/10 border border-red-600/20 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2"><Clock size={12} className="text-red-500" /></div>
                    <h4 className="font-black text-sm text-red-500 uppercase">{r.name}</h4>
                    <p className="text-[9px] text-slate-400 mt-1 italic">
                      Aucun gagnant depuis +{r.alert_threshold_days} jours.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setSelectedBilan(r)} className="text-[9px] font-black bg-red-600 text-white px-3 py-1.5 rounded-lg uppercase">
                        Voir Bilan
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8 p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <h4 className="text-[10px] font-black text-blue-500 uppercase mb-2">Conseil Commercial</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed italic">
                "Un client qui n'a plus de gagnant est un client qui risque de résilier. Appelle-le !"
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}