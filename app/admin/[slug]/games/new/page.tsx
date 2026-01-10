"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { createGameAction } from "@/app/actions/create-game"
import { Loader2, Save, Layout, Gift, Palette, Clock, ArrowLeft, Sun, Moon, Rocket, Trash2, Plus, AlertCircle, CheckCircle, Check } from "lucide-react"
import Link from "next/link"
import GooglePlaceInput from "@/components/GooglePlaceInput"
import LogoUploader from "@/components/LogoUploader" 

// --- CONSTANTES ---
const BACKGROUNDS = [
  "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1605806616949-1e87b487bc2a?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=1000&auto=format&fit=crop",
]

// 🔥 NOUVELLE CONSTANTE : PALETTES LUXE
const PALETTES = [
    { id: 'MONACO', label: 'Monaco', c1: '#8B0000', c2: '#0F0F0F' },
    { id: 'GATSBY', label: 'Gatsby', c1: '#1E3A8A', c2: '#0F0F0F' },
    { id: 'EMERALD', label: 'Emerald', c1: '#064E3B', c2: '#0F0F0F' },
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

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
      card_style: 'light',
      wheel_palette: 'MONACO' // 🔥 AJOUT INITIALISATION PALETTE
  })

  const [prizes, setPrizes] = useState([
    { label: "1 Café Offert", weight: 50 },
    { label: "-10% addition", weight: 30 },
    { label: "Dessert Offert", weight: 20 }
  ])

  const handleCreate = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!formData.name) {
        setActiveTab('INFOS')
        setErrorMsg("Le nom du jeu est obligatoire.")
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
    }
    
    if (formData.active_action === 'GOOGLE_REVIEW' && !formData.action_url.includes('google.com')) {
        setActiveTab('INFOS')
        setErrorMsg("Veuillez sélectionner un établissement Google valide via la recherche.")
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
    }

    if (formData.active_action !== 'GOOGLE_REVIEW' && !formData.action_url) {
        setActiveTab('INFOS')
        setErrorMsg("Veuillez coller le lien de votre page (Instagram, Facebook...).")
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
    }

    setSaving(true)
    
    try {
        const finalTextColor = designData.card_style === 'dark' ? '#FFFFFF' : '#0F172A'

        const cleanData = {
            slug: params.slug,
            form: { ...formData, min_spend: formData.has_min_spend ? formData.min_spend : 0 },
            design: { ...designData, text_color: finalTextColor },
            prizes: prizes.map(p => ({ label: p.label, color: "#000000", weight: Number(p.weight) }))
        }

        const res = await createGameAction(cleanData)
        
        if (!res.success) throw new Error(res.error)
        
        setSuccessMsg("Le jeu a bien été créé ! Redirection...")
        
        setTimeout(() => {
            router.push(`/admin/${params.slug}/games`)
            router.refresh()
        }, 1500)

    } catch (e: any) {
        setErrorMsg("Erreur lors de la création : " + e.message)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setSaving(false)
    }
  }

  if (successMsg) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 animate-in fade-in zoom-in duration-300 p-6 text-center">
            <div className="bg-white p-4 rounded-full shadow-lg mb-6">
                <CheckCircle size={64} className="text-green-500" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">Félicitations ! 🎉</h1>
            <p className="text-xl text-green-700 font-medium">{successMsg}</p>
            <p className="text-slate-400 mt-8 text-sm animate-pulse">Redirection vers vos jeux...</p>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
            <div>
                <Link href={`/admin/${params.slug}/games`} className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Annuler</Link>
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2">Nouveau Jeu <Rocket className="text-purple-600"/></h1>
            </div>
            <button 
                onClick={handleCreate} 
                disabled={saving} 
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} 
                Créer le jeu
            </button>
        </div>

        {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center gap-3 animate-in slide-in-from-top-2">
                <AlertCircle size={20} className="shrink-0" />
                <span className="font-bold">{errorMsg}</span>
            </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* ONGLETS */}
            <div className="flex border-b border-slate-200 bg-slate-50">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Layout size={18}/> Infos Jeu</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Palette size={18}/> Design & Logo</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Gift size={18}/> Lots (Roue)</button>
            </div>

            <div className="p-8">
                {activeTab === 'INFOS' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Nom du Jeu <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Roue de Noël 2024" 
                                    className={`w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 ${errorMsg && !formData.name ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`} 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Objectif (Action)</label>
                                <select 
                                    className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" 
                                    value={formData.active_action} 
                                    onChange={e => setFormData({...formData, active_action: e.target.value, action_url: ""})}
                                >
                                    <option value="GOOGLE_REVIEW">⭐ Avis Google (Recommandé)</option>
                                    <option value="INSTAGRAM">📸 S'abonner Instagram</option>
                                    <option value="FACEBOOK">👍 S'abonner Facebook</option>
                                    <option value="TIKTOK">🎵 S'abonner TikTok</option>
                                </select>
                            </div>
                        </div>

                        <div className={`bg-slate-50 p-6 rounded-xl border transition-all ${errorMsg && !formData.action_url ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                {formData.active_action === 'GOOGLE_REVIEW' ? 'Rechercher votre établissement * :' : 'Lien URL de votre page * :'}
                            </label>

                            {formData.active_action === 'GOOGLE_REVIEW' ? (
                                <div className="space-y-2">
                                    <GooglePlaceInput 
                                        onSelect={(url) => setFormData({...formData, action_url: url})} 
                                    />
                                    <p className="text-xs text-slate-500">
                                        💡 Tapez le nom de votre commerce. Le lien d'avis sera généré automatiquement.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input 
                                        type="url" 
                                        className="w-full p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                                        placeholder={`Collez ici le lien de votre profil ${formData.active_action.toLowerCase()}...`} 
                                        value={formData.action_url} 
                                        onChange={e => setFormData({...formData, action_url: e.target.value})}
                                    />
                                    <p className="text-xs text-slate-500">
                                        ℹ️ Le joueur sera redirigé vers ce lien après avoir tourné la roue.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Validité</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Validité du Gain (Jours)</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" 
                                        value={formData.validity_days} 
                                        onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Temps laissé au client pour récupérer son lot.</p>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-3 mb-3"><input type="checkbox" id="min_spend" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/><label htmlFor="min_spend" className="text-sm font-bold text-slate-700 cursor-pointer">Activer minimum commande</label></div>
                                    {formData.has_min_spend && (<div className="flex items-center gap-2"><span className="text-slate-400 font-bold">Min:</span><input type="number" className="w-full p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: 15" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/><span className="text-slate-400 font-bold">€</span></div>)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 2: DESIGN --- */}
                {activeTab === 'DESIGN' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        {/* 🔥 NOUVEAU BLOC : PALETTE DE LA ROUE LUXE */}
                        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2">
                                <Palette className="text-blue-600" size={24}/> Palette de la Roue Luxe
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {PALETTES.map((p) => (
                                    <div 
                                        key={p.id} 
                                        onClick={() => setDesignData({...designData, wheel_palette: p.id})} 
                                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${designData.wheel_palette === p.id ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                    >
                                        <div className="flex w-full h-10 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
                                            <div className="flex-1" style={{ backgroundColor: p.c1 }}></div>
                                            <div className="flex-1" style={{ backgroundColor: p.c2 }}></div>
                                        </div>
                                        <span className="font-bold text-sm flex items-center gap-2">
                                            {p.label} 
                                            {designData.wheel_palette === p.id && <Check size={16} className="text-blue-600"/>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 1. IDENTITÉ VISUELLE */}
                        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2">
                                <Palette className="text-blue-600" size={24}/> Identité Visuelle
                            </h3>
                            
                            <div className="space-y-8">
                                {/* SECTION LOGO */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                                        Logo du commerce
                                    </label>
                                    <div className="bg-white p-1 rounded-xl border border-slate-200">
                                        <LogoUploader 
                                            currentUrl={designData.logo_url} 
                                            onUrlChange={(url) => setDesignData({...designData, logo_url: url})} 
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2 ml-1">
                                        Conseil : Utilisez un format PNG transparent pour un meilleur rendu.
                                    </p>
                                </div>

                                <div className="w-full h-px bg-slate-200"></div>

                                {/* SECTION COULEUR */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                                        Couleur Principale
                                    </label>
                                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm w-full md:w-fit">
                                        <div className="relative group cursor-pointer">
                                            <input 
                                                type="color" 
                                                className="absolute inset-0 w-12 h-12 opacity-0 cursor-pointer z-10"
                                                value={designData.primary_color} 
                                                onChange={e => setDesignData({...designData, primary_color: e.target.value})}
                                            />
                                            <div 
                                                className="w-12 h-12 rounded-lg shadow-inner border border-slate-200 ring-2 ring-transparent group-hover:ring-blue-200 transition-all" 
                                                style={{ backgroundColor: designData.primary_color }}
                                            ></div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Code HEX</span>
                                            <input 
                                                type="text" 
                                                className="font-mono font-bold text-slate-800 outline-none uppercase w-24 bg-transparent text-lg" 
                                                value={designData.primary_color} 
                                                readOnly
                                            />
                                        </div>
                                        <div className="h-8 w-px bg-slate-200 mx-2"></div>
                                        <div className="text-xs text-slate-500 font-medium">
                                            Couleur des boutons<br/>et actions.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. THEME AU CHOIX */}
                        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2">
                                <Sun className="text-orange-500" size={24}/> Thème au choix
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* MODE CLAIR */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="font-bold text-center text-slate-700 text-lg">Mode Clair</h4>
                                    <div 
                                        onClick={() => setDesignData({...designData, card_style: 'light'})} 
                                        className={`cursor-pointer p-6 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-4 h-full ${designData.card_style !== 'dark' ? 'border-blue-600 bg-blue-50/50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                    >
                                        <div className="bg-white border border-slate-200 px-6 py-3 rounded-xl shadow-sm">
                                            <span className="text-slate-900 font-bold">Texte Noir</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-xs text-slate-400">Recommandé (Standard)</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* MODE SOMBRE */}
                                <div className="flex flex-col gap-3">
                                    <h4 className="font-bold text-center text-slate-700 text-lg">Mode Sombre</h4>
                                    <div 
                                        onClick={() => setDesignData({...designData, card_style: 'dark'})} 
                                        className={`cursor-pointer p-6 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-4 h-full ${designData.card_style === 'dark' ? 'border-blue-600 bg-slate-800 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                    >
                                        <div className="bg-slate-900 border border-slate-700 px-6 py-3 rounded-xl shadow-sm">
                                            <span className="text-white font-bold">Texte Blanc</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-xs text-slate-400">Élégant & Moderne</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. STYLE DU TITRE */}
                        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6">Style du Titre</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {TITLE_STYLES.map((style) => (
                                    <div key={style.id} onClick={() => setDesignData({...designData, title_style: style.id})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all ${designData.title_style === style.id ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                        <p className="font-bold text-sm mb-3 text-slate-700">{style.label}</p>
                                        <div className="text-xs bg-slate-900 text-white p-3 rounded-lg font-black italic shadow-inner tracking-wide">
                                            {style.preview}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. FOND D'ECRAN */}
                        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6">Fond d'écran</h3>
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Thèmes prédéfinis</label>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    {BACKGROUNDS.map((bg, index) => (
                                        <div key={index} onClick={() => setDesignData({...designData, bg_choice: index, bg_image_url: ''})} className={`relative aspect-[9/16] cursor-pointer rounded-xl overflow-hidden border-4 transition-all ${(!designData.bg_image_url && designData.bg_choice === index) ? 'border-blue-600 shadow-lg scale-105 z-10' : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105'}`}>
                                            <img src={bg} className="w-full h-full object-cover" alt="Fond" />
                                            {(!designData.bg_image_url && designData.bg_choice === index) && (
                                                <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                                                    <div className="bg-white rounded-full p-1.5 shadow-md">
                                                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-6 border-t border-slate-200">
                                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Ou image personnalisée</label>
                                <input 
                                    type="url" 
                                    className="w-full p-4 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-300" 
                                    value={designData.bg_image_url || ''} 
                                    onChange={e => setDesignData({...designData, bg_image_url: e.target.value})} 
                                    placeholder="https://mon-site.com/mon-fond.jpg" 
                                />
                                <p className="text-xs text-slate-400 mt-2 ml-1">L'URL personnalisée remplacera le thème choisi ci-dessus.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 3: LOTS --- */}
                {activeTab === 'LOTS' && (
                    <div className="space-y-6">
                        <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-sm mb-4 flex items-center gap-3"><Gift size={20}/> <span>Plus le <strong>"Poids"</strong> est élevé, plus le lot sort souvent.</span></div>
                        <div className="space-y-3">
                            {prizes.map((prize, index) => (
                                <div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center group hover:border-blue-300 transition-all">
                                    <div className="flex-1 w-full">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nom du lot</label>
                                        <input type="text" maxLength={15} value={prize.label} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].label = e.target.value; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent"/>
                                    </div>
                                    {/* 🔥 COULEUR INDIVIDUELLE SUPPRIMÉE ICI 🔥 */}
                                    <div className="w-full md:w-24">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center block">Poids</label>
                                        <input type="number" min="1" value={prize.weight} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].weight = parseInt(e.target.value) || 1; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent text-center"/>
                                    </div>
                                    <button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors self-end md:self-center">
                                        <Trash2 size={20}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", weight: 10 }])} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2">
                            <Plus size={20}/> Ajouter un lot
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}