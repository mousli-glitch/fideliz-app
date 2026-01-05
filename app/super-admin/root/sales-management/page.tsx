"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { UserPlus, Shield, ArrowLeft, X, Loader2, Power, Ban, Trash2, Store } from 'lucide-react'
import Link from 'next/link'

export default function SalesManagement() {
  // --- 1. LES VARIABLES D'ÉTAT ---
  const [salesUsers, setSalesUsers] = useState<any[]>([]) 
  const [loading, setLoading] = useState(true)            
  const [showForm, setShowForm] = useState(false)        
  const [email, setEmail] = useState('')                 
  const [password, setPassword] = useState('')           
  const [isCreating, setIsCreating] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

  const supabase = createClient()

  // --- 2. FONCTION POUR RÉCUPÉRER LA LISTE + STATS ---
  async function loadSales() {
    setLoading(true)
    
    // A. On récupère les profils "sales"
    const { data: agents, error } = await supabase
      .from('profiles' as any)
      .select('*')
      .eq('role', 'sales')
      .order('created_at', { ascending: false })

    if (error || !agents) {
      console.error("Erreur chargement:", error)
      setLoading(false)
      return
    }

    // B. On récupère le nombre de restaurants pour CHAQUE agent
    const agentsWithStats = await Promise.all(agents.map(async (agent: any) => {
      const { count } = await supabase
        .from('restaurants')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', agent.id)
      
      return { ...agent, restaurants_count: count || 0 }
    }))
    
    setSalesUsers(agentsWithStats)
    setLoading(false)
  }

  // --- 3. CHARGEMENT INITIAL ---
  useEffect(() => {
    loadSales()
  }, [])

  // --- 4. LE DISJONCTEUR (Bloquer/Débloquer) ---
  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setSalesUsers(salesUsers.map(user => 
      user.id === id ? { ...user, is_active: !currentStatus } : user
    ))

    const query: any = supabase.from('profiles' as any)
    const { error } = await query
      .update({ is_active: !currentStatus })
      .eq('id', id)

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

  // --- 6. SUPPRESSION SÉCURISÉE (AVEC HÉRITAGE) ---
  const handleDelete = async (id: string, email: string, count: number) => {
    // A. Message d'avertissement intelligent
    const message = count > 0 
      ? `⚠️ ATTENTION : Ce commercial gère ${count} restaurant(s).\n\nSi vous le supprimez, ces restaurants vous seront automatiquement réattribués (Super Admin).\n\nVoulez-vous continuer ?`
      : `Êtes-vous sûr de vouloir supprimer ${email} ?`;

    if (!confirm(message)) return

    setDeleteLoading(id)

    // B. Récupération de TON id (Super Admin) pour le transfert
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (currentUser && count > 0) {
      // C. Transfert des restaurants vers TOI
      const { error: updateError } = await (supabase.from('restaurants') as any)
        .update({ owner_id: currentUser.id })
        .eq('owner_id', id)

      if (updateError) {
        alert("Erreur critique lors du transfert des restaurants : " + updateError.message)
        setDeleteLoading(null)
        return // On arrête tout pour ne pas perdre les restos
      }
    }

    // D. Suppression du profil commercial
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)

    if (error) {
      alert("Erreur lors de la suppression du profil : " + error.message)
    } else {
      // E. Mise à jour visuelle
      setSalesUsers(salesUsers.filter(user => user.id !== id))
      if (count > 0) {
        alert(`Succès : Commercial supprimé. Ses ${count} restaurants sont maintenant dans votre portefeuille.`)
      }
    }
    setDeleteLoading(null)
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

        {/* LISTE DES COMMERCIAUX */}
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
                    
                    {/* ZONE PERFORMANCE */}
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                      <Store size={12} />
                      {sales.restaurants_count} RESTAURANT{sales.restaurants_count > 1 ? 'S' : ''}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* ACTIONS DROITE */}
              <div className="flex gap-4 items-center w-full md:w-auto justify-between md:justify-end">
                
                {/* BOUTON DISJONCTEUR */}
                <button 
                  onClick={() => toggleStatus(sales.id, sales.is_active)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase transition-all shadow-lg ${
                    sales.is_active !== false
                    ? 'bg-slate-700 text-slate-400 hover:bg-amber-500 hover:text-white hover:shadow-amber-900/20'
                    : 'bg-green-600 text-white hover:bg-green-500 hover:shadow-green-900/20'
                  }`}
                  title={sales.is_active !== false ? "Bloquer temporairement" : "Réactiver le compte"}
                >
                  <Power size={16} />
                  {sales.is_active !== false ? 'BLOQUER' : 'ACTIVER'}
                </button>

                {/* BOUTON SUPPRIMER AVEC SÉCURITÉ HÉRITAGE */}
                <button 
                  // On passe bien les 3 arguments ici : id, email, et nombre de restaurants
                  onClick={() => handleDelete(sales.id, sales.email, sales.restaurants_count)}
                  disabled={deleteLoading === sales.id}
                  className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white px-4 py-3 rounded-xl transition-all shadow-lg shadow-red-900/0 hover:shadow-red-900/40 disabled:opacity-50"
                  title="Supprimer définitivement (Transfère les restos si nécessaire)"
                >
                  {deleteLoading === sales.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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