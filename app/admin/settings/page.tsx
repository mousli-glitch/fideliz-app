"use client"

import { useState, useEffect } from "react"
import { getAdminRestaurant, updateRestaurantAction } from "../../actions/admin" // Import relatif corrigé
import { Loader2, Save, Store, Palette } from "lucide-react"

export default function AdminSettingsPage() {
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Chargement des données
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await getAdminRestaurant()
      if (data) setRestaurant(data)
      setLoading(false)
    }
    load()
  }, [])

  // Sauvegarde
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateRestaurantAction(restaurant.id, {
        name: restaurant.name,
        brand_color: restaurant.brand_color,
        // Tu pourras ajouter d'autres champs ici plus tard
      })
      alert("Paramètres mis à jour !")
    } catch (err) {
      alert("Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin"/></div>
  if (!restaurant) return <div className="p-10 text-center">Aucun restaurant trouvé.</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-3">
        <Store className="text-blue-600" /> Paramètres du Restaurant
      </h1>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        
        {/* Nom du Restaurant */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Nom de l'établissement</label>
          <input 
            type="text" 
            value={restaurant.name}
            onChange={(e) => setRestaurant({...restaurant, name: e.target.value})}
            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
          />
        </div>

        {/* Couleur de Marque */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
            <Palette size={16}/> Couleur Principale (Marque)
          </label>
          <div className="flex items-center gap-4">
            <input 
              type="color" 
              value={restaurant.brand_color || "#000000"}
              onChange={(e) => setRestaurant({...restaurant, brand_color: e.target.value})}
              className="h-12 w-24 rounded cursor-pointer border-none"
            />
            <span className="text-slate-500 font-mono">{restaurant.brand_color}</span>
          </div>
        </div>

        {/* Bouton Sauvegarder */}
        <div className="pt-6 border-t border-slate-100">
          <button 
            type="submit" 
            disabled={saving}
            className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin"/> : <Save size={20} />}
            Enregistrer les modifications
          </button>
        </div>

      </form>
    </div>
  )
}