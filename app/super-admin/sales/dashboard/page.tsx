"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import {
  LogOut, Store, PlusCircle, Trophy, Star,
  Smartphone, Bell, Share2, X, DollarSign,
  AlertTriangle, Clock, Search, Wallet, TrendingUp,
  Activity, Lock, CheckCircle // <--- L'oubli est réparé ici !
} from "lucide-react";
import Link from "next/link";

export default function SalesDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedBilan, setSelectedBilan] = useState<any>(null);

  // Barre de recherche et Filtres
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "risk" | "active">("all");

  const supabase = createClient();
  const router = useRouter();

  // 1. CHARGEMENT
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sales/dashboard", { cache: "no-store" });
        if (res.status === 401) { router.push("/login"); return; }
        const json = await res.json();
        if (!res.ok) { setLoading(false); return; }

        setProfile(json.profile);
        setRestaurants(json.restaurants || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // LOGIQUE EXISTANTE
  const getAtRiskStatus = (resto: any) => {
    if (!resto.is_retention_alert_enabled) return false;
    const last = resto.winners?.last_winner_at;
    if (!last) return false;
    const lastWinnerTime = new Date(last).getTime();
    const diffDays = (Date.now() - lastWinnerTime) / (1000 * 60 * 60 * 24);
    return diffDays > (resto.alert_threshold_days || 7);
  };

  // ✅ PATCH: blocage/déblocage via endpoint unique (restaurants.is_blocked)
  const toggleStatus = async (id: string, currentBlocked: boolean) => {
    setUpdatingId(id);

    // Optimistic UI: on inverse localement is_blocked
    setRestaurants(prev =>
      prev.map(r => (r.id === id ? { ...r, is_blocked: !currentBlocked } : r))
    );

    try {
      const res = await fetch("/api/restaurants/block", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: id,
          is_blocked: !currentBlocked,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Erreur maj statut");
      }

      // Refresh pour être sûr que tout est synchro (RPC/login/etc.)
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Erreur maj statut");

      // Rollback si erreur
      setRestaurants(prev =>
        prev.map(r => (r.id === id ? { ...r, is_blocked: currentBlocked } : r))
      );
    } finally {
      setUpdatingId(null);
    }
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

  // FILTRAGE INTELLIGENT
  const filteredRestaurants = restaurants.filter(r => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.slug.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "risk") return getAtRiskStatus(r);
    if (filter === "active") return r.is_blocked !== true; // ✅ actif = non bloqué
    return true;
  });

  // STATS GLOBALES
  const totalWinners = restaurants.reduce((acc, r) => acc + (r.winners?.count || 0), 0);
  const portfolioValue = restaurants.filter(r => r.is_blocked !== true).length * 49;

  if (loading) return (
    <div className="min-h-screen bg-[#050a14] text-white flex items-center justify-center font-black italic animate-pulse">
      FIDELIZ LOADING...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050a14] text-white font-sans selection:bg-blue-500/30">

      {/* MODAL BILAN */}
      {selectedBilan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelectedBilan(null)} />
          <div className="relative bg-slate-900 border border-white/10 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl">
            <button onClick={() => setSelectedBilan(null)} className="absolute right-6 top-6 text-slate-500 hover:text-white bg-white/5 p-2 rounded-full transition-colors"><X size={20} /></button>
            <div className="p-8 md:p-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-600 p-2 rounded-lg"><Trophy size={16} /></div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">Bilan Fideliz</span>
              </div>
              <h2 className="text-3xl font-black mb-2 text-white">{selectedBilan.name}</h2>
              <div className="grid grid-cols-2 gap-4 my-8">
                <div className="bg-white/5 p-5 rounded-2xl border border-white/5 text-center">
                  <DollarSign className="text-green-500 mb-2 mx-auto" size={24} />
                  <div className="text-2xl font-black">{(selectedBilan.winners?.count || 0) * 15}€</div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase">CA Estimé</div>
                </div>
                <div className="bg-white/5 p-5 rounded-2xl border border-white/5 text-center">
                  <Trophy className="text-blue-500 mb-2 mx-auto" size={24} />
                  <div className="text-2xl font-black">{selectedBilan.winners?.count || 0}</div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Gagnants</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between p-4 bg-black/40 rounded-xl border border-white/5">
                  <span className="text-xs font-bold text-slate-400">Avis Google</span>
                  <span className="font-black text-yellow-500">+{selectedBilan.google_clicks || 0}</span>
                </div>
                <div className="flex justify-between p-4 bg-black/40 rounded-xl border border-white/5">
                  <span className="text-xs font-bold text-slate-400">Clics Sociaux</span>
                  <span className="font-black text-purple-500">+{(selectedBilan.tiktok_clicks || 0) + (selectedBilan.instagram_clicks || 0) + (selectedBilan.facebook_clicks || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-7xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter">
              FIDELIZ <span className="text-blue-500">SALES</span>
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              PORTFOLIO: {profile?.email}
            </p>
          </div>
          <button onClick={handleLogout} className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-500 hover:border-red-900/50 transition-all text-xs font-bold uppercase">
            <LogOut size={14} /> <span className="group-hover:translate-x-1 transition-transform">Déconnexion</span>
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Wallet size={64} /></div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Valeur Portefeuille</div>
            <div className="text-3xl font-black text-white">{portfolioValue}€<span className="text-sm text-slate-600">/mo</span></div>
            <div className="mt-2 text-[10px] text-green-500 font-bold flex items-center gap-1"><TrendingUp size={12} /> Revenu Récurrent Estimé</div>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Trophy size={64} /></div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Impact Gagnants</div>
            <div className="text-3xl font-black text-blue-500">{totalWinners}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold">Clients satisfaits</div>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Store size={64} /></div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Parc Restaurants</div>
            <div className="text-3xl font-black text-purple-500">{restaurants.length}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold">{restaurants.filter(r => r.is_blocked !== true).length} Actifs</div>
          </div>

          <Link href="/super-admin/sales/new-restaurant" className="bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl flex flex-col justify-center items-center text-center transition-all shadow-lg shadow-blue-900/20 group cursor-pointer border border-blue-500">
            <PlusCircle size={32} className="mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xl font-black">NOUVEAU CLIENT</div>
            <div className="text-[10px] uppercase font-bold text-blue-200 mt-1">Signer un contrat</div>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LISTE CLIENTS */}
          <div className="lg:col-span-2 space-y-6">

            {/* BARRE DE RECHERCHE */}
            <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Rechercher un restaurant..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-3 rounded-xl outline-none focus:border-blue-500 transition-all font-medium text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${filter === "all" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>Tout</button>
                <button onClick={() => setFilter("risk")} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${filter === "risk" ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400 hover:text-red-400"}`}>À Risque</button>
              </div>
            </div>

            {/* LISTING CARTES */}
            <div className="space-y-4">
              {filteredRestaurants.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
                  <p className="text-slate-500 italic">Aucun restaurant trouvé.</p>
                </div>
              ) : (
                filteredRestaurants.map((resto) => {
                  const isAtRisk = getAtRiskStatus(resto);
                  const isBlocked = resto.is_blocked === true;

                  return (
                    <div
                      key={resto.id}
                      className={`group relative bg-slate-900 border transition-all rounded-3xl overflow-hidden ${isBlocked ? "border-red-900/50 opacity-75" : isAtRisk ? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : "border-slate-800 hover:border-slate-700"}`}
                    >
                      {/* EN-TÊTE CARTE & BOUTONS */}
                      <div className="p-6 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">

                        {/* INFO RESTO */}
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${isBlocked ? "bg-red-900/20 text-red-500" : "bg-slate-800 text-blue-500"}`}>
                            {resto.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className={`font-black text-lg ${isBlocked ? "line-through text-slate-500" : "text-white"}`}>{resto.name}</h3>
                              {isAtRisk && !isBlocked && <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold animate-pulse">RISQUE</span>}
                            </div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{resto.city}</p>
                          </div>
                        </div>

                        {/* BOUTONS D'ACTION FIXES */}
                        <div className="flex items-center gap-2">
                          {/* 1. BOUTON BILAN (Avec Texte) */}
                          <button
                            onClick={() => setSelectedBilan(resto)}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold uppercase transition-all text-slate-300 hover:text-white"
                          >
                            <Share2 size={14} />
                            <span>Bilan</span>
                          </button>

                          {/* 2. BOUTON ON/OFF (Style Interrupteur) */}
                          <button
                            disabled={updatingId === resto.id}
                            onClick={() => toggleStatus(resto.id, isBlocked)}
                            className={`
                              flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all border
                              ${!isBlocked
                                ? "bg-slate-900 border-green-900 text-green-500 hover:bg-green-900/20"
                                : "bg-red-900/20 border-red-900 text-red-500 hover:bg-red-900/30"
                              }
                            `}
                          >
                            {!isBlocked ? (
                              <>
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                                <span>Actif</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                <span>Bloqué</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* STATS */}
                      <div className="px-6 py-4 grid grid-cols-3 gap-2 border-t border-b border-slate-800/50 bg-black/20">
                        <div className="text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Gagnants</div>
                          <div className="font-black text-white">{resto.winners?.count || 0}</div>
                        </div>
                        <div className="text-center border-l border-slate-800/50">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Avis Google</div>
                          <div className="font-black text-yellow-500">+{resto.google_clicks || 0}</div>
                        </div>
                        <div className="text-center border-l border-slate-800/50">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Réseaux</div>
                          <div className="font-black text-purple-500">+{(resto.tiktok_clicks || 0) + (resto.instagram_clicks || 0) + (resto.facebook_clicks || 0)}</div>
                        </div>
                      </div>

                      {/* NOTES CRM */}
                      <div className="px-6 py-3 bg-slate-900 flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex-1 w-full">
                          <input
                            defaultValue={resto.internal_notes}
                            onBlur={(e) => saveSettings(resto.id, e.target.value, resto.alert_threshold_days, resto.is_retention_alert_enabled)}
                            placeholder="Ajouter une note CRM..."
                            className="w-full bg-transparent text-xs text-slate-400 placeholder:text-slate-600 border-none outline-none focus:text-white transition-colors"
                          />
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-800 pt-2 md:pt-0">
                          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                            <Bell size={12} className={resto.is_retention_alert_enabled ? "text-blue-500" : "text-slate-600"} />
                            <input
                              type="number"
                              defaultValue={resto.alert_threshold_days}
                              onBlur={(e) => saveSettings(resto.id, resto.internal_notes, parseInt(e.target.value || "7", 10), resto.is_retention_alert_enabled)}
                              className="w-8 bg-transparent text-xs font-bold text-center outline-none"
                            />
                            <span className="text-[9px] uppercase text-slate-600 font-bold">Jours</span>
                          </div>
                          <button
                            onClick={() => saveSettings(resto.id, resto.internal_notes, resto.alert_threshold_days, !resto.is_retention_alert_enabled)}
                            className={`w-2 h-2 rounded-full ${resto.is_retention_alert_enabled ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-slate-700"}`}
                            title="Activer/Désactiver l'alerte"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLONNE DROITE : ALERTES */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl sticky top-8">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                <AlertTriangle className="text-red-500" size={20} />
                <h3 className="font-black uppercase tracking-tight text-white">Alertes Rétention</h3>
              </div>

              <div className="space-y-3">
                {restaurants.filter(r => getAtRiskStatus(r)).length === 0 ? (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                    <CheckCircle className="text-green-500 mx-auto mb-2" size={24} />
                    <p className="text-[10px] font-black text-green-500 uppercase">Aucune Alerte</p>
                  </div>
                ) : (
                  restaurants.filter(r => getAtRiskStatus(r)).map(r => (
                    <div key={r.id} className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl flex items-center justify-between group hover:bg-red-500/10 transition-colors">
                      <div>
                        <div className="font-bold text-xs text-red-200">{r.name}</div>
                        <div className="text-[9px] text-red-400/60 font-mono">+ {r.alert_threshold_days} jours sans gagnant</div>
                      </div>
                      <button onClick={() => setSelectedBilan(r)} className="bg-red-500/20 text-red-500 p-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-all">
                        <Share2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800">
                <h4 className="text-[10px] font-black text-blue-500 uppercase mb-2">Mémo Commercial</h4>
                <div className="p-4 bg-blue-600/10 border border-blue-600/20 rounded-xl">
                  <p className="text-[10px] text-blue-200 leading-relaxed italic">
                    "Un client à risque est une opportunité de reconnexion. Appelle-le pour lui proposer une nouvelle campagne !"
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
