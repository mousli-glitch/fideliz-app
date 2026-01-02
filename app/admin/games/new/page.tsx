"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getAdminRestaurant, createGameAction } from "../../../actions/admin" // Import relatif (remonte de 3)
import { Loader2, ArrowLeft, Gamepad2 } from "lucide-react"
import Link from "next/link"

export default function NewGamePage() {
  const router = useRouter()
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    active_action: "GOOGLE_REVIEW", // ou 'INSTAGRAM'
    action_url: ""
  })

  // On récupère l'ID du restaurant au chargement
  useEffect(() => {
    getAdminRestaurant().then(setRestaurant)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurant) return

    setLoading(true)
    try {
      const newGame = await createGameAction(
        restaurant.id,
        formData.name,
        formData.active_action,
        formData.action_url
      )
      // Redirection vers la page du jeu pour ajouter les lots
      router.push(`/admin/games/${newGame.id}`)
    } catch (err) {
      alert("Erreur lors de la création")
      setLoading(false)
    }
  }

  if (!restaurant) return <div className="p-10 text-center"><Loader2 className="animate-spin inline"/> Chargement...</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/admin/games" className="flex items-center gap-2 text-slate-500 mb-6 hover:text-slate-800">
        <ArrowLeft size={20}/> Retour
      </Link>

      <h1 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-3">
        <Gamepad2 className="text-purple-600"/> Nouveau Jeu
      </h1>

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        
        {/* Nom */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Nom du jeu</label>
          <input 
            required
            type="text" 
            placeholder="Ex: Jeu Été 2026"
            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
          />
        </div>

        {/* Type d'action */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Type d'objectif</label>
          <div className="grid grid-cols-2 gap-4">
            <button
                type="button"
                onClick={() => setFormData({...formData, active_action: 'GOOGLE_REVIEW'})}
                className={`p-4 rounded-xl border-2 font-bold text-sm ${formData.active_action === 'GOOGLE_REVIEW' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-100 hover:border-slate-300'}`}
            >
                ⭐ Avis Google
            </button>
            <button
                type="button"
                onClick={() => setFormData({...formData, active_action: 'INSTAGRAM'})}
                className={`p-4 rounded-xl border-2 font-bold text-sm ${formData.active_action === 'INSTAGRAM' ? 'border-pink-600 bg-pink-50 text-pink-700' : 'border-slate-100 hover:border-slate-300'}`}
            >
                📸 Instagram
            </button>
          </div>
        </div>

        {/* Lien */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            {formData.active_action === 'GOOGLE_REVIEW' ? "Lien vers vos avis Google" : "Lien vers votre profil Instagram"}
          </label>
          <input 
            required
            type="url" 
            placeholder="https://..."
            className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
            value={formData.action_url}
            onChange={e => setFormData({...formData, action_url: e.target.value})}
          />
          <p className="text-xs text-slate-400 mt-2">C'est le lien qui s'ouvrira quand le client cliquera.</p>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin"/> : "Créer et configurer les lots 👉"}
        </button>

      </form>
    </div>
  )
}