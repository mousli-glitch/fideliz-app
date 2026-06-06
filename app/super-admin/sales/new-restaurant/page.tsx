"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { createRestaurantAction } from '@/app/actions/create-restaurant'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Store, MapPin, Globe, Loader2, Save, Mail, Lock } from 'lucide-react'
import Link from 'next/link'

export default function NewRestaurantSales() {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setName(val)
    setSlug(val.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // 1. Récupérer le commercial connecté
    const { data: { user: salesUser } } = await supabase.auth.getUser()

    if (!salesUser) {
      alert("Session expirée")
      router.push('/login')
      return
    }

    // Création complète côté SERVEUR (clé service role) : compte Auth + restaurant + profil lié.
    // Évite la déconnexion du commercial et les blocages RLS du client navigateur.
    const result = await createRestaurantAction({
      name,
      city,
      slug,
      email,
      password,
      salesId: salesUser.id, // le commercial = créateur
    })

    if (!result.success) {
      alert("Erreur : " + result.error)
      setLoading(false)
      return
    }

    alert("Succès ! Restaurant créé et lié à votre portefeuille. 🎉")
    router.push('/super-admin/sales/dashboard')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex justify-center">
      <div className="w-full max-w-2xl">
        <Link href="/super-admin/sales/dashboard" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-xs font-bold uppercase tracking-widest">
          <ArrowLeft size={16} /> Retour Dashboard
        </Link>

        <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] shadow-2xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-900/20">
              <Store size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black italic">NOUVEL <span className="text-blue-500">ÉTABLISSEMENT</span></h1>
              <p className="text-slate-500 text-sm">Espace Commercial : Création Client</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6 p-6 bg-slate-950/50 rounded-3xl border border-slate-800/50">
              <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4">Infos Restaurant</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-2 block">Nom du Restaurant</label>
                  <input 
                    type="text" required value={name} onChange={handleNameChange}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 font-bold"
                    placeholder="Ex: Le Kiosque"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-2 block">Ville</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-slate-600" size={18} />
                    <input 
                      type="text" required value={city} onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl outline-none focus:border-blue-500"
                      placeholder="Paris"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-2 block">slug-url</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 text-slate-600" size={18} />
                    <input 
                      type="text" required value={slug} onChange={(e) => setSlug(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-blue-400 pl-10 pr-4 py-3 rounded-xl outline-none focus:border-blue-500 font-mono text-sm"
                      placeholder="le-kiosque"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6 bg-slate-950/50 rounded-3xl border border-slate-800/50">
              <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4">Accès Administrateur</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-2 block">Email du client</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-3.5 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white pl-12 pr-4 py-3.5 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      placeholder="client@restaurant.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-2 block">Mot de passe provisoire</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-3.5 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                      type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white pl-12 pr-4 py-3.5 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl mt-4 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-wide text-sm"
            >
              {loading ? <Loader2 className="animate-spin" /> : "CRÉER ET ENVOYER LES ACCÈS"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}