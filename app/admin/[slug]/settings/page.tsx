"use client"

import { useState, useEffect } from "react"
import { updateRestaurantAction } from "@/app/actions/admin" 
import { Loader2, Save, Store, Globe, Mail, Copy, Check, ImageIcon, Palette, Star, MessageSquare } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import Link from "next/link" // <--- AJOUTÉ : Import indispensable pour la navigation

export default function AdminSettingsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const params = useParams()
  const supabase = createClient()

  // 1. Chargement sécurisé via le SLUG
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const slugSecurise = params?.slug ? String(params.slug) : ""
      
      const { data } = await (supabase
        .from('restaurants') as any)
        .select('*')
        .eq('slug', slugSecurise)
        .single()

      if (data) setRestaurant(data)
      setLoading(false)
    }
    load()
  }, [params.slug])

  // 2. Sauvegarde
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateRestaurantAction(restaurant.id, {
        name: restaurant.name,
        contact_email: restaurant.contact_email,
        theme: restaurant.theme,
        background_url: restaurant.background_url,
        // --- AJOUT DES NOUVEAUX CHAMPS IA ---
        ai_tone: restaurant.ai_tone
      })
      alert("✅ Paramètres mis à jour !")
    } catch (err) {
      alert("Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    const url = `${window.location.origin}/play/${restaurant.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Liste des thèmes
  const themes = [
    { id: 'casino', name: 'Casino Royal', img: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?auto=format&fit=crop&w=300&q=80' },
    { id: 'arcade', name: 'Arcade Néon', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80' },
    { id: 'minimal', name: 'Minimaliste', img: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=300&q=80' },
    { id: 'dark', name: 'Dark Mode', img: 'https://images.unsplash.com/photo-1483478550801-ceba5fe50e8e?auto=format&fit=crop&w=300&q=80' },
  ]

  // Liste des tons IA
  const aiTones = [
    { id: 'amical', name: 'Amical', desc: 'Chaleureux & Emojis', icon: '😊' },
    { id: 'professionnel', name: 'Pro', desc: 'Sérieux & Carré', icon: '💼' },
    { id: 'dynamique', name: 'Punchy', desc: 'Court & Direct', icon: '🚀' },
  ]

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-10 h-10 text-blue-600"/></div>
  if (!restaurant) return <div className="p-10 text-center">Aucun restaurant trouvé pour ce lien.</div>

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Store className="text-blue-600" /> Paramètres
        </h1>
        <p className="text-slate-500 font-medium mt-1">Gérez les informations de contact et le design de votre établissement.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* SECTION 1 : INFOS GÉNÉRALES */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Nom de l'établissement</label>
              <input 
                type="text" 
                value={restaurant.name}
                onChange={(e) => setRestaurant({...restaurant, name: e.target.value})}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Mail size={16} className="text-slate-400"/> Email de contact
              </label>
              <input 
                type="email" 
                placeholder="contact@restaurant.fr"
                value={restaurant.contact_email || ""}
                onChange={(e) => setRestaurant({...restaurant, contact_email: e.target.value})}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2 : DESIGN & THÈME */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Palette size={20}/> Design & Thème Global</h2>
            
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-4">Choisir un thème par défaut :</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {themes.map((theme) => (
                            <div 
                                key={theme.id}
                                onClick={() => setRestaurant({...restaurant, theme: theme.id})}
                                className={`cursor-pointer relative group rounded-xl overflow-hidden border-2 transition-all ${restaurant.theme === theme.id ? 'border-blue-600 ring-2 ring-blue-200 scale-105' : 'border-transparent hover:border-slate-300'}`}
                            >
                                <img src={theme.img} alt={theme.name} className="w-full h-24 object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <span className="text-white font-bold text-xs">{theme.name}</span>
                                </div>
                                {restaurant.theme === theme.id && (
                                    <div className="absolute top-2 right-2 bg-blue-600 text-white p-1 rounded-full">
                                        <Check size={10} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <ImageIcon size={16} className="text-slate-400"/> Ou fond personnalisé (URL Image)
                    </label>
                    <input 
                        type="url" 
                        placeholder="https://..."
                        value={restaurant.background_url || ""}
                        onChange={(e) => setRestaurant({...restaurant, background_url: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-2 italic">Si rempli, cette image remplacera le thème.</p>
                </div>
            </div>
        </div>

        {/* --- NOUVELLE SECTION 4 : IA & GOOGLE BUSINESS --- */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-600"/> Intelligence Artificielle & Avis
            </h2>
            <p className="text-sm text-slate-500 mb-8 font-medium italic">Configurez comment l'IA doit répondre à vos clients sur Google.</p>
            
            <div className="space-y-8">
                {/* 1. Sélection du Ton */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Identité de vos réponses :</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {aiTones.map((tone) => (
                            <div 
                                key={tone.id}
                                onClick={() => setRestaurant({...restaurant, ai_tone: tone.id})}
                                className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${restaurant.ai_tone === tone.id ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-100 bg-slate-50 hover:border-slate-300'}`}
                            >
                                <div className="text-3xl">{tone.icon}</div>
                                <div>
                                    <p className={`font-bold ${restaurant.ai_tone === tone.id ? 'text-blue-700' : 'text-slate-700'}`}>{tone.name}</p>
                                    <p className="text-xs text-slate-500 font-medium">{tone.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Connexion Google (CORRIGÉ) */}
                <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-5 h-5" alt="Google"/>
                            Fiche Google Business
                        </h3>
                        <p className="text-sm text-slate-500 font-medium">Connectez votre établissement pour gérer vos avis.</p>
                    </div>
                    
                    {restaurant.google_refresh_token ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full border border-green-200 font-bold text-sm">
                            <Check size={16}/> Compte connecté
                        </div>
                    ) : (
                        /* CHANGEMENT ICI : button devient Link */
                        <Link 
                            href={`/api/auth/google?slug=${restaurant.slug}`}
                            className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-3 shadow-sm active:scale-95"
                        >
                            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-5 h-5" alt="Google"/>
                            Lier ma fiche Google
                        </Link>
                    )}
                </div>
            </div>
        </div>

        {/* SECTION 3 : LIEN PUBLIC */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 font-bold text-slate-800 mb-4">
            <Globe size={20} className="text-blue-500"/> Votre lien de jeu public
          </div>
          <div className="flex items-center gap-2 p-4 bg-slate-900 rounded-xl border border-slate-800">
            <code className="flex-1 text-blue-400 font-bold truncate">
              {typeof window !== 'undefined' ? window.location.origin : ''}/play/{restaurant.slug}
            </code>
            <button 
              type="button"
              onClick={handleCopy}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
            >
              {copied ? <Check size={16} className="text-green-400"/> : <Copy size={16}/>}
              {copied ? "Copié !" : "Copier le lien"}
            </button>
          </div>
        </div>

        {/* Bouton Sauvegarder */}
        <div className="flex justify-end">
          <button 
            type="submit" 
            disabled={saving}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin"/> : <Save size={20} />}
            Mettre à jour les paramètres
          </button>
        </div>

      </form>
    </div>
  )
}