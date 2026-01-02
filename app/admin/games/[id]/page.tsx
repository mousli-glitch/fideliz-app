"use client"

import { useState, useEffect, use } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
// IMPORTANT : On importe la nouvelle action créée juste avant
import { updateGameAction } from "@/app/actions/update-game"
import { Loader2, Save, Layout, Gift, Palette, Image as ImageIcon, Clock, ArrowLeft, Trash2, Plus } from "lucide-react"
import Link from "next/link"

export default function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = use(params)
  const supabase = createClient()
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'INFOS' | 'DESIGN' | 'LOTS'>('INFOS')
  const [restaurantId, setRestaurantId] = useState("")

  const [formData, setFormData] = useState<any>({})
  const [designData, setDesignData] = useState<any>({})
  const [prizes, setPrizes] = useState<any[]>([])

  // Chargement des données initiales
  useEffect(() => {
    const fetchGame = async () => {
      // 1. Le Jeu
      const { data: game } = await (supabase.from("games") as any).select("*").eq("id", gameId).single()
      if (!game) return
      
      setFormData({
        name: game.name,
        active_action: game.active_action,
        action_url: game.action_url,
        validity_days: game.validity_days || 30,
        min_spend: game.min_spend || 0,
        has_min_spend: (game.min_spend || 0) > 0
      })
      setRestaurantId(game.restaurant_id)

      // 2. Le Restaurant (Design)
      const { data: resto } = await (supabase.from("public_restaurants") as any).select("*").eq("id", game.restaurant_id).single()
      if (resto) {
        setDesignData({
            brand_color: resto.brand_color || "#000000",
            text_color: resto.text_color || "#ffffff",
            primary_color: resto.primary_color || "#E11D48",
            logo_url: resto.logo_url || "",
            bg_image_url: resto.bg_image_url || ""
        })
      }

      // 3. Les Lots
      const { data: gamePrizes } = await (supabase.from("prizes") as any).select("*").eq("game_id", gameId).order('weight', {ascending: false})
      setPrizes(gamePrizes || [])
      setLoading(false)
    }
    fetchGame()
  }, [gameId])

  // Action de sauvegarde
  const handleUpdate = async () => {
    setSaving(true)
    try {
        const cleanData = {
            restaurant_id: restaurantId,
            form: { ...formData, min_spend: formData.has_min_spend ? formData.min_spend : 0 },
            design: designData,
            prizes: prizes.map(p => ({ label: p.label, color: p.color, weight: Number(p.weight) }))
        }

        const res = await updateGameAction(gameId, cleanData)
        if (!res.success) throw new Error(res.error)
        
        alert("✅ Jeu et design mis à jour avec succès !")
        router.push("/admin/games") 
        router.refresh()
    } catch (e: any) {
        alert("Erreur lors de la sauvegarde : " + e.message)
    } finally {
        setSaving(false)
    }
  }

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin w-10 h-10 text-slate-400"/></div>

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <div>
                <Link href="/admin/games" className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold">
                    <ArrowLeft size={16}/> Retour à la liste
                </Link>
                <h1 className="text-3xl font-black text-slate-900">Modifier le Jeu ✏️</h1>
            </div>
            <button onClick={handleUpdate} disabled={saving} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} Enregistrer tout
            </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* Onglets de navigation */}
            <div className="flex border-b border-slate-200 bg-slate-50">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Layout size={18}/> Infos Jeu</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Palette size={18}/> Design & Logo</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Gift size={18}/> Lots (Roue)</button>
            </div>

            <div className="p-8">
                
                {/* --- ONGLET 1 : INFOS --- */}
                {activeTab === 'INFOS' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Nom de la campagne</label><input type="text" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}/></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Action cible</label><select className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.active_action} onChange={e => setFormData({...formData, active_action: e.target.value})}><option value="GOOGLE_REVIEW">Avis Google</option><option value="INSTAGRAM">Instagram</option><option value="FACEBOOK">Facebook</option><option value="TIKTOK">TikTok</option></select></div>
                        </div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-2">Lien URL (Avis ou Profil)</label><input type="url" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={formData.action_url} onChange={e => setFormData({...formData, action_url: e.target.value})}/></div>
                        
                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Validité & Conditions</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div><label className="block text-sm font-bold text-slate-700 mb-2">Validité du ticket (Jours)</label><input type="number" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.validity_days} onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}/></div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-3 mb-3">
                                        <input type="checkbox" id="min_spend" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/>
                                        <label htmlFor="min_spend" className="text-sm font-bold text-slate-700 cursor-pointer">Activer un minimum de commande</label>
                                    </div>
                                    {formData.has_min_spend && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-400 font-bold">Min:</span>
                                            <input type="number" className="w-full p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: 15" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/>
                                            <span className="text-slate-400 font-bold">€</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ONGLET 2 : DESIGN --- */}
                {activeTab === 'DESIGN' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur de Fond</label><div className="flex gap-2"><input type="color" className="h-10 w-10 rounded border cursor-pointer shadow-sm" value={designData.brand_color} onChange={e => setDesignData({...designData, brand_color: e.target.value})}/><input type="text" className="flex-1 p-2 border rounded bg-slate-50 text-sm font-mono" value={designData.brand_color} readOnly/></div></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur Texte</label><div className="flex gap-2"><input type="color" className="h-10 w-10 rounded border cursor-pointer shadow-sm" value={designData.text_color} onChange={e => setDesignData({...designData, text_color: e.target.value})}/><input type="text" className="flex-1 p-2 border rounded bg-slate-50 text-sm font-mono" value={designData.text_color} readOnly/></div></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur Principale (Boutons)</label><div className="flex gap-2"><input type="color" className="h-10 w-10 rounded border cursor-pointer shadow-sm" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/><input type="text" className="flex-1 p-2 border rounded bg-slate-50 text-sm font-mono" value={designData.primary_color} readOnly/></div></div>
                        </div>
                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><ImageIcon size={20} className="text-slate-400"/> Images</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Logo URL (Apparaîtra au centre de la roue)</label>
                                    <div className="flex gap-4 items-center">
                                        <input type="url" className="flex-1 p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={designData.logo_url} onChange={e => setDesignData({...designData, logo_url: e.target.value})}/>
                                        {designData.logo_url && <img src={designData.logo_url} alt="Preview" className="w-12 h-12 rounded-full border-2 border-slate-200 object-cover shadow-sm"/>}
                                    </div>
                                </div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-2">Image de Fond URL (Optionnel)</label><input type="url" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={designData.bg_image_url} onChange={e => setDesignData({...designData, bg_image_url: e.target.value})}/></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ONGLET 3 : LOTS --- */}
                {activeTab === 'LOTS' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-sm mb-4 flex items-center gap-3">
                            <Gift size={20}/> <span>Plus le <strong>"Poids"</strong> est élevé, plus le lot a de chances d'être gagné.</span>
                        </div>
                        
                        <div className="space-y-3">
                            {prizes.map((prize, index) => (
                                <div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center group hover:border-blue-300 transition-all">
                                    <div className="flex-1 w-full">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nom du lot (Max 12 cars)</label>
                                        <input type="text" maxLength={15} value={prize.label} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].label = e.target.value; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent"/>
                                    </div>
                                    <div className="w-full md:w-auto">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Couleur</label>
                                        <div className="flex gap-2 mt-1 items-center">
                                            <input type="color" value={prize.color} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].color = e.target.value; setPrizes(newPrizes); }} className="h-9 w-14 rounded cursor-pointer border shadow-sm"/>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-24">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Poids</label>
                                        <input type="number" min="1" value={prize.weight} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].weight = parseInt(e.target.value) || 1; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent text-center"/>
                                    </div>
                                    <button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors self-end md:self-center">
                                        <Trash2 size={20}/>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", color: "#3b82f6", weight: 10 }])} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2">
                            <Plus size={20}/> Ajouter un lot à la roue
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}