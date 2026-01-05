"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { Users, UserPlus, Shield, Activity, ArrowLeft, X, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function SalesManagement() {
  const [salesUsers, setSalesUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const supabase = createClient()

  async function loadSales() {
    setLoading(true)
    // Utilisation de select('*') sur un type générique pour éviter les erreurs de lecture
    const { data } = await supabase
      .from('profiles' as any)
      .select('*')
      .eq('role', 'sales')
    
    setSalesUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadSales()
  }, [])

  const handleCreateSales = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      alert("Erreur lors de l'inscription : " + authError.message)
      setIsCreating(false)
      return
    }

    if (authData.user) {
      // SOLUTION DÉFINITIVE : On utilise une requête brute via rpc ou une assertion de type totale
      // On passe par une variable intermédiaire pour casser la chaîne de typage stricte de Supabase
      const query: any = supabase.from('profiles' as any)
      
      const { error: profileError } = await query
        .update({ role: 'sales' })
        .eq('id', authData.user.id)

      if (profileError) {
        alert("Erreur lors de l'attribution du rôle : " + profileError.message)
      } else {
        alert("Commercial créé avec succès !")
        setEmail('')
        setPassword('')
        setShowForm(false)
        loadSales()
      }
    }
    setIsCreating(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Navbar roleName="Super Admin" />
      
      <div className="p-8 max-w-6xl mx-auto">
        <Link href="/super-admin/root" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-sm font-bold uppercase tracking-widest">
          <ArrowLeft size={18} /> Retour au Dashboard
        </Link>

        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">Équipe <span className="text-blue-500">Commerciale</span></h1>
            <p className="text-slate-400 text-[10px] uppercase font-black tracking-[0.2em] mt-1">Gestion des accès et performances</p>
          </div>
          <button 
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
          >
            <UserPlus size={20} /> Nouveau Commercial
          </button>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] max-w-md w-full shadow-2xl relative">
              <button 
                onClick={() => setShowForm(false)} 
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              
              <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
                <UserPlus className="text-blue-500" /> Ajouter un commercial
              </h2>
              
              <form onSubmit={handleCreateSales} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Email professionnel</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 mt-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600 font-medium text-white"
                    placeholder="ex: commercial@fideliz.fr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Mot de passe provisoire</label>
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 mt-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600 text-white"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  disabled={isCreating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl mt-4 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-900/20 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="animate-spin" /> : "CRÉER LE COMPTE SALES"}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
          ) : salesUsers.map((sales) => (
            <div key={sales.id} className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl flex items-center justify-between hover:border-blue-500/50 transition-all group">
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/10 p-4 rounded-2xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{sales.email}</h3>
                  <p className="text-slate-500 text-[10px] font-mono uppercase tracking-tighter text-white">ID: {sales.id}</p>
                </div>
              </div>
              
              <div className="flex gap-8 items-center">
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Statut</p>
                  <span className="text-green-500 text-sm font-bold italic uppercase tracking-wide">Actif</span>
                </div>
                <div className="h-10 w-px bg-slate-700 mx-2 hidden md:block"></div>
                <button className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg hidden md:block">
                  <Activity size={20} />
                </button>
              </div>
            </div>
          ))}
          
          {!loading && salesUsers.length === 0 && (
            <div className="text-center py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <p className="text-slate-500 italic font-medium">Aucun commercial recruté pour le moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}