"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { createGameAction } from "@/app/actions/create-game"
// 🔥 AJOUT : Import des icônes pour les messages
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
  
  // 🔥 AJOUT : États pour gérer les messages d'erreur et de succès
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
    { label: "1 Café Offert", color: "#3b82f6", weight: 50 },
    { label: "-10% addition", color: "#10b981", weight: 30 },
    { label: "Dessert Offert", color: "#f59e0b", weight: 20 }
  ])

  // 🔥 FONCTION RÉTABLIE POUR L'API GOOGLE
  const handleGoogleSelect = (url: string) => {
    setFormData(prev => ({ ...prev, action_url: url }))
  }

  // --- FONCTION DE CRÉATION ---
  const handleCreate = async () => {
    // Reset des messages
    setErrorMsg(null)
    setSuccessMsg(null)

    // 1. Validation Frontend (Affiche un bandeau rouge)
    if (!formData.name) {
        setActiveTab('INFOS') // On remet l'onglet infos pour montrer l'erreur
        setErrorMsg("Le nom du jeu est obligatoire.")
        // On scroll en haut pour voir l'erreur
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
        
        // Si le serveur renvoie une erreur
        if (!res.success) throw new Error(res.error)
        
        // ✅ SUCCÈS : On affiche le message vert et on redirige
        setSuccessMsg("Le jeu a bien été créé ! Redirection...")
        
        // On attend 1.5 seconde pour que l'utilisateur lise le message
        setTimeout(() => {
            router.push(`/admin/${params.slug}/games`)
            router.refresh()
        }, 1500)

    } catch (e: any) {
        setErrorMsg("Erreur lors de la création : " + e.message)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setSaving(false) // On arrête le chargement seulement si erreur
    }
  }

  // 🔥 ECRAN DE SUCCÈS (OVERLAY) 🔥
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER RESPONSIVE */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div>
                <Link href={`/admin/${params.slug}/games`} className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Annuler</Link>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2">Nouveau Jeu <Rocket className="text-purple-600" size={28}/></h1>
            </div>
            <button 
                onClick={handleCreate} 
                disabled={saving} 
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg active:scale-95 transition-all w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} 
                Créer le jeu
            </button>
        </div>

        {/* 🔥 BANDEAU D'ERREUR ROUGE (Si erreur) */}
        {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center gap-3 animate-in slide-in-from-top-2">
                <AlertCircle size={20} className="shrink-0" />
                <span className="font-bold text-sm">{errorMsg}</span>
            </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* ONGLETS RESPONSIVE (SCROLLABLE SUR MOBILE) */}
            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto scrollbar-hide">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 min-w-[120px] py-4 text-xs md:text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors shrink-0 ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Layout size={18}/> Infos Jeu</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 min-w-[120px] py-4 text-xs md:text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors shrink-0 ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Gift size={18}/> Lots (Roue)</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 min-w-[120px] py-4 text-xs md:text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors shrink-0 ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:bg-white/50'}`}><Palette size={18}/> Design & Logo</button>
            </div>

            <div className="p-4 md:p-8">
                
                {/* --- TAB 1: INFOS --- */}
                {activeTab === 'INFOS' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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

                        {/* SECTION GOOGLE / MANUEL */}
                        <div className={`bg-slate-50 p-4 md:p-6 rounded-xl border transition-all ${errorMsg && !formData.action_url ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                {formData.active_action === 'GOOGLE_REVIEW' ? 'Rechercher votre établissement * :' : 'Lien URL de votre page * :'}
                            </label>

                            {formData.active_action === 'GOOGLE_REVIEW' ? (
                                <div className="space-y-2">
                                    <GooglePlaceInput 
                                        onSelect={handleGoogleSelect} 
                                    />
                                    <p className="text-xs text-slate-500">
                                        💡 Tapez le nom de votre commerce. Le lien d'avis sera généré automatiquement.
                                    </p>
                                    {formData.action_url && (
                                        <div className="mt-2 p-2 bg-green-50 text-green-700 text-[10px] rounded border border-green-100 truncate font-mono">
                                            Lien lié : {formData.action_url}
                                        </div>
                                    )}
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
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Validité</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
                                    <div className="flex items-center gap-3 mb-3">
                                        <input type="checkbox" id="min_spend_check" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/>
                                        <label htmlFor="min_spend_check" className="text-sm font-bold text-slate-700 cursor-pointer">Activer minimum commande</label>
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

                {/* --- TAB 2: LOTS (AVEC COULEUR ROUE DÉPLACÉE) --- */}
                {activeTab === 'LOTS' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        {/* 🔥 COULEURS DE LA ROUE (POSITIONNÉ ICI ET RENOMMÉ) */}
                        <div className="bg-slate-50 p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2">
                                <Palette className="text-blue-600" size={24}/> Couleurs de la roue
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                                {PALETTES.map((p) => (
                                    <div 
                                        key={p.id} 
                                        onClick={() => setDesignData({...designData, wheel_palette: p.id})} 
                                        className={`cursor-pointer p-3 md:p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${designData.wheel_palette === p.id ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                    >
                                        <div className="flex w-full h-10 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
                                            <div className="flex-1" style={{ backgroundColor: p.c1 }}></div>
                                            <div className="flex-1" style={{ backgroundColor: p.c2 }}></div>
                                        </div>
                                        <span className="font-bold text-xs md:text-sm flex items-center gap-2">
                                            {p.label} 
                                            {designData.wheel_palette === p.id && <Check size={16} className="text-blue-600"/>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CONFIGURATION DES LOTS */}
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-xs md:text-sm flex items-center gap-3">
                                <Gift size={20} className="shrink-0"/> 
                                <span>Gérez vos lots. Le <strong>"Poids"</strong> définit la rareté (ex: 100 est plus fréquent que 1).</span>
                            </div>
                            
                            <div className="space-y-3">
                                {prizes.map((prize, index) => (
                                    <div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center group hover:border-blue-300 transition-all">
                                        <div className="flex-1 w-full">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nom du lot</label>
                                            <input type="text" maxLength={15} value={prize.label} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].label = e.target.value; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent"/>
                                        </div>
                                        <div className="w-full md:w-24 text-center">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Poids</label>
                                            <input type="number" min="1" value={prize.weight} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].weight = parseInt(e.target.value) || 1; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent text-center"/>
                                        </div>
                                        <button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors self-end md:self-center">
                                            <Trash2 size={20}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            
                            {/* 🔥 FIX : Ajout de color: "#000000" pour supprimer l'erreur TS */}
                            <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", color: "#000000", weight: 10 }])} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2">
                                <Plus size={20}/> Ajouter un lot
                            </button>
                        </div>
                    </div>
                )}

                {/* --- TAB 3: DESIGN --- */}
                {activeTab === 'DESIGN' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        <div className="bg-slate-50 p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2">
                                <Palette className="text-blue-600" size={24}/> Identité Visuelle
                            </h3>
                            
                            <div className="space-y-8">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Logo du commerce</label>
                                    <LogoUploader currentUrl={designData.logo_url} onUrlChange={(url) => setDesignData({...designData, logo_url: url})} />
                                    <p className="text-xs text-slate-400 mt-2 ml-1">Conseil : Utilisez un format PNG transparent pour un meilleur rendu.</p>
                                </div>

                                <div className="w-full h-px bg-slate-200"></div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Couleur Principale</label>
                                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm w-full md:w-fit">
                                        <div className="relative group cursor-pointer">
                                            <input type="color" className="absolute inset-0 w-12 h-12 opacity-0 cursor-pointer z-10" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/>
                                            <div className="w-12 h-12 rounded-lg shadow-inner border border-slate-200" style={{ backgroundColor: designData.primary_color }}></div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Code HEX</span>
                                            <input type="text" className="font-mono font-bold text-slate-800 outline-none uppercase w-24 bg-transparent text-lg" value={designData.primary_color} readOnly/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2"><Sun className="text-orange-500" size={24}/> Thème au choix</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                                <div onClick={() => setDesignData({...designData, card_style: 'light'})} className={`cursor-pointer p-4 md:p-6 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-4 ${designData.card_style !== 'dark' ? 'border-blue-600 bg-blue-50/50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>Mode Clair</div>
                                <div onClick={() => setDesignData({...designData, card_style: 'dark'})} className={`cursor-pointer p-4 md:p-6 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-4 ${designData.card_style === 'dark' ? 'border-blue-600 bg-slate-800 shadow-md text-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}>Mode Sombre</div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6">Style du Titre</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {TITLE_STYLES.map((style) => (
                                    <div key={style.id} onClick={() => setDesignData({...designData, title_style: style.id})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all ${designData.title_style === style.id ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-600' : 'border-slate-200 bg-white'}`}>
                                        <p className="font-bold text-xs md:text-sm mb-3 text-slate-700">{style.label}</p>
                                        <div className="text-[10px] md:text-xs bg-slate-900 text-white p-2 rounded-lg font-black italic">{style.preview}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="font-black text-xl text-slate-900 mb-6">Fond d'écran</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 md:gap-4">
                                {BACKGROUNDS.map((bg, index) => (
                                    <div key={index} onClick={() => setDesignData({...designData, bg_choice: index, bg_image_url: ''})} className={`relative aspect-[9/16] cursor-pointer rounded-xl overflow-hidden border-4 transition-all ${(!designData.bg_image_url && designData.bg_choice === index) ? 'border-blue-600 shadow-lg scale-105 z-10' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                                        <img src={bg} className="w-full h-full object-cover" alt="Fond" />
                                    </div>
                                ))}
                            </div>
                            <div className="pt-6 border-t border-slate-200 mt-6">
                                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Ou image personnalisée</label>
                                <input type="url" className="w-full p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" value={designData.bg_image_url || ''} onChange={e => setDesignData({...designData, bg_image_url: e.target.value})} placeholder="https://..." />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}