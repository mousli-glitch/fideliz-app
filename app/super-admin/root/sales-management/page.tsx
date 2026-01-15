"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Navbar from '@/components/Navbar'
import { UserPlus, Shield, ArrowLeft, X, Loader2, Power, Ban, Trash2, Store, Mail, ShieldCheck, Clock } from 'lucide-react'
import Link from 'next/link'
import { getSalesData } from '@/app/actions/get-sales-data'
import { logSystemError } from '@/app/actions/log-system-error'
// IMPORT DES ACTIONS MAÎTRES
import { masterCreateSalesAction, masterDeleteUser } from '@/app/actions/admin-actions'

export default function SalesManagement() {
  const [salesUsers, setSalesUsers] = useState<any[]>([]) 
  const [loading, setLoading] = useState(true)            
  const [showForm, setShowForm] = useState(false)        
  const [email, setEmail] = useState('')                 
  const [password, setPassword] = useState('')           
  const [isCreating, setIsCreating] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

  const supabase = createClient()

  async function loadSales() {
    setLoading(true)
    const result = await getSalesData()
    if (result.success) {
      setSalesUsers(result.data || [])
    } else {
      console.error("Erreur chargement via Action:", result.error)
    }
    setLoading(false)
  }

  useEffect(() => { loadSales() }, [])

  const toggleStatus = async (id: string, currentStatus: boolean, userEmail: string) => {
    setSalesUsers(salesUsers.map(user => 
      user.id === id ? { ...user, is_active: !currentStatus } : user
    ))
    const query: any = supabase.from('profiles' as any)
    const { error } = await query.update({ is_active: !currentStatus }).eq('id', id)
    if (error) {
      alert("Erreur lors du changement de statut")
      loadSales()
    } else {
      await logSystemError({ 
        message: `${!currentStatus ? 'Activation' : 'Blocage'} du commercial ${userEmail}`,
        level: 'info' 
      })
    }
  }

  // MODIFIÉ : Utilise Master Create pour éviter le bug "User already registered"
  const handleCreateSales = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    const result = await masterCreateSalesAction({ email, password })

    if (!result.success) {
      await logSystemError({ message: `Échec recrutement Master: ${email}`, details: result.error })
      alert("Erreur : " + result.error)
    } else {
      await logSystemError({ message: `Nouveau commercial recruté : ${email}`, level: 'info' })
      alert("Commercial créé avec succès !")
      setEmail(''); setPassword(''); setShowForm(false)
      loadSales()
    }
    setIsCreating(false)
  }

  // MODIFIÉ : Utilise Master Delete pour nettoyer l'Auth + Profil
  const handleDelete = async (id: string, userEmail: string, count: number) => {
    const message = count > 0 
      ? `⚠️ ATTENTION : Ce commercial gère ${count} restaurant(s).\n\nIls vous seront automatiquement réattribués.\n\nContinuer ?`
      : `Supprimer définitivement ${userEmail} ?`;

    if (!confirm(message)) return
    setDeleteLoading(id)

    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (currentUser && count > 0) {
      const { error: updateError } = await (supabase.from('restaurants') as any)
        .update({ owner_id: currentUser.id })
        .eq('owner_id', id)

      if (updateError) {
        alert("Erreur critique lors du transfert")
        setDeleteLoading(null)
        return
      }
    }

    // SUPPRESSION TOTALE
    const result = await masterDeleteUser(id)

    if (!result.success) {
      alert("Erreur suppression : " + result.error)
    } else {
      await logSystemError({ message: `Commercial supprimé : ${userEmail}`, level: 'warning' })
      setSalesUsers(salesUsers.filter(user => user.id !== id))
      if (count > 0) alert(`Succès : Les ${count} restaurants sont maintenant à vous.`)
    }
    setDeleteLoading(null)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans tracking-tight">
      <Navbar roleName="Super Admin" />
      <div className="p-8 max-w-6xl mx-auto">
        <Link href="/super-admin/root" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-sm font-bold uppercase tracking-widest">
          <ArrowLeft size={18} /> Retour Dashboard
        </Link>
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter italic">Équipe <span className="text-blue-500">Commerciale</span></h1>
            <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-1">
              {salesUsers.length} Membres recrutés sous votre direction
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-500 px-6 py-4 rounded-3xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 text-sm uppercase">
            <UserPlus size={20} /> Nouveau Commercial
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
          ) : salesUsers.map((agent) => (
            <div key={agent.id} className={`border p-6 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between transition-all gap-6 ${agent.is_active !== false ? 'bg-slate-800/40 border-slate-800' : 'bg-red-900/10 border-red-900/30'}`}>
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-inner ${agent.is_active !== false ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'}`}>
                  {agent.is_active !== false ? <ShieldCheck size={32} /> : <Ban size={32} />}
                </div>
                <div>
                  <h3 className={`font-black text-xl tracking-tighter uppercase ${agent.is_active !== false ? 'text-white' : 'text-slate-600 line-through'}`}>
                    {agent.email}
                  </h3>
                  <div className="flex items-center gap-4 mt-2">
                    <p className="text-slate-600 text-[10px] font-black uppercase tracking-tighter">ID: {agent.id.substring(0, 12)}...</p>
                    <div className="flex items-center gap-2 text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-xl border border-blue-500/20 uppercase">
                      <Store size={12} /> {agent.restaurants_count} Restaurants rattachés
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 items-center w-full md:w-auto justify-end border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
                <button onClick={() => toggleStatus(agent.id, agent.is_active, agent.email)} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[10px] uppercase transition-all shadow-lg ${agent.is_active !== false ? 'bg-slate-800 text-slate-500 hover:bg-amber-500 hover:text-white' : 'bg-green-600 text-white hover:bg-green-500'}`}>
                  <Power size={16} /> {agent.is_active !== false ? 'Désactiver' : 'Réactiver'}
                </button>
                <button onClick={() => handleDelete(agent.id, agent.email, agent.restaurants_count)} disabled={deleteLoading === agent.id} className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white px-5 py-3 rounded-2xl transition-all shadow-lg disabled:opacity-50">
                  {deleteLoading === agent.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                </button>
              </div>
            </div>
          ))}
        </div>
        {showForm && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] max-w-md w-full relative shadow-2xl">
              <button onClick={() => setShowForm(false)} className="absolute top-10 right-10 text-slate-500 hover:text-white transition-colors"><X size={28} /></button>
              <h2 className="text-3xl font-black mb-2 italic uppercase">Recruter <span className="text-blue-500">Sales</span></h2>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">Nouveaux accès commerciaux</p>
              <form onSubmit={handleCreateSales} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-2 block font-mono">Email Professionnel</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all" placeholder="nom@fideliz.fr" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-2 block font-mono">Mot de passe provisoire</label>
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all" placeholder="••••••••" />
                </div>
                <button disabled={isCreating} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-[20px] mt-6 transition-all flex items-center justify-center gap-2 text-sm uppercase shadow-xl shadow-blue-900/20">
                  {isCreating ? <Loader2 className="animate-spin" /> : "VALIDER LE RECRUTEMENT"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}