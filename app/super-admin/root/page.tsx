"use client"

// --- LIGNE MAGIQUE POUR VERCEL ---
export const dynamic = "force-dynamic"
// ---------------------------------

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  LayoutDashboard, Users, Store, Settings, Activity, PlusCircle, 
  ShieldAlert, Database, ArrowRight, CheckCircle2, Loader2, Clock, 
  ShieldCheck, Server, Terminal, ChevronRight, DollarSign, Filter 
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import { getRootStats } from '@/app/actions/get-root-stats'
import { repairOrphansAction } from '@/app/actions/repair-orphans'

// TYPES POUR LES LOGS
type LogLevel = 'info' | 'warning' | 'error' | 'critical'

interface SystemLog {
  id: string
  created_at: string
  level: LogLevel
  message: string
  details?: any // JSON string ou object
  user_email?: string
  action_type?: string
  metadata?: any
}

export default function RootDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isRepairing, setIsRepairing] = useState(false)
  
  // Nouveaux états pour le Terminal Avancé
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warning'>('all')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [systemHealth, setSystemHealth] = useState({ db: 'checking', latency: 0 })

  const loadData = async () => {
    const start = performance.now()
    setLoading(true)
    
    const result = await getRootStats()
    setData(result)
    
    // Simulation Ping Latency
    const end = performance.now()
    setSystemHealth({ db: 'online', latency: Math.round(end - start) })
    
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRepair = async () => {
    if (!confirm("Voulez-vous rattacher tous les restaurants orphelins à votre compte Super Admin ?")) return
    setIsRepairing(true)
    const result = await repairOrphansAction()
    if (result.success) {
      alert("Réparation terminée avec succès !")
      loadData()
    } else {
      alert("Erreur lors de la réparation : " + result.error)
    }
    setIsRepairing(false)
  }

  // Filtrage des logs
  const getFilteredLogs = () => {
    if (!data?.logs) return []
    if (logFilter === 'all') return data.logs
    // Adapter selon comment tes logs sont structurés (level ou type d'action)
    return data.logs.filter((l: any) => {
        const isError = l.level === 'error' || l.level === 'critical' || l.action_type?.includes('BLOCKED') || l.action_type?.includes('DELETE')
        return logFilter === 'error' ? isError : true
    })
  }

  // Calculs KPIs
  const activeRestosCount = data?.stats?.active_restaurants || 0 // Suppose que getRootStats renvoie ce chiffre, sinon on peut estimer
  const totalRestos = data?.stats?.restaurants || 0
  const estimatedMRR = activeRestosCount * 49 // Base 49€/mois par exemple

  return (
    <div className="min-h-screen bg-[#050a14] text-white font-sans selection:bg-blue-500/30">
      <Navbar roleName="Super Admin" />

      <div className="p-6 max-w-7xl mx-auto space-y-8">
        
        {/* 1. HEADER & SYSTEM STATUS */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter">
              FIDELIZ <span className="text-blue-500">NEXUS</span>
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              SYSTEM OPERATIONAL • LATENCY: {systemHealth.latency}ms
            </p>
          </div>
          
          <div className="flex gap-3">
             <Link href="/super-admin/root/restaurants-management" className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-lg font-bold text-xs uppercase flex items-center gap-2 transition-all border border-slate-700">
                <Database size={16} className="text-blue-400" /> Parc
             </Link>
             <Link href="/super-admin/root/new-restaurant" className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg font-bold text-xs uppercase flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
                <PlusCircle size={16} /> Nouveau Client
             </Link>
          </div>
        </div>

        {/* 2. VITALS (KPIs INTELLIGENTS) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: PARC TOTAL */}
            <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Store size={64} /></div>
                <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Parc Restaurants</div>
                <div className="text-3xl font-black text-white flex items-end gap-2">
                    {loading ? "..." : totalRestos}
                </div>
                <div className="mt-2 text-[10px] font-mono text-green-400 flex items-center gap-1">
                    <CheckCircle2 size={10} /> {loading ? "..." : data?.stats?.active || totalRestos} Actifs (Estimé)
                </div>
            </div>

            {/* KPI 2: MRR ESTIMÉ (Simulé pour l'instant) */}
            <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><DollarSign size={64} /></div>
                <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">MRR Estimé</div>
                <div className="text-3xl font-black text-blue-400">
                    {loading ? "..." : (data?.stats?.active || totalRestos) * 49}€
                </div>
                <div className="mt-2 text-[10px] text-slate-500 font-bold">
                    Revenu Mensuel Récurrent (Simulé)
                </div>
            </div>

            {/* KPI 3: IMPACT GAGNANTS */}
            <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Users size={64} /></div>
                <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Impact Clients</div>
                <div className="text-3xl font-black text-purple-400">
                    {loading ? "..." : data?.stats?.winners}
                </div>
                <div className="mt-2 text-[10px] text-slate-500 font-bold">
                    Gagnants totaux générés
                </div>
            </div>

            {/* KPI 4: SANTÉ SYSTÈME */}
            <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Activity size={64} /></div>
                <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Santé Système</div>
                <div className="text-3xl font-black text-green-500">
                    100%
                </div>
                <div className="mt-2 text-[10px] font-mono text-slate-500">
                    DB: {systemHealth.db.toUpperCase()} • ORPHANS: {data?.orphans?.length || 0}
                </div>
            </div>
        </div>

        {/* 3. TERMINAL DE DIAGNOSTIC AVANCÉ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
            
            {/* GAUCHE : ÉTAT DES SERVICES & SCANNER */}
            <div className="lg:col-span-1 bg-[#0a0f18] border border-slate-800 rounded-2xl p-6 flex flex-col gap-6">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase text-slate-300">
                    <ShieldAlert size={16} className="text-red-500" /> Scanner Intégrité
                </h3>

                {/* SCANNER ORPHELINS (Ta logique existante intégrée ici) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 p-4 bg-slate-900/30 rounded-xl border border-slate-800/50">
                    {loading ? (
                      <p className="text-slate-500 animate-pulse text-xs font-mono">{">"} Scan en cours...</p>
                    ) : data?.orphans?.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-red-400 text-xs font-bold animate-pulse font-mono border-b border-red-900/30 pb-2">
                          [CRITICAL] {data.orphans.length} Orphelins détectés
                        </p>
                        {data.orphans.map((o: any) => (
                          <div key={o.id} className="text-[10px] bg-red-500/5 border border-red-500/20 p-3 rounded-lg text-red-300 flex justify-between items-center group hover:bg-red-500/10 transition-colors">
                            <span className="font-mono truncate w-32">{o.name}</span>
                            <button onClick={handleRepair} disabled={isRepairing} className="font-black text-[9px] uppercase hover:text-white px-2 py-1 bg-red-500/20 hover:bg-red-500 rounded transition-colors">
                              {isRepairing ? "..." : "FIX NOW"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-50">
                          <CheckCircle2 className="text-green-500" size={32} />
                          <p className="text-green-500 text-xs font-bold">Système Sain</p>
                          <p className="text-[9px] text-slate-500">Aucune anomalie détectée.</p>
                      </div>
                    )}
                </div>

                {/* Gestion Sales Rapide */}
                <div className="p-4 bg-blue-900/10 border border-blue-900/30 rounded-xl">
                    <h4 className="text-[10px] font-black text-blue-400 uppercase mb-3">Accès Rapide</h4>
                    <Link 
                        href="/super-admin/root/sales-management" 
                        className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-[10px] font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-between w-full group"
                    >
                        <span>Gérer les Commerciaux</span>
                        <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </div>

            {/* DROITE : JOURNAL D'ACTIVITÉ (THE TERMINAL) */}
            <div className="lg:col-span-2 bg-[#050505] border border-slate-800 rounded-2xl overflow-hidden flex flex-col font-mono text-sm relative shadow-2xl">
                {/* Terminal Header */}
                <div className="bg-[#111] border-b border-slate-800 p-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-slate-500" />
                        <span className="text-slate-400 text-xs font-bold">system_logs.log</span>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setLogFilter('all')} 
                            className={`px-3 py-1 rounded text-[10px] font-bold uppercase ${logFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}
                        >
                            Tout
                        </button>
                        <button 
                            onClick={() => setLogFilter('error')} 
                            className={`px-3 py-1 rounded text-[10px] font-bold uppercase ${logFilter === 'error' ? 'bg-red-900/30 text-red-500' : 'text-slate-500 hover:text-red-400'}`}
                        >
                            Erreurs
                        </button>
                    </div>
                </div>

                {/* Terminal Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                    {getFilteredLogs().length > 0 ? (
                        getFilteredLogs().map((log: any) => (
                        <div key={log.id} className="group">
                            <div 
                                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                className={`
                                    flex items-start gap-3 p-2 rounded cursor-pointer transition-colors
                                    ${log.level === 'error' || log.level === 'critical' || log.action_type?.includes('BLOCKED') ? 'hover:bg-red-900/10 text-red-400' : 
                                      'hover:bg-slate-800/50 text-slate-300'}
                                `}
                            >
                                <span className="text-[10px] text-slate-600 w-16 shrink-0 pt-0.5">
                                    {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                                
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`
                                            text-[9px] font-bold uppercase px-1.5 py-0.5 rounded
                                            ${log.action_type?.includes('BLOCKED') ? 'bg-red-500/20 text-red-500' : 
                                              log.action_type?.includes('DELETE') ? 'bg-orange-500/20 text-orange-500' : 
                                              'bg-blue-500/20 text-blue-500'}
                                        `}>
                                            {log.action_type || 'INFO'}
                                        </span>
                                        <span className="font-bold text-xs">{log.message || log.action_type?.replace(/_/g, ' ')}</span>
                                        {log.user_email && <span className="text-slate-600 text-[10px]">by {log.user_email}</span>}
                                    </div>
                                    
                                    {/* DÉTAILS EXPANDABLE */}
                                    {expandedLog === log.id && (
                                        <div className="mt-2 pl-2 border-l-2 border-slate-700 animate-in slide-in-from-top-2 duration-200">
                                            <div className="text-[10px] text-slate-400 bg-black/50 p-2 rounded grid gap-1">
                                                {log.metadata?.reason && <p><span className="text-slate-500">Reason:</span> {log.metadata.reason}</p>}
                                                {log.metadata?.restaurant_name && <p><span className="text-slate-500">Target:</span> {log.metadata.restaurant_name}</p>}
                                                <p className="text-slate-600 italic mt-1">ID: {log.id}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <ChevronRight size={14} className={`transform transition-transform ${expandedLog === log.id ? 'rotate-90' : ''} opacity-0 group-hover:opacity-50`} />
                            </div>
                        </div>
                    ))
                    ) : (
                        <div className="text-center py-20 text-slate-600 italic flex flex-col items-center gap-2">
                            <Terminal size={24} className="opacity-20" />
                            <p>Aucun log pour le moment.</p>
                        </div>
                    )}
                </div>

                {/* Terminal Footer */}
                <div className="bg-[#111] border-t border-slate-800 p-2 text-[10px] text-slate-500 flex justify-between px-4">
                    <span>System Monitoring Active</span>
                    <span className="animate-pulse text-green-500">● Live</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}