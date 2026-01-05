"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { Store, PlusCircle, Users, ExternalLink, Loader2 } from 'lucide-react'
// IMPORTATION DE LA NAVBAR
import Navbar from '@/components/Navbar'

export default function SalesDashboard() {
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Récupérer les restos créés par ce commercial
        const { data } = await supabase
          .from('restaurants')
          .select('*, profiles(count)')
          .eq('created_by', user.id)
        
        setRestaurants(data || [])
      }
      setLoading(false)
    }
    loadData()
  }, [])

  if (loading) return <div className="min-h-screen bg-[#0a0f18] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={48} /></div>

  return (
    <div className="min-h-screen bg-[#0a0f18] text-white">
      {/* AJOUT DE LA NAVBAR ICI */}
      <Navbar roleName="Commercial" />

      {/* Contenu avec padding */}
      <div className="p-8">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black">FIDELIZ <span className="text-blue-500">SALES</span></h1>
            <p className="text-slate-500 uppercase text-xs tracking-widest mt-1">Tes Restaurants Partenaires</p>
          </div>
          <Link href="/super-admin/root/new-restaurant" className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all">
            <PlusCircle size={20} /> Nouveau Client
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[#111827] border border-slate-800 p-6 rounded-3xl text-center">
            <div className="text-4xl font-black text-blue-500 mb-1">{restaurants.length}</div>
            <div className="text-slate-500 text-xs font-bold uppercase">Restos Actifs</div>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-3xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase font-black">
              <tr>
                <th className="px-6 py-4">Nom du Restaurant</th>
                <th className="px-6 py-4">Slug (Lien)</th>
                <th className="px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {restaurants.map((resto) => (
                <tr key={resto.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-bold">{resto.name}</td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-sm">{resto.slug}</td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/${resto.slug}`} className="text-blue-500 hover:text-blue-400 flex items-center gap-1 text-sm font-bold">
                      Voir Dashboard <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {restaurants.length === 0 && (
            <div className="p-12 text-center text-slate-500 italic">Aucun restaurant pour le moment.</div>
          )}
        </div>
      </div>
    </div>
  )
}