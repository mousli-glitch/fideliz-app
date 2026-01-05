"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Store, Mail, ArrowLeft, Loader2 } from 'lucide-react'

export default function NewRestaurant() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    adminEmail: '',
  })
  
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. Vérification de la session Root
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Session expirée, veuillez vous reconnecter.")

      // 2. Insertion simplifiée pour éviter les erreurs de contraintes SQL
      const { data: resto, error: restoError } = await (supabase
        .from('restaurants') as any)
        .insert([
          { 
            name: formData.name, 
            slug: formData.slug.toLowerCase().trim(),
            color_primary: '#3b82f6'
            // On ne précise pas user_id ici car il est optionnel maintenant
          }
        ])
        .select()
        .single()

      if (restoError) throw restoError

      alert(`Succès ! Le restaurant "${formData.name}" a été créé.`)
      router.push('/super-admin/root')
      
    } catch (error: any) {
      console.error("Erreur de création:", error)
      alert("Erreur : " + (error.message || "Impossible de créer le restaurant"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] text-white p-8 font-sans">
      <button 
        onClick={() => router.push('/super-admin/root')} 
        className="flex items-center gap-2 text-slate-400 hover:text-white mb-12 transition-colors group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> 
        Retour au Dashboard Root
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-black mb-3 tracking-tight">Nouvel Établissement</h1>
          <p className="text-slate-400 font-medium text-lg">Enregistrez un nouveau client sur Fideliz</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10 bg-[#111827] p-10 rounded-[40px] border border-slate-800 shadow-2xl">
          
          <div className="space-y-8">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] text-center">Informations Générales</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 block text-center">Nom du Restaurant</label>
                <div className="relative">
                  <Store className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                  <input 
                    required
                    className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-5 pl-14 pr-5 outline-none focus:ring-2 focus:ring-blue-600 transition-all text-white placeholder:text-slate-700"
                    placeholder="ex: Le Petit Bistro"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 block text-center">Slug (URL)</label>
                <input 
                  required
                  className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-5 px-6 outline-none focus:ring-2 focus:ring-blue-600 transition-all font-mono text-sm text-white placeholder:text-slate-700"
                  placeholder="le-petit-bistro"
                  value={formData.slug}
                  onChange={(e) => setFormData({...formData, slug: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="pt-10 border-t border-slate-800 space-y-8">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] text-center">Contact Administrateur</h2>
            
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1 block text-center">Email professionnel</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input 
                  type="email"
                  required
                  className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-5 pl-14 pr-5 outline-none focus:ring-2 focus:ring-blue-600 transition-all text-white placeholder:text-slate-700"
                  placeholder="gerant@email.com"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({...formData, adminEmail: e.target.value})}
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-4 disabled:opacity-50 text-lg"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              "CONFIRMER LA CRÉATION"
            )}
          </button>
        </form>
      </div>
    </div>
  )
}