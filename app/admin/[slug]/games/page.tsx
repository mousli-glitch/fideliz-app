"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { createGameAction } from "@/app/actions/create-game"
import { Loader2, Save, Layout, Gift, Palette, Clock, ArrowLeft, Trash2, Plus, Rocket } from "lucide-react"
import Link from "next/link"

const BACKGROUNDS = [
  "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1605806616949-1e87b487bc2a?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=1000&auto=format&fit=crop",
]

const TITLE_STYLES = [
  { id: 'STYLE_1', label: 'Tentez votre / CHANCE (Néon)', preview: 'CHANCE !' },
  { id: 'STYLE_2', label: 'Jouez / POUR GAGNER', preview: 'POUR GAGNER' },
  { id: 'STYLE_3', label: 'Tournez / ET GAGNEZ', preview: 'ET GAGNEZ !' },
]

export default function NewGamePage() {
  const params = useParams()
  const router = useRouter()
  
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'INFOS' | 'DESIGN' | 'LOTS'>('INFOS')

  const [formData, setFormData] = useState({
    name: "",
    active_action: "GOOGLE_REVIEW",
    action_url: "",
    validity_days: 30, 
    min_spend: 0,
    has_min_spend: false
  })

  const [designData, setDesignData] = useState({
      primary_color: "#E11D48", 
      logo_url: "",
      bg_choice: 0,
      title_style: 'STYLE_1',
      bg_image_url: "",
      card_style: 'light'
  })

  const [prizes, setPrizes] = useState([
    { label: "1 Café Offert", color: "#3b82f6", weight: 50 },
    { label: "-10% addition", color: "#10b981", weight: 30 },
    { label: "Dessert Offert", color: "#f59e0b", weight: 20 }
  ])

  // --- FONCTION DE CRÉATION AVEC MOUCHARDS ---
  const handleCreate = async () => {
    // 1. TEST CLICK
    alert("1. Bouton cliqué ! Je vérifie les données...")

    if (!formData.name) return alert("❌ Erreur : Veuillez donner un nom à votre campagne.")
    if (!formData.action_url) return alert("❌ Erreur : Veuillez mettre le lien URL.")

    setSaving(true)
    try {
        const cleanData = {
            slug: params.slug, 
            form: { ...formData, min_spend: formData.has_min_spend ? formData.min_spend : 0 },
            design: designData,
            prizes: prizes.map(p => ({ label: p.label, color: p.color, weight: Number(p.weight) }))
        }

        alert("2. Envoi au serveur en cours...") // Confirme que ça part bien
        
        const res = await createGameAction(cleanData)
        
        if (!res.success) {
            throw new Error(res.error)
        }
        
        alert("3. Succès ! Redirection...")
        router.push(`/admin/${params.slug}/games`)
        router.refresh()

    } catch (e: any) {
        console.error(e)
        alert("🚨 ERREUR SERVEUR : " + e.message)
    } finally {
        setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex items-center justify-between mb-8">
            <div>
                <Link href={`/admin/${params.slug}/games`} className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Annuler</Link>
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2">Nouveau Jeu <Rocket className="text-purple-600"/></h1>
            </div>
            
            {/* LE BOUTON CRITIQUE */}
            <button 
                type="button" // Ajout de sécurité
                onClick={handleCreate} 
                disabled={saving} 
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg active:scale-95 transition-all"
            >
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} 
                Créer le jeu
            </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Layout size={18}/> Infos Jeu</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Palette size={18}/> Design & Logo</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Gift size={18}/> Lots (Roue)</button>
            </div>

            <div className="p-8">
                {activeTab === 'INFOS' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Nom de la campagne</label><input type="text" placeholder="Ex: Campagne Avis Google" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}/></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Action cible</label><select className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.active_action} onChange={e => setFormData({...formData, active_action: e.target.value})}><option value="GOOGLE_REVIEW">Avis Google</option><option value="INSTAGRAM">Instagram</option><option value="FACEBOOK">Facebook</option><option value="TIKTOK">TikTok</option></select></div>
                        </div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-2">Lien URL</label><input type="url" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={formData.action_url} onChange={e => setFormData({...formData, action_url: e.target.value})}/></div>
                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Validité</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div><label className="block text-sm font-bold text-slate-700 mb-2">Validité (Jours)</label><input type="number" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.validity_days} onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}/></div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-3 mb-3"><input type="checkbox" id="min_spend" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/><label htmlFor="min_spend" className="text-sm font-bold text-slate-700 cursor-pointer">Activer minimum commande</label></div>
                                    {formData.has_min_spend && (<div className="flex items-center gap-2"><span className="text-slate-400 font-bold">Min:</span><input type="number" className="w-full p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: 15" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/><span className="text-slate-400 font-bold">€</span></div>)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'DESIGN' && (
                    <div className="space-y-6">
                        {/* CONTENU DESIGN */}
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                            <h3 className="font-bold text-lg text-slate-900 mb-4">Identité Visuelle</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold text-slate-700 mb-2">Logo URL</label><div className="flex gap-4 items-center"><input type="url" className="flex-1 p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." value={designData.logo_url} onChange={e => setDesignData({...designData, logo_url: e.target.value})}/>{designData.logo_url && <img src={designData.logo_url} alt="Preview" className="w-12 h-12 rounded-full border-2 border-slate-200 object-cover shadow-sm bg-white"/>}</div></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-2">Couleur Boutons (Action)</label><div className="flex gap-2"><input type="color" className="h-12 w-16 rounded cursor-pointer border shadow-sm" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/><input type="text" className="flex-1 p-3 border rounded-xl bg-white text-sm font-mono" value={designData.primary_color} readOnly/></div></div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h3 className="font-bold text-lg text-slate-900 mb-4">Contraste des Cartes</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div onClick={() => setDesignData({...designData, card_style: 'light'})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-2 ${designData.card_style !== 'dark' ? 'border-blue-600 bg-white shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="bg-white border border-slate-200 px-6 py-3 rounded-lg shadow-sm w-full max-w-[200px]"><span className="text-slate-900 font-bold text-sm">Texte Noir</span></div><p className="text-xs font-bold text-slate-500 mt-1">Cartes Claires (Standard)</p></div>
                                <div onClick={() => setDesignData({...designData, card_style: 'dark'})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-2 ${designData.card_style === 'dark' ? 'border-blue-600 bg-slate-900 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-slate-900 hover:border-slate-500'}`}><div className="bg-slate-800 border border-slate-700 px-6 py-3 rounded-lg shadow-sm w-full max-w-[200px]"><span className="text-white font-bold text-sm">Texte Blanc</span></div><p className="text-xs font-bold text-slate-400 mt-1">Cartes Sombres (Pour logo blanc)</p></div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h3 className="font-bold text-lg text-slate-900 mb-4">Style du Titre</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {TITLE_STYLES.map((style) => (<div key={style.id} onClick={() => setDesignData({...designData, title_style: style.id})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all ${designData.title_style === style.id ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}><p className="font-bold text-sm mb-2 text-slate-700">{style.label}</p><div className="text-xs bg-slate-900 text-white p-2 rounded font-black italic">{style.preview}</div></div>))}
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h3 className="font-bold text-lg text-slate-900 mb-4">Fond d'écran</h3>
                            <div className="mb-6"><label className="block text-sm font-bold text-slate-700 mb-3">Choisir un thème :</label><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{BACKGROUNDS.map((bg, index) => (<div key={index} onClick={() => setDesignData({...designData, bg_choice: index, bg_image_url: ''})} className={`relative aspect-[9/16] cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${(!designData.bg_image_url && designData.bg_choice === index) ? 'border-blue-600 ring-2 ring-blue-200 scale-105 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'}`}><img src={bg} className="w-full h-full object-cover" alt="Fond" />{(!designData.bg_image_url && designData.bg_choice === index) && (<div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center"><div className="bg-white rounded-full p-1 shadow-sm"><div className="w-2 h-2 bg-blue-600 rounded-full"></div></div></div>)}</div>))}</div></div>
                            <div className="pt-4 border-t border-slate-200"><label className="block text-sm font-bold text-slate-700 mb-2">Ou fond personnalisé (URL) :</label><input type="url" className="w-full p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" value={designData.bg_image_url || ''} onChange={e => setDesignData({...designData, bg_image_url: e.target.value})} placeholder="https://..." /><p className="text-xs text-slate-400 mt-2">Remplace le thème si rempli.</p></div>
                        </div>
                    </div>
                )}

                {activeTab === 'LOTS' && (
                    <div className="space-y-6">
                        {/* CONTENU LOTS */}
                        <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-sm mb-4 flex items-center gap-3"><Gift size={20}/> <span>Plus le <strong>"Poids"</strong> est élevé, plus le lot sort souvent.</span></div>
                        <div className="space-y-3">{prizes.map((prize, index) => (<div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center group hover:border-blue-300 transition-all"><div className="flex-1 w-full"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nom</label><input type="text" maxLength={15} value={prize.label} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].label = e.target.value; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent"/></div><div className="w-full md:w-auto"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Couleur</label><div className="flex gap-2 mt-1 items-center"><input type="color" value={prize.color} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].color = e.target.value; setPrizes(newPrizes); }} className="h-9 w-14 rounded cursor-pointer border shadow-sm"/></div></div><div className="w-full md:w-24"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Poids</label><input type="number" min="1" value={prize.weight} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].weight = parseInt(e.target.value) || 1; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent text-center"/></div><button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors self-end md:self-center"><Trash2 size={20}/></button></div>))}</div>
                        <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", color: "#3b82f6", weight: 10 }])} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2"><Plus size={20}/> Ajouter un lot</button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}