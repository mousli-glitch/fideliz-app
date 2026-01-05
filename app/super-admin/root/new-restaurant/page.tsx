"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Store, Mail, Lock, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'

export default function NewRestaurant() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    adminPassword: '',
  })
  
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. Création du restaurant
      const { data: resto, error: restoError } = await (supabase
        .from('restaurants') as any)
        .insert([{ 
          name: formData.name, 
          slug: formData.slug.toLowerCase().trim(),
          color_primary: '#3b82f6' 
        }])
        .select()
        .single()

      if (restoError) throw restoError

      // 2. Appel à une API route pour créer l'utilisateur (pour éviter la déconnexion du Root)
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.adminEmail,
          password: formData.adminPassword,
          role: 'admin',
          restaurant_id: resto.id
        })
      })

      if (!response.ok) throw new Error("Erreur lors de la création du compte accès")

      setSuccess(true)
      setTimeout(() => router.push('/super-admin/root'), 2000)
      
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0f18] flex items-center justify-center p-4 text-center">
        <div className="space-y-4">
          <CheckCircle2 className="text-green-500 mx-auto" size={80} />
          <h1 className="text-3xl font-black text-white">Établissement Créé !</h1>
          <p className="text-slate-400">Le restaurateur peut maintenant se connecter.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] text-white p-8 font-sans">
      <button onClick={() => router.push('/super-admin/root')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-12 transition-colors">
        <ArrowLeft size={20} /> Retour
      </button>

      <div className="max-w-2xl mx-auto pb-20">
        <div className="mb-12">
          <h1 className="text-4xl font-black mb-3">Nouvel Établissement</h1>
          <p className="text-slate-400">Enregistrez un restaurant et son accès admin.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 bg-[#111827] p-10 rounded-[40px] border border-slate-800 shadow-2xl">
          <div className="space-y-6">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-4">Infos Restaurant</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <input 
                required
                className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Nom du Restaurant"
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
              <input 
                required
                className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-blue-600 font-mono text-sm"
                placeholder="slug-url"
                onChange={(e) => setFormData({...formData, slug: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-4">Accès Administrateur</h2>
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input 
                  type="email" required
                  className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-4 pl-14 pr-6 outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Email du client"
                  onChange={(e) => setFormData({...formData, adminEmail: e.target.value})}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input 
                  type="password" required
                  className="w-full bg-[#0a0f18] border border-slate-800 rounded-2xl py-4 pl-14 pr-6 outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Mot de passe provisoire"
                  onChange={(e) => setFormData({...formData, adminPassword: e.target.value})}
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-4 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : "CRÉER ET ENVOYER LES ACCÈS"}
          </button>
        </form>
      </div>
    </div>
  )
}