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
      // 1. On vérifie la session actuelle pour être sûr d'être authentifié
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Session expirée. Veuillez vous reconnecter.")

      // 2. Insertion du restaurant
      const { data: resto, error: restoError } = await (supabase
        .from('restaurants') as any)
        .insert([
          { 
            name: formData.name, 
            slug: formData.slug.toLowerCase().trim(),
            color_primary: '#3b82f6',
            // On peut optionnellement lier le resto au créateur ici si besoin
          }
        ])
        .select()
        .single()

      if (restoError) throw restoError

      alert(`Félicitations ! Le restaurant "${formData.name}" est désormais configuré.`)
      router.push('/super-admin/root')
      
    } catch (error: any) {
      console.error("Erreur de création:", error)
      alert("Erreur de sécurité ou base de données : " + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
      <button 
        onClick={() => router.push('/super-admin/root')} 
        className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> 
        Retour au Dashboard Root
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-black mb-2 tracking-tight">Nouvel Établissement</h1>
          <p className="text-slate-400 font-medium">Enregistrez un nouveau client Fideliz</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 bg-slate-800/40 p-10 rounded-[32px] border border-slate-700/50 backdrop-blur-sm shadow-2xl">
          <div className="space-y-6">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] mb-4 text-center">Informations Générales</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 text-center block">Nom du Restaurant</label>
                <div className="relative text-white">
                  <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                  <input 
                    required
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                    placeholder="ex: Le Petit Bistro"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 text-center block">Slug (URL)</label>
                <input 
                  required
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm placeholder:text-slate-600"
                  placeholder="le-petit-bistro"
                  value={formData.slug}
                  onChange={(e) => setFormData({...formData, slug: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-700/50 space-y-6">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] mb-4 text-center">Contact Gérant</h2>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1 text-center block">Email professionnel</label>
              <div className="relative text-white">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input 
                  type="email"
                  required
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <span>CONFIRMER LA CRÉATION</span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}