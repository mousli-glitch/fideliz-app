"use client"

// --- LIGNE MAGIQUE POUR VERCEL ---
export const dynamic = "force-dynamic"
// ---------------------------------

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Users,
  Store,
  Activity,
  PlusCircle,
  ShieldAlert,
  Database,
  CheckCircle2,
  Terminal,
  ChevronRight,
  DollarSign,
} from "lucide-react"
import Navbar from "@/components/Navbar"
import { getRootStats } from "@/app/actions/get-root-stats"
import { repairOrphansAction } from "@/app/actions/repair-orphans"
import { createClient } from "@/utils/supabase/client"

// TYPES POUR LES LOGS
type LogLevel = "info" | "warning" | "error" | "critical"

// ✅ MICRO-OPTIMISATION : labels humains pour action_type
const ACTION_LABELS: Record<string, string> = {
  RESTAURANT_BLOCKED: "Restaurant bloqué",
  RESTAURANT_UNBLOCKED: "Restaurant débloqué",
  USER_DISABLED: "Utilisateur désactivé",
  USER_ENABLED: "Utilisateur réactivé",

  // Optionnels (si tu les ajoutes plus tard)
  GAME_CREATED: "Jeu créé",
  GAME_ACTIVATED: "Jeu activé",
  GAME_DEACTIVATED: "Jeu désactivé",
  WIN_REDEEMED: "Gain validé",
  SECURITY_ALERT: "Alerte sécurité",
  SYSTEM: "Système",
  INFO: "Information",
}

// ✅ transforme "RESTAURANT_BLOCKED" -> "Restaurant blocked" si pas dans le mapping
const fallbackLabel = (actionType?: string) => {
  if (!actionType) return "Information"
  const cleaned = actionType.replace(/_/g, " ").toLowerCase()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

// ✅ ligne lisible (sans exposer des trucs chelous au client)
const humanizeLogLine = (log: any) => {
  const actionType = log?.action_type || "INFO"
  const label = ACTION_LABELS[actionType] || fallbackLabel(actionType)

  const restoName =
    log?.metadata?.restaurant_name ||
    log?.metadata?.resto_name ||
    log?.metadata?.restaurant ||
    null

  const reason =
    log?.metadata?.reason ||
    log?.metadata?.blocked_reason ||
    log?.metadata?.details ||
    null

  const baseMessage = log?.message || "Mise à jour effectuée"

  // priorité : raison > message
  const detail = reason ? String(reason) : String(baseMessage)

  // format final : "[Label] Restaurant — détail"
  return {
    label,
    title: restoName ? `${restoName} — ${detail}` : detail,
  }
}

export default function RootDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isRepairing, setIsRepairing] = useState(false)

  // États pour le Terminal Avancé
  const [logFilter, setLogFilter] = useState<"all" | "error" | "warning">("all")
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [systemHealth, setSystemHealth] = useState({ db: "checking", latency: 0 })

  const supabase = createClient()

  const loadData = async () => {
    const start = performance.now()
    setLoading(true)

    const result = await getRootStats()
    setData(result)

    const end = performance.now()
    setSystemHealth({ db: "online", latency: Math.round(end - start) })

    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      await loadData()
    }
    init()

    // ✅ refresh quand tu reviens sur l’onglet
    const onFocus = () => {
      loadData()
    }
    window.addEventListener("focus", onFocus)

    // ✅ realtime : dès qu’un restaurant change (block/unblock)
    const channel = supabase
      .channel("root-restaurants-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      window.removeEventListener("focus", onFocus)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const getFilteredLogs = () => {
    if (!data?.logs) return []

    let filtered = data.logs

    if (logFilter !== "all") {
      filtered = data.logs.filter((l: any) => {
        const isError =
          l.level === "error" ||
          l.level === "critical" ||
          l.action_type?.includes("BLOCKED") ||
          l.action_type?.includes("DELETE")
        return logFilter === "error" ? isError : true
      })
    }

    return filtered.slice(0, 100)
  }

  const totalRestos = data?.stats?.restaurants || 0
  const blockedCount = (data?.blocked_count ?? data?.stats?.blocked ?? 0) as number
  const activeCountEstimated = Math.max(0, totalRestos - blockedCount)

  return (
    <div className="min-h-screen bg-[#050a14] text-white font-sans selection:bg-blue-500/30">
      <Navbar roleName="Super Admin" />

      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* 1. HEADER & ACTIONS */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter">
              FIDELIZ <span className="text-blue-500">ROOT</span>
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              SYSTEM OPERATIONAL • LATENCY: {systemHealth.latency}ms
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/super-admin/root/sales-management"
              className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-lg font-bold text-xs uppercase flex items-center gap-2 transition-all border border-slate-700 hover:text-white text-slate-300"
            >
              <Users size={16} className="text-purple-400" /> Commerciaux
            </Link>

            <Link
              href="/super-admin/root/restaurants-management"
              className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-lg font-bold text-xs uppercase flex items-center gap-2 transition-all border border-slate-700 text-slate-300 hover:text-white"
            >
              <Database size={16} className="text-blue-400" /> Parc
            </Link>

            <Link
              href="/super-admin/root/new-restaurant"
              className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg font-bold text-xs uppercase flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
            >
              <PlusCircle size={16} /> Nouveau Client
            </Link>
          </div>
        </div>

        {/* 2. VITALS (KPIs) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* KPI 1: PARC TOTAL */}
          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Store size={64} />
            </div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">
              Parc Restaurants
            </div>
            <div className="text-3xl font-black text-white flex items-end gap-2">
              {loading ? "..." : totalRestos}
            </div>
            <div className="mt-2 text-[10px] font-mono text-green-400 flex items-center gap-1">
              <CheckCircle2 size={10} /> {loading ? "..." : activeCountEstimated} Actifs (Estimé)
            </div>
          </div>

          {/* KPI 2: MRR ESTIMÉ */}
          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign size={64} />
            </div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">MRR Estimé</div>
            <div className="text-3xl font-black text-blue-400">
              {loading ? "..." : activeCountEstimated * 49}€
            </div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold">Revenu Mensuel Récurrent (Simulé)</div>
          </div>

          {/* KPI 3: IMPACT GAGNANTS */}
          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users size={64} />
            </div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Impact Clients</div>
            <div className="text-3xl font-black text-purple-400">{loading ? "..." : data?.stats?.winners}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold">Gagnants totaux générés</div>
          </div>

          {/* KPI 4: SANTÉ SYSTÈME */}
          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity size={64} />
            </div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Santé Système</div>
            <div className="text-3xl font-black text-green-500">100%</div>
            <div className="mt-2 text-[10px] font-mono text-slate-500">
              DB: {systemHealth.db.toUpperCase()} • ORPHANS: {data?.orphans?.length || 0}
            </div>
          </div>

          {/* KPI 5: RESTOS BLOQUÉS */}
          <div className="bg-[#0f172a] border border-slate-800 p-5 rounded-2xl relative overflow-hidden group">
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Restaurants Bloqués</div>
            <div className="text-3xl font-black text-red-500">{loading ? "..." : blockedCount}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold">Source: restaurants.is_blocked</div>
          </div>
        </div>

        {/* 3. TERMINAL & SCANNER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
          {/* GAUCHE : SCANNER INTÉGRITÉ */}
          <div className="lg:col-span-1 bg-[#0a0f18] border border-slate-800 rounded-2xl p-6 flex flex-col gap-6">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase text-slate-300">
              <ShieldAlert size={16} className="text-red-500" /> Scanner Intégrité
            </h3>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 p-4 bg-slate-900/30 rounded-xl border border-slate-800/50">
              {loading ? (
                <p className="text-slate-500 animate-pulse text-xs font-mono">{">"} Scan en cours...</p>
              ) : data?.orphans?.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-red-400 text-xs font-bold animate-pulse font-mono border-b border-red-900/30 pb-2">
                    [CRITICAL] {data.orphans.length} Orphelins détectés
                  </p>
                  {data.orphans.map((o: any) => (
                    <div
                      key={o.id}
                      className="text-[10px] bg-red-500/5 border border-red-500/20 p-3 rounded-lg text-red-300 flex justify-between items-center group hover:bg-red-500/10 transition-colors"
                    >
                      <span className="font-mono truncate w-32">{o.name}</span>
                      <button
                        onClick={handleRepair}
                        disabled={isRepairing}
                        className="font-black text-[9px] uppercase hover:text-white px-2 py-1 bg-red-500/20 hover:bg-red-500 rounded transition-colors"
                      >
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
          </div>

          {/* DROITE : JOURNAL (TERMINAL) */}
          <div className="lg:col-span-2 bg-[#050505] border border-slate-800 rounded-2xl overflow-hidden flex flex-col font-mono text-sm relative shadow-2xl">
            <div className="bg-[#111] border-b border-slate-800 p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-slate-500" />
                <span className="text-slate-400 text-xs font-bold">system_logs.log</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLogFilter("all")}
                  className={`px-3 py-1 rounded text-[10px] font-bold uppercase ${
                    logFilter === "all" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"
                  }`}
                >
                  Tout
                </button>
                <button
                  onClick={() => setLogFilter("error")}
                  className={`px-3 py-1 rounded text-[10px] font-bold uppercase ${
                    logFilter === "error"
                      ? "bg-red-900/30 text-red-500"
                      : "text-slate-500 hover:text-red-400"
                  }`}
                >
                  Erreurs
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
              {getFilteredLogs().length > 0 ? (
                getFilteredLogs().map((log: any) => {
                  const human = humanizeLogLine(log)

                  return (
                    <div key={log.id} className="group">
                      <div
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        className={`
                          flex items-center gap-4 p-2 rounded cursor-pointer transition-colors
                          ${
                            log.level === "error" ||
                            log.level === "critical" ||
                            log.action_type?.includes("BLOCKED")
                              ? "hover:bg-red-900/10 text-red-400"
                              : "hover:bg-slate-800/50 text-slate-300"
                          }
                        `}
                      >
                        <span className="text-[10px] text-slate-600 w-12 shrink-0">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>

                        {/* ✅ Badge basé sur action_type, mais affiché “humain” */}
                        <span
                          className={`
                            text-[9px] font-bold uppercase px-2 py-1 rounded w-32 text-center shrink-0
                            ${
                              log.action_type?.includes("BLOCKED")
                                ? "bg-red-500/20 text-red-500"
                                : log.action_type?.includes("DELETE")
                                ? "bg-orange-500/20 text-orange-500"
                                : "bg-blue-500/20 text-blue-500"
                            }
                          `}
                          title={log.action_type || "INFO"}
                        >
                          {human.label}
                        </span>

                        {/* ✅ Ligne lisible, unique, orientée “action” */}
                        <div className="flex-1 truncate">
                          <span className="font-bold text-xs text-white">{human.title}</span>
                        </div>

                        {log.user_email && (
                          <span className="text-slate-600 text-[10px] truncate w-32 text-right">
                            by {log.user_email.split("@")[0]}
                          </span>
                        )}

                        <ChevronRight
                          size={14}
                          className={`transform transition-transform ${
                            expandedLog === log.id ? "rotate-90" : ""
                          } opacity-0 group-hover:opacity-50`}
                        />
                      </div>

                      {expandedLog === log.id && (
                        <div className="mt-1 ml-16 mb-2 pl-2 border-l-2 border-slate-700 animate-in slide-in-from-top-2 duration-200">
                          <div className="text-[10px] text-slate-400 bg-black/50 p-2 rounded grid gap-1">
                            <p>
                              <span className="text-slate-500">Action:</span> {log.action_type || "INFO"} (
                              {human.label})
                            </p>
                            <p>
                              <span className="text-slate-500">Message:</span> {log.message || "-"}
                            </p>
                            {log.metadata && (
                              <pre className="text-blue-400 mt-1">{JSON.stringify(log.metadata, null, 2)}</pre>
                            )}
                            <p className="text-slate-600 italic mt-1">ID: {log.id}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-20 text-slate-600 italic flex flex-col items-center gap-2">
                  <Terminal size={24} className="opacity-20" />
                  <p>Aucun log pour le moment.</p>
                </div>
              )}
            </div>

            <div className="bg-[#111] border-t border-slate-800 p-2 text-[10px] text-slate-500 flex justify-between px-4">
              <span>System Monitoring Active (Limited to 100 logs)</span>
              <span className="animate-pulse text-green-500">● Live</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
