"use client"

import { useState, useEffect } from "react"
import { getAdminRestaurant, updateRestaurantAction } from "@/app/actions/admin"
import { Loader2, Save, Store, Globe, Mail, Copy, Check, ImageIcon, Palette } from "lucide-react"

export default function AdminSettingsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await getAdminRestaurant()
      if (data) setRestaurant(data)
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateRestaurantAction(restaurant.id, {
        name: restaurant.name,
        contact_email: restaurant.contact_email,
        theme: restaurant.theme,            // Ajouté
        background_url: restaurant.background_url // Ajouté
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

  // Liste des thèmes (Images statiques pour l'exemple)
  const themes = [
    { id: 'casino', name: 'Casino Royal', img: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?auto=format&fit=crop&w=300&q=80' },
    { id: 'arcade', name: 'Arcade Néon', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80' },
    { id: 'minimal', name: 'Minimaliste', img: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=300&q=80' },
    { id: 'dark', name: 'Dark Mode', img: 'https://images.unsplash.com/photo-1483478550801-ceba5fe50e8e?auto=format&fit=crop&w=300&q=80' },
  ]

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-10 h-10 text-blue-600"/></div>
  if (!restaurant) return <div className="p-10 text-center">Aucun restaurant trouvé.</div>

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Store className="text-blue-600" /> Paramètres
        </h1>
        <p className="text-slate-500 font-medium mt-1">Gérez les informations et le design de votre établissement.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* SECTION 1 : INFOS GÉNÉRALES */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Store size={20}/> Informations</h2>
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

        {/* SECTION 2 : DESIGN & THÈME (RÉINTÉGRÉ) */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Palette size={20}/> Design & Thème</h2>
            
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-4">Choisir un thème :</label>
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
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>

        {/* Bouton Sauvegarder */}
        <div className="flex justify-end pt-4">
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