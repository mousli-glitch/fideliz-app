"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LayoutDashboard, Users, Store, Settings, Activity, PlusCircle, ShieldAlert, Database, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { getRootStats } from '@/app/actions/get-root-stats'
import { repairOrphansAction } from '@/app/actions/repair-orphans' // Import de la nouvelle action

export default function RootDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isRepairing, setIsRepairing] = useState(false) // Pour l'état de chargement du bouton

  const loadData = async () => {
    setLoading(true)
    const result = await getRootStats()
    setData(result)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Fonction de réparation
  const handleRepair = async () => {
    if (!confirm("Voulez-vous rattacher tous les restaurants orphelins à votre compte Super Admin ?")) return
    
    setIsRepairing(true)
    const result = await repairOrphansAction()
    
    if (result.success) {
      alert("Réparation terminée avec succès !")
      loadData() // On rafraîchit les stats
    } else {
      alert("Erreur lors de la réparation : " + result.error)
    }
    setIsRepairing(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Navbar roleName="Super Admin" />

      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight">FIDELIZ <span className="text-blue-500">ROOT</span></h1>
            <p className="text-slate-400 mt-1 uppercase text-xs font-bold tracking-widest">Contrôle Total Système</p>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <Link 
              href="/super-admin/root/restaurants-management" 
              className="bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all text-white border border-slate-700"
            >
              <Database size={20} className="text-blue-400" /> Gestion du Parc
            </Link>
            <Link 
              href="/super-admin/root/new-restaurant" 
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all text-white shadow-lg shadow-blue-900/20"
            >
              <PlusCircle size={20} /> Nouveau Restaurant
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard title="Restaurants" value={data?.stats.restaurants} loading={loading} icon={<Store className="text-blue-400" />} color="bg-blue-500/10" />
          <StatCard title="CRM Global" value={data?.stats.contacts} loading={loading} icon={<Users className="text-orange-400" />} color="bg-orange-500/10" />
          <StatCard title="Gagnants" value={data?.stats.winners} loading={loading} icon={<Activity className="text-green-400" />} color="bg-green-500/10" />
          <StatCard title="Utilisateurs" value={data?.stats.users} loading={loading} icon={<Users className="text-purple-400" />} color="bg-purple-500/10" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="bg-slate-950 border-2 border-slate-800 rounded-3xl overflow-hidden flex flex-col">
            <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-500" /> Terminal de Diagnostic
              </h2>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50"></div>
              </div>
            </div>
            
            <div className="p-6 space-y-4 font-mono">
              {loading ? (
                <p className="text-slate-500 animate-pulse text-xs">{">"} Initialisation du scan...</p>
              ) : data?.orphans.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-red-400 text-xs font-bold animate-pulse uppercase">
                    [CRITICAL] {data.orphans.length} Restaurateur(s) sans propriétaire détectés
                  </p>
                  {data.orphans.map((o: any) => (
                    <div key={o.id} className="text-[10px] bg-red-500/5 border border-red-500/20 p-2 rounded text-red-300 flex justify-between items-center">
                      <span>ID: {o.slug} ({o.name})</span>
                      <button 
                        onClick={handleRepair}
                        disabled={isRepairing}
                        className="font-black underline uppercase hover:text-white transition-colors disabled:opacity-50"
                      >
                        {isRepairing ? "Réparation..." : "RÉPARER"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-green-500 text-xs font-bold">
                  <CheckCircle2 size={16} />
                  <span>AUCUNE ERREUR D'INTÉGRITÉ DÉTECTÉE</span>
                </div>
              )}
              <div className="pt-4 border-t border-slate-900 mt-4">
                 <p className="text-slate-600 text-[10px]">Dernier scan : {new Date().toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-3xl p-8 flex flex-col items-center text-center">
              <div className="p-4 bg-blue-500/20 rounded-2xl mb-4">
                <Users className="text-blue-500" size={32} />
              </div>
              <h3 className="text-slate-200 font-bold mb-1 text-lg">Gestion Commerciale (Sales)</h3>
              <p className="text-slate-400 mb-6 text-sm">Contrôlez les accès et suivez les performances de l'équipe.</p>
              <Link 
                href="/super-admin/root/sales-management" 
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl font-bold transition-all w-full flex justify-center items-center gap-2"
              >
                Gérer les Sales <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color, loading }: { title: string, value: any, icon: any, color: string, loading: boolean }) {
  return (
    <div className={`${color} border border-white/5 rounded-3xl p-8 transition-all hover:border-white/10`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-900/50 rounded-xl">{icon}</div>
      </div>
      <div className="text-4xl font-black mb-1 tabular-nums">
        {loading ? "..." : value}
      </div>
      <div className="text-slate-400 font-bold text-xs uppercase tracking-widest">{title}</div>
    </div>
  )
}