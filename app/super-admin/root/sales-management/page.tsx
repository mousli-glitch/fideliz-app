"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { Users, UserPlus, Shield, Activity, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function SalesManagement() {
  const [salesUsers, setSalesUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadSales() {
      // On récupère les profils qui ont le rôle 'sales'
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'sales')
      
      setSalesUsers(data || [])
      setLoading(false)
    }
    loadSales()
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Navbar roleName="Super Admin" />
      
      <div className="p-8 max-w-6xl mx-auto">
        <Link href="/super-admin/root" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors">
          <ArrowLeft size={20} /> Retour au Dashboard
        </Link>

        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black italic">GÉRER LES <span className="text-blue-500">COMMERCIAUX</span></h1>
            <p className="text-slate-400 text-xs uppercase font-bold tracking-widest mt-1">Équipe de vente Fideliz</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
            <UserPlus size={20} /> Nouveau Commercial
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {salesUsers.map((sales) => (
            <div key={sales.id} className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl flex items-center justify-between hover:border-blue-500/50 transition-all">
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/10 p-4 rounded-2xl text-blue-500">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{sales.email}</h3>
                  <p className="text-slate-500 text-xs font-mono">ID: {sales.id}</p>
                </div>
              </div>
              
              <div className="flex gap-8 items-center">
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-black">Statut</p>
                  <span className="text-green-500 text-sm font-bold">ACTIF</span>
                </div>
                <button className="text-slate-400 hover:text-white transition-colors">
                  <Activity size={20} />
                </button>
              </div>
            </div>
          ))}
          
          {salesUsers.length === 0 && (
            <div className="text-center py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <p className="text-slate-500 italic">Aucun commercial recruté pour le moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}