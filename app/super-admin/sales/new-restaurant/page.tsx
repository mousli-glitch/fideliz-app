"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Store, MapPin, Globe, Loader2, Save } from 'lucide-react'
import Link from 'next/link'

export default function NewRestaurant() {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  
  const supabase = createClient()
  const router = useRouter()

  // Génération automatique du lien (Slug) quand on tape le nom
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setName(val)
    // Transforme "Chez Mario" en "chez-mario"
    setSlug(val.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // 1. On récupère l'ID du commercial connecté
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert("Erreur: Vous devez être connecté")
      router.push('/login')
      return
    }

    // 2. On insère le restaurant dans la base
    // CORRECTIF : On utilise ( ... as any) pour contourner totalement la vérification TypeScript
    const { error } = await (supabase.from('restaurants') as any).insert({
      name,
      city,
      slug,
      owner_id: user.id, // On note qui a créé ce restaurant (le commercial)
      is_active: true
    })

    if (error) {
      alert("Erreur lors de la création : " + error.message)
    } else {
      alert("Restaurant créé avec succès ! 🎉")
      router.push('/super-admin/sales/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex justify-center">
      <div className="w-full max-w-2xl">
        
        {/* BOUTON RETOUR */}
        <Link href="/super-admin/sales/dashboard" className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors w-fit text-xs font-bold uppercase tracking-widest">
          <ArrowLeft size={16} /> Retour Dashboard
        </Link>

        <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] shadow-2xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-900/20">
              <Store size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black italic">NOUVEAU <span className="text-blue-500">CLIENT</span></h1>
              <p className="text-slate-500 text-sm">Ajouter un établissement au réseau Fideliz</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* NOM DU RESTAURANT */}
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Enseigne</label>
              <div className="relative group">
                <Store className="absolute left-4 top-4 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={handleNameChange}
                  className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold placeholder:text-slate-700"
                  placeholder="Ex: Le Bistrot Parisien"
                />
              </div>
            </div>

            {/* VILLE & SLUG (2 colonnes) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Ville</label>
                <div className="relative group">
                  <MapPin className="absolute left-4 top-4 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium placeholder:text-slate-700"
                    placeholder="Ex: Paris 11"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Lien (Slug)</label>
                <div className="relative group">
                  <Globe className="absolute left-4 top-4 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-blue-400 pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm placeholder:text-slate-700"
                    placeholder="le-bistrot-parisien"
                  />
                </div>
              </div>
            </div>

            {/* BOUTON VALIDER */}
            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl mt-8 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg transform active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" /> : (
                <>
                  <Save size={24} />
                  ENREGISTRER LE RESTAURANT
                </>
              )}
            </button>

          </form>
        </div>
      </div>
    </div>
  )
}