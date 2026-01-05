"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Store, PlusCircle } from 'lucide-react'
import Link from 'next/link'

export default function SalesDashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      
      // SÉCURITÉ : Si pas d'utilisateur, on dégage et on ARRÊTE le script
      if (!user) {
        router.push('/login')
        return 
      }
      
      // Ici, on est sûr que user existe
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id) // Plus d'erreur rouge ici
        .single() as any
        
      setProfile(data)
      setLoading(false)
    }
    getUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Chargement...</div>

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-12 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black italic">ESPACE <span className="text-blue-500">COMMERCIAL</span></h1>
          <p className="text-slate-500 text-sm mt-1">
             Bienvenue, {profile?.email}
          </p>
        </div>
        <button 
          onClick={handleLogout}
          className="bg-slate-900 border border-slate-800 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500 text-slate-400 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
        >
          <LogOut size={16} /> DÉCONNEXION
        </button>
      </div>

      {/* DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        
        {/* CARTE D'ACTION : Nouveau Restaurant */}
        <Link href="/super-admin/sales/new-restaurant" className="group bg-blue-600 hover:bg-blue-500 p-8 rounded-3xl transition-all shadow-xl shadow-blue-900/20 flex flex-col items-center text-center justify-center min-h-[200px]">
          <div className="bg-white/20 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
            <PlusCircle size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">AJOUTER UN RESTAURANT</h2>
          <p className="text-blue-100 text-sm font-medium">Inscrire un nouveau client Fideliz</p>
        </Link>

        {/* CARTE INFO : Mes Performances */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col items-center text-center justify-center min-h-[200px]">
          <div className="bg-slate-800 p-4 rounded-full mb-4">
            <Store size={32} className="text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-300 mb-2">MES CLIENTS</h2>
          <p className="text-slate-500 text-sm">Liste des restaurants recrutés (Bientôt disponible)</p>
        </div>

      </div>
    </div>
  )
}