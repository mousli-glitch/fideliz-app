"use client"

import { useEffect, useState } from "react"
import { getAdminStats } from "../actions/admin" // Import relatif
import { Loader2, Users, Gamepad2, Trophy, TrendingUp } from "lucide-react"
import Link from "next/link"

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ winners: 0, games: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await getAdminStats()
      setStats(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-400 w-8 h-8"/></div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-black text-slate-800 mb-2">Bonjour ! 👋</h1>
      <p className="text-slate-500 mb-8">Voici un aperçu de l'activité de votre restaurant.</p>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
           <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
              <Gamepad2 size={24} />
           </div>
           <div>
              <p className="text-sm text-slate-500 font-medium">Jeux Actifs</p>
              <p className="text-2xl font-black text-slate-800">{stats.games}</p>
           </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
           <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <Users size={24} />
           </div>
           <div>
              <p className="text-sm text-slate-500 font-medium">Gagnants Totaux</p>
              <p className="text-2xl font-black text-slate-800">{stats.winners}</p>
           </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
           <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <TrendingUp size={24} />
           </div>
           <div>
              <p className="text-sm text-slate-500 font-medium">Conversion</p>
              <p className="text-2xl font-black text-slate-800">- %</p>
           </div>
        </div>

      </div>

      {/* RACCOURCIS RAPIDES */}
      <h2 className="text-xl font-bold text-slate-800 mb-4">Actions Rapides</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         
         <Link href="/admin/games/new" className="group bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all">
            <Gamepad2 className="mb-4 text-slate-400 group-hover:text-white transition-colors" size={32} />
            <h3 className="font-bold text-lg">Créer un nouveau jeu</h3>
            <p className="text-slate-400 text-sm mt-1">Lancer une campagne Google ou Insta</p>
         </Link>

         <Link href="/admin/scan" className="group bg-white border border-slate-200 p-6 rounded-2xl hover:border-blue-500 transition-all">
             <div className="flex justify-between items-start mb-4">
                <Trophy size={32} className="text-slate-300 group-hover:text-blue-500 transition-colors"/>
                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full">STAFF</span>
             </div>
             <h3 className="font-bold text-lg text-slate-800">Scanner un lot</h3>
             <p className="text-slate-500 text-sm mt-1">Valider le gain d'un client en caisse</p>
         </Link>

      </div>
    </div>
  )
}