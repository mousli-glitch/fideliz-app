"use client"

import { useState, useEffect } from "react"
import { updateRestaurantAction } from "@/app/actions/admin" 
import { getGoogleLocationsAction, saveGoogleLocationAction } from "@/app/actions/google-business"
import { Loader2, Save, Store, Globe, Mail, Copy, Check, MessageSquare, MapPin, AlertCircle } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import Link from "next/link" 

export default function AdminSettingsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // États pour Google Locations
  const [locations, setLocations] = useState<any[]>([])
  const [loadingLocs, setLoadingLocs] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState("")
  
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
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

      if (data) {
        setRestaurant(data)
        // Si Google est connecté mais pas de lieu choisi, on lance le chargement
        if (data.google_access_token && !data.google_location_id) {
            handleLoadLocations(data.id)
        }
      }
      setLoading(false)
    }
    load()
  }, [params.slug])

  // Détection retour callback Google (paramètre ?google_connected=true)
  useEffect(() => {
    if (searchParams.get("google_connected") === "true" && restaurant?.id) {
      handleLoadLocations(restaurant.id)
    }
  }, [searchParams, restaurant])

  // --- NOUVELLES FONCTIONS GOOGLE ---

  const handleLinkGoogle = () => {
    const state = restaurant.slug || restaurant.id;
    window.location.href = `/api/auth/google?state=${state}`
  }

  const handleLoadLocations = async (id: string) => {
    setLoadingLocs(true)
    const res = await getGoogleLocationsAction(id)
    if (res.success) {
        // CORRECTION ICI : Ajout de "|| []" pour garantir que ce n'est jamais undefined
        setLocations(res.locations || [])
    } else {
        alert("Erreur Google: " + res.error)
    }
    setLoadingLocs(false)
  }

  const handleSaveLocation = async () => {
    if (!selectedLocation) return
    const res = await saveGoogleLocationAction(restaurant.id, selectedLocation)
    if (res.success) {
        alert("Établissement lié avec succès ! 🎉")
        setRestaurant((prev: any) => ({ ...prev, google_location_id: selectedLocation }))
        router.refresh()
    } else {
        alert("Erreur sauvegarde")
    }
  }

  // --- FIN FONCTIONS GOOGLE ---

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateRestaurantAction(restaurant.id, {
        name: restaurant.name,
        contact_email: restaurant.contact_email,
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
        <p className="text-slate-500 font-medium mt-1">Gérez les informations de contact et les réglages de votre établissement.</p>
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

        {/* SECTION 2 : IA & GOOGLE BUSINESS */}
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

                {/* 2. Connexion Google & Sélection Établissement */}
                <div className="pt-6 border-t border-slate-100 flex flex-col items-start gap-4">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full">
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-5 h-5" alt="Google"/>
                                Fiche Google Business
                            </h3>
                            <p className="text-sm text-slate-500 font-medium">Connectez votre établissement pour gérer vos avis.</p>
                        </div>
                        
                        {!restaurant.google_access_token ? (
                             <button 
                                type="button"
                                onClick={handleLinkGoogle}
                                className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-3 shadow-sm active:scale-95"
                            >
                                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-5 h-5" alt="Google"/>
                                Lier ma fiche Google
                            </button>
                        ) : restaurant.google_location_id ? (
                            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full border border-green-200 font-bold text-sm">
                                <Check size={16}/> Compte connecté & Lié
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200 font-bold text-sm">
                                ⚠️ Action requise ci-dessous
                            </div>
                        )}
                    </div>

                    {/* ZONE DE SÉLECTION DE L'ÉTABLISSEMENT */}
                    {restaurant.google_access_token && !restaurant.google_location_id && (
                        <div className="w-full bg-slate-50 p-6 rounded-xl border border-slate-200 mt-2 animate-in fade-in slide-in-from-top-4">
                            <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-800">
                                <MapPin className="text-blue-600"/> 
                                Sélectionnez votre établissement exact
                            </h3>
                            
                            {loadingLocs ? (
                                <div className="flex items-center gap-2 text-slate-500 py-4"><Loader2 className="animate-spin"/> Recherche des lieux sur votre compte...</div>
                            ) : locations.length > 0 ? (
                                <div className="space-y-4">
                                    <select 
                                        className="w-full p-4 border rounded-xl bg-white font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                                        onChange={(e) => setSelectedLocation(e.target.value)}
                                        value={selectedLocation}
                                    >
                                        <option value="">-- Choisir dans la liste --</option>
                                        {locations.map((loc: any) => (
                                            <option key={loc.id} value={loc.id}>
                                                {loc.title} ({loc.address})
                                            </option>
                                        ))}
                                    </select>
                                    <button 
                                        type="button"
                                        onClick={handleSaveLocation}
                                        disabled={!selectedLocation}
                                        className="w-full bg-black text-white py-4 rounded-xl font-bold disabled:opacity-50 hover:bg-slate-900 transition-colors"
                                    >
                                        Valider cet établissement
                                    </button>
                                </div>
                            ) : (
                                <div className="text-red-500 flex items-center gap-2 bg-red-50 p-4 rounded-lg border border-red-100">
                                    <AlertCircle/> Aucun établissement trouvé sur ce compte Google.
                                </div>
                            )}
                        </div>
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
        <div className="flex justify-end pb-10">
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