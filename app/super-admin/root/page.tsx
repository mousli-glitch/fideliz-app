"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { LayoutDashboard, Users, Store, Settings, Activity, PlusCircle } from 'lucide-react'

export default function RootDashboard() {
  const [stats, setStats] = useState({ restaurants: 0, totalWinners: 0, totalUsers: 0 })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadStats() {
      const { count: restoCount } = await supabase.from('restaurants').select('*', { count: 'exact', head: true })
      const { count: winnersCount } = await supabase.from('winners').select('*', { count: 'exact', head: true })
      const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })

      setStats({
        restaurants: restoCount || 0,
        totalWinners: winnersCount || 0,
        totalUsers: usersCount || 0
      })
      setLoading(false)
    }
    loadStats()
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-black tracking-tight">FIDELIZ <span className="text-blue-500">ROOT</span></h1>
          <p className="text-slate-400 mt-1 uppercase text-xs font-bold tracking-widest">Contrôle Total Système</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all">
            <PlusCircle size={20} /> Nouveau Restaurant
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <StatCard title="Restaurants" value={stats.restaurants} icon={<Store className="text-blue-400" />} color="bg-blue-500/10" />
        <StatCard title="Gagnants Totaux" value={stats.totalWinners} icon={<Activity className="text-green-400" />} color="bg-green-500/10" />
        <StatCard title="Utilisateurs" value={stats.totalUsers} icon={<Users className="text-purple-400" />} color="bg-purple-500/10" />
      </div>

      {/* Section Gestion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Settings className="text-slate-400" /> Maintenance Technique
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 flex justify-between items-center">
              <span>Base de données Supabase</span>
              <span className="text-green-500 font-bold text-sm">OPÉRATIONNEL</span>
            </div>
            <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 flex justify-between items-center">
              <span>Middleware de Sécurité</span>
              <span className="text-green-500 font-bold text-sm">ACTIF</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
          <p className="text-slate-400 mb-4 italic">Bientôt disponible : Gestion des commerciaux (Sales)</p>
          <button disabled className="bg-slate-700 text-slate-500 px-6 py-3 rounded-2xl font-bold">
            Accéder à l'espace Sales
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }: { title: string, value: number, icon: any, color: string }) {
  return (
    <div className={`${color} border border-white/5 rounded-3xl p-8`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-900/50 rounded-xl">{icon}</div>
      </div>
      <div className="text-4xl font-black mb-1">{value}</div>
      <div className="text-slate-400 font-bold text-sm uppercase tracking-wider">{title}</div>
    </div>
  )
}