"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { UserPlus, Shield, Activity, ArrowLeft, X, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function SalesManagement() {
  // --- 1. LES VARIABLES D'ÉTAT (LES TIROIRS DE MÉMOIRE) ---
  const [salesUsers, setSalesUsers] = useState<any[]>([]) // La liste des commerciaux
  const [loading, setLoading] = useState(true)            // Est-ce qu'on charge la page ?
  const [showForm, setShowForm] = useState(false)        // Est-ce que le formulaire est ouvert ?
  const [email, setEmail] = useState('')                 // L'email écrit dans le formulaire
  const [password, setPassword] = useState('')           // Le MDP écrit dans le formulaire
  const [isCreating, setIsCreating] = useState(false)    // Est-ce qu'on est en train de créer ?

  const supabase = createClient()

  // --- 2. FONCTION POUR RÉCUPÉRER LA LISTE DEPUIS SUPABASE ---
  async function loadSales() {
    setLoading(true)
    
    // ON ATTEND UN TOUT PETIT PEU (500ms) pour être sûr que la base est prête
    await new Promise(resolve => setTimeout(resolve, 500));

    const { data } = await supabase
      .from('profiles' as any)
      .select('*')
      .eq('role', 'sales')
    
    setSalesUsers(data || [])
    setLoading(false)
  }

  // --- 3. AU CHARGEMENT DE LA PAGE, ON LANCE LA RÉCUPÉRATION ---
  useEffect(() => {
    loadSales()
  }, [])

  // --- 4. LA FONCTION QUAND TU CLIQUES SUR "CRÉER" ---
  const handleCreateSales = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    // ÉTAPE A : On crée le compte dans le système d'authentification
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      alert("Erreur : " + authError.message)
      setIsCreating(false)
      return
    }

    // ÉTAPE B : Si le compte est créé, on lui donne le rôle "sales"
    if (authData.user) {
      const query: any = supabase.from('profiles' as any)
      const { error: profileError } = await query
        .update({ role: 'sales' })
        .eq('id', authData.user.id)

      if (profileError) {
        alert("Erreur de rôle : " + profileError.message)
      } else {
        alert("Commercial créé ! Il va apparaître dans la liste.")
        
        // ÉTAPE C : On vide le formulaire et on ferme la fenêtre
        setEmail('')
        setPassword('')
        setShowForm(false)
        
        // ÉTAPE D : On relance la recherche pour afficher le nouveau venu
        loadSales()
      }
    }
    setIsCreating(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* LE BANDEAU DU HAUT */}
      <Navbar roleName="Super Admin" />
      
      <div className="p-8 max-w-6xl mx-auto">
        {/* LE BOUTON RETOUR */}
        <Link href="/super-admin/root" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-sm font-bold uppercase">
          <ArrowLeft size={18} /> Retour
        </Link>

        {/* LE TITRE ET LE BOUTON D'AJOUT */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black italic uppercase">Équipe <span className="text-blue-500">Commerciale</span></h1>
          </div>
          <button 
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all"
          >
            <UserPlus size={20} /> Nouveau Commercial
          </button>
        </div>

        {/* LA FENÊTRE (MODAL) QUI S'AFFICHE POUR LE FORMULAIRE */}
        {showForm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] max-w-md w-full relative">
              <button onClick={() => setShowForm(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white">
                <X size={24} />
              </button>
              
              <h2 className="text-2xl font-black mb-6">Ajouter un commercial</h2>
              
              <form onSubmit={handleCreateSales} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 mt-2 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@fideliz.fr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mot de passe</label>
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 mt-2 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  disabled={isCreating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl mt-4 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="animate-spin" /> : "CRÉER LE COMPTE"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* LA LISTE DES COMMERCIAUX */}
        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
          ) : salesUsers.map((sales) => (
            <div key={sales.id} className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/10 p-4 rounded-2xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{sales.email}</h3>
                  <p className="text-slate-500 text-[10px] font-mono italic">UID: {sales.id}</p>
                </div>
              </div>
              
              <div className="flex gap-8 items-center">
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-black">Statut</p>
                  <span className="text-green-500 text-sm font-bold uppercase italic tracking-wider">Actif</span>
                </div>
                <div className="h-10 w-px bg-slate-700 mx-2 hidden md:block"></div>
                <button className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg">
                  <Activity size={20} />
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