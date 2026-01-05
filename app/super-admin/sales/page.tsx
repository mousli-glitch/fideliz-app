"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { Users, Store, PlusCircle, TrendingUp, LayoutDashboard, Loader2 } from 'lucide-react'

export default function SalesDashboard() {
  const [stats, setStats] = useState({ restaurants: 0 })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadSalesData() {
      // On récupère le nombre de restaurants pour donner une info au commercial
      const { count } = await supabase
        .from('restaurants')
        .select('*', { count: 'exact', head: true })
      
      setStats({ restaurants: count || 0 })
      setLoading(false)
    }
    loadSalesData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f18] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] text-white p-8 font-sans">
      {/* Header spécifique au Commercial */}
      <div className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            FIDELIZ <span className="text-blue-500">SALES</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-[0.2em]">
            Espace Partenaire Commercial
          </p>
        </div>
        
        {/* Le commercial peut créer un restaurant lui aussi */}
        <Link 
          href="/super-admin/root/new-restaurant" 
          className="bg-blue-600 hover:bg-blue-700 px-6 py-4 rounded-2xl font-black flex items-center gap-3 transition-all shadow-lg shadow-blue-900/20"
        >
          <PlusCircle size={20} /> Nouveau Client
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Carte : Nombre de restaurants au total */}
        <div className="bg-[#111827] border border-slate-800 rounded-[32px] p-8">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
                <Store className="text-blue-500" />
            </div>
          </div>
          <div className="text-5xl font-black mb-2">{stats.restaurants}</div>
          <div className="text-slate-500 font-bold text-sm uppercase tracking-widest">
            Restaurants sur la plateforme
          </div>
        </div>

        {/* Carte : Objectifs (Visuel uniquement pour l'instant) */}
        <div className="bg-[#111827] border border-slate-800 rounded-[32px] p-8 flex flex-col justify-center items-center text-center">
          <TrendingUp className="text-slate-700 mb-4" size={48} />
          <p className="text-slate-500 italic text-sm">
            Statistiques de commissions et objectifs de vente bientôt disponibles.
          </p>
        </div>
      </div>

      {/* Section Outils rapides */}
      <div className="bg-[#111827] border border-slate-800 rounded-[40px] p-10">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
          <LayoutDashboard className="text-blue-500" size={24} /> 
          Outils Commerciaux
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-6 bg-[#0a0f18] border border-slate-800 rounded-2xl text-left">
            <h3 className="font-bold mb-1 text-white">Suivi des activations</h3>
            <p className="text-sm text-slate-500">Vérifiez si vos clients ont bien activé leur QR Code.</p>
          </div>
          <div className="p-6 bg-[#0a0f18] border border-slate-800 rounded-2xl text-left opacity-50">
            <h3 className="font-bold mb-1 text-white">Matériel Marketing</h3>
            <p className="text-sm text-slate-500 text-xs">Bientôt : Téléchargez les flyers et visuels Fideliz.</p>
          </div>
        </div>
      </div>
    </div>
  )
}