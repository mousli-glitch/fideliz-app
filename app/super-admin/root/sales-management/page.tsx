"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { UserPlus, Shield, Activity, ArrowLeft, X, Loader2, Power, Ban, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function SalesManagement() {
  // --- 1. LES VARIABLES D'ÉTAT ---
  const [salesUsers, setSalesUsers] = useState<any[]>([]) 
  const [loading, setLoading] = useState(true)            
  const [showForm, setShowForm] = useState(false)        
  const [email, setEmail] = useState('')                 
  const [password, setPassword] = useState('')           
  const [isCreating, setIsCreating] = useState(false)    

  const supabase = createClient()

  // --- 2. FONCTION POUR RÉCUPÉRER LA LISTE ---
  async function loadSales() {
    setLoading(true)
    // Petit délai pour la synchronisation
    await new Promise(resolve => setTimeout(resolve, 500));

    const { data } = await supabase
      .from('profiles' as any)
      .select('*')
      .eq('role', 'sales')
      .order('created_at', { ascending: false }) // Trié du plus récent au plus ancien
    
    setSalesUsers(data || [])
    setLoading(false)
  }

  // --- 3. CHARGEMENT INITIAL ---
  useEffect(() => {
    loadSales()
  }, [])

  // --- 4. LE DISJONCTEUR (Bloquer/Débloquer) ---
  const toggleStatus = async (id: string, currentStatus: boolean) => {
    // A. Mise à jour visuelle immédiate (Optimiste)
    // On suppose que ça va marcher pour que l'interface soit rapide
    setSalesUsers(salesUsers.map(user => 
      user.id === id ? { ...user, is_active: !currentStatus } : user
    ))

    // B. Envoi à Supabase
    const query: any = supabase.from('profiles' as any)
    const { error } = await query
      .update({ is_active: !currentStatus })
      .eq('id', id)

    // C. Si erreur, on annule le changement visuel
    if (error) {
      alert("Erreur lors du changement de statut")
      loadSales()
    }
  }

  // --- 5. CRÉATION DU COMMERCIAL ---
  const handleCreateSales = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      alert("Erreur : " + authError.message)
      setIsCreating(false)
      return
    }

    if (authData.user) {
      const query: any = supabase.from('profiles' as any)
      // On force le rôle sales et on active par défaut
      const { error: profileError } = await query
        .update({ role: 'sales', is_active: true }) 
        .eq('id', authData.user.id)

      if (profileError) {
        alert("Erreur role : " + profileError.message)
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
        <Link href="/super-admin/root" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-sm font-bold uppercase">
          <ArrowLeft size={18} /> Retour Dashboard
        </Link>

        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black italic uppercase">Équipe <span className="text-blue-500">Commerciale</span></h1>
            <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-1">
              {salesUsers.length} Membres recrutés
            </p>
          </div>
          <button 
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
          >
            <UserPlus size={20} /> Nouveau Commercial
          </button>
        </div>

        {/* MODAL CRÉATION */}
        {showForm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] max-w-md w-full relative shadow-2xl">
              <button onClick={() => setShowForm(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white">
                <X size={24} />
              </button>
              <h2 className="text-2xl font-black mb-6">Recruter un Talent</h2>
              <form onSubmit={handleCreateSales} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Pro</label>
                  <input 
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 mt-2 outline-none focus:ring-2 focus:ring-blue-500 text-white font-bold"
                    placeholder="email@fideliz.fr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mot de passe provisoire</label>
                  <input 
                    type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 mt-2 outline-none focus:ring-2 focus:ring-blue-500 text-white font-bold"
                    placeholder="••••••••"
                  />
                </div>
                <button disabled={isCreating} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl mt-4 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-900/20">
                  {isCreating ? <Loader2 className="animate-spin" /> : "VALIDER LE RECRUTEMENT"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* LISTE DES COMMERCIAUX AVEC DISJONCTEUR */}
        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
          ) : salesUsers.map((sales) => (
            <div key={sales.id} className={`border p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between transition-all ${sales.is_active !== false ? 'bg-slate-800/50 border-slate-700' : 'bg-red-900/10 border-red-900/30'}`}>
              
              {/* INFO GAUCHE */}
              <div className="flex items-center gap-4 w-full md:w-auto mb-4 md:mb-0">
                <div className={`p-4 rounded-2xl ${sales.is_active !== false ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'}`}>
                  {sales.is_active !== false ? <Shield size={24} /> : <Ban size={24} />}
                </div>
                <div>
                  <h3 className={`font-bold text-lg ${sales.is_active !== false ? 'text-white' : 'text-slate-400 line-through'}`}>
                    {sales.email}
                  </h3>
                  <div className="flex items-center gap-4 mt-1">
                    <p className="text-slate-500 text-[10px] font-mono uppercase">ID: {sales.id.substring(0, 8)}...</p>
                    
                    {/* ZONE PERFORMANCE (STATIQUE POUR L'INSTANT) */}
                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                      <TrendingUp size={12} />
                      PERF: À VENIR
                    </div>
                  </div>
                </div>
              </div>
              
              {/* ACTIONS DROITE */}
              <div className="flex gap-6 items-center w-full md:w-auto justify-between md:justify-end">
                <div className="text-right hidden md:block">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Statut</p>
                  {sales.is_active !== false ? (
                    <span className="text-green-500 text-sm font-bold uppercase italic tracking-wide">Actif</span>
                  ) : (
                    <span className="text-red-500 text-sm font-bold uppercase italic tracking-wide">Bloqué</span>
                  )}
                </div>

                <div className="h-10 w-px bg-slate-700 mx-2 hidden md:block"></div>

                {/* LE BOUTON DISJONCTEUR */}
                <button 
                  onClick={() => toggleStatus(sales.id, sales.is_active)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase transition-all shadow-lg ${
                    sales.is_active !== false
                    ? 'bg-slate-700 text-slate-400 hover:bg-red-500 hover:text-white hover:shadow-red-900/20'
                    : 'bg-green-600 text-white hover:bg-green-500 hover:shadow-green-900/20'
                  }`}
                >
                  <Power size={16} />
                  {sales.is_active !== false ? 'BLOQUER L\'ACCÈS' : 'RÉACTIVER LE COMPTE'}
                </button>
              </div>
            </div>
          ))}

          {!loading && salesUsers.length === 0 && (
            <div className="text-center py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <p className="text-slate-500 italic">Aucun commercial trouvé.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}