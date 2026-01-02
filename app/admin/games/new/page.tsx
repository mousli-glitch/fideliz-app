"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { createGameAction } from "@/app/actions/create-game" // Assure-toi que ce fichier existe et gère le design
import { Loader2, Plus, Trash2, ArrowLeft, Layout, Palette, Gift, Image as ImageIcon, Clock } from "lucide-react"
import Link from "next/link"

export default function NewGamePage() {
  const supabase = createClient()
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'INFOS' | 'DESIGN' | 'LOTS'>('INFOS')

  // Formulaire Infos
  const [formData, setFormData] = useState({
    name: "", active_action: "GOOGLE_REVIEW", action_url: "",
    validity_days: 30, has_min_spend: false, min_spend: 0
  })

  // Nouveau : Formulaire Design
  const [designData, setDesignData] = useState({
    brand_color: "#000000", text_color: "#ffffff", primary_color: "#E11D48",
    logo_url: "", bg_image_url: ""
  })

  // Lots (par défaut)
  const [prizes, setPrizes] = useState([
    { label: "Un Café Offert", color: "#3b82f6", weight: 50 },
    { label: "-10% sur l'addition", color: "#10b981", weight: 30 },
    { label: "Un Dessert Offert", color: "#f59e0b", weight: 20 }
  ])

  const handleCreate = async () => {
    if (!formData.name || !formData.action_url) { alert("Veuillez remplir le nom et l'URL de l'action."); return; }
    setCreating(true)
    try {
      // On récupère l'ID de l'admin connecté
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Non connecté")

      const cleanData = {
        admin_id: user.id,
        form: { ...formData, min_spend: formData.has_min_spend ? formData.min_spend : 0 },
        design: designData, // On envoie les données de design
        prizes: prizes.map(p => ({ label: p.label, color: p.color, weight: Number(p.weight) }))
      }

      // Action serveur qui doit gérer la création du resto AVEC le design
      const res = await createGameAction(cleanData)
      if (!res.success) throw new Error(res.error)
      
      alert("✅ Jeu créé avec succès !")
      router.push("/admin/games")
      router.refresh()
    } catch (e: any) {
      alert("Erreur: " + e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
            <div><Link href="/admin/games" className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Retour</Link><h1 className="text-3xl font-black text-slate-900">Nouveau Jeu 🎉</h1></div>
            <button onClick={handleCreate} disabled={creating} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">{creating ? <Loader2 className="animate-spin"/> : <Plus size={20}/>} Créer le jeu</button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Layout size={18}/> Infos Jeu</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Palette size={18}/> Design & Logo</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Gift size={18}/> Lots (Roue)</button>
            </div>

            <div className="p-8">
                {/* --- TAB INFOS --- */}
                {activeTab === 'INFOS' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Nom de la campagne</label><input type="text" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: Jeu Été 2024" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}/></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Action cible</label><select className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.active_action} onChange={e => setFormData({...formData, active_action: e.target.value})}><option value="GOOGLE_REVIEW">Avis Google</option><option value="INSTAGRAM">Instagram</option><option value="FACEBOOK">Facebook</option><option value="TIKTOK">TikTok</option></select></div>
                        </div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-2">Lien URL (Avis ou Profil)</label><input type="url" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://g.page/..." value={formData.action_url} onChange={e => setFormData({...formData, action_url: e.target.value})}/></div>
                        <div className="border-t border-slate-100 pt-6 mt-6"><h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Validité & Conditions</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="block text-sm font-bold text-slate-700 mb-2">Validité du ticket (Jours)</label><input type="number" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.validity_days} onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}/></div><div className="bg-slate-50 p-4 rounded-xl border border-slate-200"><div className="flex items-center gap-3 mb-3"><input type="checkbox" id="min_spend" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/><label htmlFor="min_spend" className="text-sm font-bold text-slate-700 cursor-pointer">Activer un minimum de commande</label></div>{formData.has_min_spend && (<div className="flex items-center gap-2"><span className="text-slate-400 font-bold">Min:</span><input type="number" className="w-full p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: 15" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/><span className="text-slate-400 font-bold">€</span></div>)}</div></div></div>
                    </div>
                )}

                {/* --- TAB DESIGN (NOUVEAU) --- */}
                {activeTab === 'DESIGN' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-yellow-50 border border-yellow-100 text-yellow-800 p-4 rounded-xl text-sm mb-4">Remplissez les URLs de votre logo et image de fond ici. Elles seront enregistrées à la création du jeu.</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur de Fond</label><div className="flex gap-2"><input type="color" className="h-10 w-10 rounded border cursor-pointer shadow-sm" value={designData.brand_color} onChange={e => setDesignData({...designData, brand_color: e.target.value})}/><input type="text" className="flex-1 p-2 border rounded bg-slate-50 text-sm font-mono" value={designData.brand_color} readOnly/></div></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur Texte</label><div className="flex gap-2"><input type="color" className="h-10 w-10 rounded border cursor-pointer shadow-sm" value={designData.text_color} onChange={e => setDesignData({...designData, text_color: e.target.value})}/><input type="text" className="flex-1 p-2 border rounded bg-slate-50 text-sm font-mono" value={designData.text_color} readOnly/></div></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur Principale</label><div className="flex gap-2"><input type="color" className="h-10 w-10 rounded border cursor-pointer shadow-sm" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/><input type="text" className="flex-1 p-2 border rounded bg-slate-50 text-sm font-mono" value={designData.primary_color} readOnly/></div></div>
                        </div>
                        <div className="border-t border-slate-100 pt-6 mt-6"><h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><ImageIcon size={20} className="text-slate-400"/> Images (URLs)</h3><div className="space-y-4"><div><label className="block text-sm font-bold text-slate-700 mb-2">Logo URL (Apparaîtra au centre de la roue)</label><div className="flex gap-4 items-center"><input type="url" className="flex-1 p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={designData.logo_url} onChange={e => setDesignData({...designData, logo_url: e.target.value})}/>{designData.logo_url && <img src={designData.logo_url} alt="Preview" className="w-12 h-12 rounded-full border-2 border-slate-200 object-cover shadow-sm"/>}</div></div><div><label className="block text-sm font-bold text-slate-700 mb-2">Image de Fond URL (Optionnel)</label><input type="url" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={designData.bg_image_url} onChange={e => setDesignData({...designData, bg_image_url: e.target.value})}/></div></div></div>
                    </div>
                )}

                {/* --- TAB LOTS --- */}
                {activeTab === 'LOTS' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-sm mb-4 flex items-center gap-3"><Gift size={20}/> <span>Configurez les lots de départ. Vous pourrez les modifier plus tard.</span></div>
                        <div className="space-y-3">{prizes.map((prize, index) => (<div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center group hover:border-blue-300 transition-all"><div className="flex-1 w-full"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nom du lot</label><input type="text" maxLength={15} value={prize.label} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].label = e.target.value; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent"/></div><div className="w-full md:w-auto"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Couleur</label><div className="flex gap-2 mt-1 items-center"><input type="color" value={prize.color} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].color = e.target.value; setPrizes(newPrizes); }} className="h-9 w-14 rounded cursor-pointer border shadow-sm"/></div></div><div className="w-full md:w-24"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Poids</label><input type="number" min="1" value={prize.weight} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].weight = parseInt(e.target.value) || 1; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent text-center"/></div><button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors self-end md:self-center"><Trash2 size={20}/></button></div>))}</div>
                        <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", color: "#3b82f6", weight: 10 }])} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2"><Plus size={20}/> Ajouter un lot</button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}