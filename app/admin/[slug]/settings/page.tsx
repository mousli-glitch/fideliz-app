"use client"

import { useState, useEffect } from "react"
import { updateRestaurantAction } from "@/app/actions/admin"
import { Loader2, Save, Store, Globe, Mail, Copy, Check } from "lucide-react"
import { useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

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

      if (data) {
        setRestaurant(data)
      }
      setLoading(false)
    }
    load()
  }, [params.slug])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateRestaurantAction(restaurant.id, {
        name: restaurant.name,
        contact_email: restaurant.contact_email,
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

        {/* SECTION 2 : LIEN PUBLIC */}
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
