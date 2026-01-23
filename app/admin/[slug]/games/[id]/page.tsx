"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Loader2, Save, Layout, Gift, Palette, Clock, ArrowLeft, Trash2, Sun, Plus, CheckCircle, AlertCircle, Calendar, Package, Wand2 } from "lucide-react"
import Link from "next/link"
import GooglePlaceInput from "@/components/GooglePlaceInput"
import LogoUploader from "@/components/LogoUploader" 
import { updateGameAction } from "@/app/actions/update-game"
import BackgroundUploader from "@/components/BackgroundUploader"

// --- LES 10 FONDS D'ÉCRAN SUPABASE ---
const BACKGROUNDS = [
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/29bb90d7-ca1b-4953-9142-786b7744f59c.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/64f68220-f9ae-4dc1-994f-d9f0e972aad4.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/acb25ead-177c-4fc4-9ca7-9ba9ad9eb1a3.png",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/closeup-romantic-purple-hearts-glitter-valentines-day-shiny-background-luxury-elegant-style-3d-illustration-holiday.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/drawing-hamburgers-with-toothpick-background.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/neon-circle-smoke-clouds.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/sakura-backgrounds-outdoors-blossom.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/triangular-slices-chicago-style-pizza-with-hot-sauce-transparent-background.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/vibrant-abstract-paint-strokes-bold-colors-creating-dynamic-energetic-artistic-background.jpg",
  "https://kzeuplszcqjqaqohfbzk.supabase.co/storage/v1/object/public/backgrounds/wallpaper-ios-10.3-ipad-retina.jpg"
]

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

export default function EditGamePage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'INFOS' | 'DESIGN' | 'LOTS'>('INFOS')

  const [gameId, setGameId] = useState<string>("")
  const [restaurantId, setRestaurantId] = useState<string>("") 
  
  // 🔥 AJOUT DES NOUVEAUX CHAMPS DANS FORM DATA
  const [formData, setFormData] = useState<any>({
    name: "",
    active_action: "GOOGLE_REVIEW",
    action_url: "",
    validity_days: 30, 
    min_spend: 0,
    has_min_spend: false,
    // Nouveaux champs
    is_date_limit_active: false,
    start_date: "",
    end_date: "",
    is_stock_limit_active: false
  })

  const [designData, setDesignData] = useState<any>({
      primary_color: "#E11D48", 
      logo_url: "",
      bg_choice: 0,
      title_style: 'STYLE_1',
      bg_image_url: "",
      card_style: 'light',
      wheel_palette: 'MONACO' 
  })

  const [prizes, setPrizes] = useState<any[]>([])

  const totalWeight = useMemo(() => {
    return prizes.reduce((acc, p) => acc + (Number(p.weight) || 0), 0)
  }, [prizes])

  const isWeightValid = totalWeight === 100

  const autoBalance = () => {
    if (prizes.length === 0) return
    const equalShare = Math.floor(100 / prizes.length)
    const remainder = 100 % prizes.length
    const newPrizes = prizes.map((p, i) => ({
      ...p,
      weight: i === 0 ? equalShare + remainder : equalShare
    }))
    setPrizes(newPrizes)
  }

  const handleGoogleSelect = (url: string) => {
    setFormData((prev: any) => ({ ...prev, action_url: url }))
  }

  useEffect(() => {
    const loadGame = async () => {
        const idToLoad = params?.id
        if(!idToLoad) return;

        const { data: game } = await (supabase.from('games') as any).select('*').eq('id', idToLoad).single()
        
        if (game) {
            setGameId(game.id)
            setRestaurantId(game.restaurant_id) 
            
            const { data: restaurant } = await (supabase.from('restaurants') as any)
                .select('*')
                .eq('id', game.restaurant_id)
                .single()

            setFormData({
                name: game.name,
                active_action: game.active_action,
                action_url: game.action_url || "",
                validity_days: game.validity_days || 30,
                min_spend: game.min_spend ? Number(game.min_spend) : 0,
                has_min_spend: Number(game.min_spend) > 0,
                // Chargement des nouveaux champs
                is_date_limit_active: game.is_date_limit_active || false,
                start_date: game.start_date ? game.start_date.split('T')[0] : "",
                end_date: game.end_date ? game.end_date.split('T')[0] : "",
                is_stock_limit_active: game.is_stock_limit_active || false
            })

            const isDark = restaurant?.text_color === '#FFFFFF'

            setDesignData({
                primary_color: restaurant?.primary_color || "#E11D48",
                logo_url: restaurant?.logo_url || "",
                bg_choice: game.bg_choice || 0,
                title_style: game.title_style || 'STYLE_1',
                bg_image_url: game.bg_image_url || "",
                card_style: game.card_style || (isDark ? 'dark' : 'light'),
                wheel_palette: game.wheel_palette || 'MONACO'
            })

            const { data: prizesData } = await (supabase.from('prizes') as any)
                .select('*')
                .eq('game_id', game.id)
                .order('weight', {ascending: false})
            
            setPrizes(prizesData || [])
        }
        setLoading(false)
    }
    loadGame()
  }, [params, supabase])


  const handleUpdate = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!formData.name) {
        setActiveTab('INFOS')
        setErrorMsg("Veuillez donner un Nom au Jeu.")
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return 
    }
    
    if (!isWeightValid) {
        setActiveTab('LOTS')
        setErrorMsg(`Le total des probabilités doit être de 100% (Actuellement : ${totalWeight}%)`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return 
    }

    if (formData.active_action === 'GOOGLE_REVIEW' && formData.action_url && !formData.action_url.includes('google.com')) {
         setActiveTab('INFOS')
         setErrorMsg("❌ Veuillez sélectionner un établissement Google valide.")
         window.scrollTo({ top: 0, behavior: 'smooth' })
         return 
    }

    setSaving(true)

    try {
        const res = await updateGameAction(gameId, {
            restaurant_id: restaurantId,
            form: formData,
            design: designData,
            prizes: prizes.map((p: any) => ({ 
                ...p, 
                weight: Number(p.weight),
                // On assure que quantity est un nombre si activé, sinon null/0
                quantity: formData.is_stock_limit_active ? (p.quantity ? Number(p.quantity) : 0) : null
            }))
        })

        if (!res.success) throw new Error(res.error)

        setSuccessMsg("Le jeu a bien été modifié ! Redirection...")
        
        setTimeout(() => {
            router.push(`/admin/${params.slug}/games`)
            router.refresh()
        }, 1500)

    } catch (e: any) {
        setErrorMsg("Oups : " + e.message)
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
            <h1 className="text-3xl font-black text-slate-900 mb-2">Modifications enregistrées ! 🎉</h1>
            <p className="text-xl text-green-700 font-medium">{successMsg}</p>
            <p className="text-slate-400 mt-8 text-sm animate-pulse">Redirection vers vos jeux...</p>
        </div>
    )
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600"/></div>

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div>
                <Link href={`/admin/${params.slug}/games`} className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Retour</Link>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2">Modifier le Jeu ✏️</h1>
            </div>
            <button 
                onClick={handleUpdate} 
                disabled={saving || !isWeightValid} 
                className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all w-full sm:w-auto ${isWeightValid ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
            >
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} 
                Enregistrer tout {!isWeightValid && `(${totalWeight}%)`}
            </button>
        </div>

        {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center gap-3 animate-in slide-in-from-top-2">
                <AlertCircle size={20} className="shrink-0" />
                <span className="font-bold text-sm">{errorMsg}</span>
            </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
                                <label className="block text-sm font-bold text-slate-700 mb-2">Nom du Jeu</label>
                                <input type="text" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Objectif (Action)</label>
                                <select 
                                    className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" 
                                    value={formData.active_action} 
                                    onChange={e => setFormData({...formData, active_action: e.target.value})}
                                >
                                    <option value="GOOGLE_REVIEW">⭐ Avis Google (Recommandé)</option>
                                    <option value="INSTAGRAM">📸 S'abonner Instagram</option>
                                    <option value="FACEBOOK">👍 S'abonner Facebook</option>
                                    <option value="TIKTOK">🎵 S'abonner TikTok</option>
                                </select>
                            </div>
                        </div>

                        {/* --- BLOC DATES & PÉRIODE --- */}
                        <div className="bg-slate-50 p-4 md:p-6 rounded-xl border border-slate-200 transition-all">
                            <div className="flex items-center gap-3 mb-4">
                                <input 
                                    type="checkbox" 
                                    id="date_limit_toggle" 
                                    className="w-5 h-5 accent-blue-600 rounded" 
                                    checked={formData.is_date_limit_active} 
                                    onChange={e => setFormData({...formData, is_date_limit_active: e.target.checked})}
                                />
                                <label htmlFor="date_limit_toggle" className="text-sm font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
                                    <Calendar size={18} className="text-blue-600"/> 
                                    Activer une période de validité (Dates)
                                </label>
                            </div>

                            {formData.is_date_limit_active && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Date de début</label>
                                        <input 
                                            type="date" 
                                            className="w-full p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                                            value={formData.start_date} 
                                            onChange={e => setFormData({...formData, start_date: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Date de fin</label>
                                        <input 
                                            type="date" 
                                            className="w-full p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                                            value={formData.end_date} 
                                            onChange={e => setFormData({...formData, end_date: e.target.value})}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-50 p-4 md:p-6 rounded-xl border border-slate-200 transition-all">
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                {formData.active_action === 'GOOGLE_REVIEW' ? 'Rechercher votre établissement :' : 'Lien URL de votre page :'}
                            </label>

                            {formData.active_action === 'GOOGLE_REVIEW' ? (
                                <div className="space-y-2">
                                    <GooglePlaceInput 
                                        onSelect={handleGoogleSelect} 
                                        defaultValue={formData.action_url} 
                                    />
                                    <p className="text-xs text-blue-600 font-bold">
                                        💡 Tapez le nom de votre commerce pour mettre à jour le lien.
                                    </p>
                                    {formData.action_url && (
                                        <p className="text-[10px] text-green-600 truncate bg-green-50 p-1 rounded font-mono">
                                            Lien enregistré : {formData.action_url}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input 
                                        type="url" 
                                        className="w-full p-3 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                                        value={formData.action_url} 
                                        onChange={e => setFormData({...formData, action_url: e.target.value})}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Validité des Lots</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                <div><label className="block text-sm font-bold text-slate-700 mb-2">Validité du Gain (Jours)</label><input type="number" className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={formData.validity_days} onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}/></div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-3 mb-3"><input type="checkbox" id="min_spend_toggle" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/><label htmlFor="min_spend_toggle" className="text-sm font-bold text-slate-700 cursor-pointer">Activer minimum commande</label></div>
                                    {formData.has_min_spend && (<div className="flex items-center gap-2"><span className="text-slate-400 font-bold">Min:</span><input type="number" className="w-full p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/><span className="text-slate-400 font-bold">€</span></div>)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 2: LOTS --- */}
                {activeTab === 'LOTS' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        {/* OPTIONS STOCKS */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                id="stock_limit_toggle" 
                                className="w-5 h-5 accent-purple-600 rounded" 
                                checked={formData.is_stock_limit_active} 
                                onChange={e => setFormData({...formData, is_stock_limit_active: e.target.checked})}
                            />
                            <label htmlFor="stock_limit_toggle" className="text-sm font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
                                <Package size={18} className="text-purple-600"/> 
                                Activer la gestion des stocks (Quantités limitées)
                            </label>
                        </div>

                        {/* BARRE DE PROGRESSION 100% */}
                        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${isWeightValid ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                                    <span className="text-xs font-black uppercase tracking-tighter text-slate-300">Total Probabilités</span>
                                </div>
                                <span className={`text-2xl font-black ${isWeightValid ? 'text-green-500' : 'text-white'}`}>{totalWeight}%</span>
                            </div>
                            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-500 ${isWeightValid ? 'bg-green-500' : totalWeight > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(totalWeight, 100)}%` }}></div>
                            </div>
                            <div className="mt-4 flex justify-between items-center">
                                <p className="text-[10px] text-slate-500 font-black uppercase italic">
                                    {isWeightValid ? "Parfait ! La roue est équilibrée." : `Attention : Il reste ${100 - totalWeight}% à distribuer.`}
                                </p>
                                <button onClick={autoBalance} className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400 hover:text-white transition-colors bg-blue-500/10 px-3 py-1.5 rounded-lg"><Wand2 size={12}/> Répartir 100%</button>
                            </div>
                        </div>

                        {/* LISTE DES LOTS */}
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-xs md:text-sm flex items-center gap-3">
                                <Gift size={20} className="shrink-0"/> 
                                <span>Gérez vos lots. Le <strong>"Poids"</strong> définit la chance de gain (Total doit être 100%).</span>
                            </div>
                            <div className="space-y-3">
                                {prizes.map((prize, index) => (
                                    <div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm items-center group hover:border-blue-300 transition-all">
                                        <div className="flex-1 w-full">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nom du lot</label>
                                            <input type="text" maxLength={15} value={prize.label} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].label = e.target.value; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent"/>
                                        </div>
                                        
                                        {/* GESTION STOCK SI ACTIVÉE */}
                                        {formData.is_stock_limit_active && (
                                            <div className="w-full md:w-24">
                                                <label className="text-[10px] font-bold text-purple-500 uppercase tracking-wider text-center block">Stock</label>
                                                <input 
                                                    type="number" 
                                                    min="0" 
                                                    placeholder="∞"
                                                    value={prize.quantity || ""} 
                                                    onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].quantity = parseInt(e.target.value) || 0; setPrizes(newPrizes); }} 
                                                    className="w-full p-2 font-bold text-purple-700 border-b border-purple-200 focus:border-purple-500 outline-none bg-purple-50/50 text-center text-lg"
                                                />
                                            </div>
                                        )}

                                        <div className="w-full md:w-24">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center block">Chance (%)</label>
                                            <input type="number" min="1" value={prize.weight} onChange={(e) => { const newPrizes = [...prizes]; newPrizes[index].weight = parseInt(e.target.value) || 1; setPrizes(newPrizes); }} className="w-full p-2 font-bold text-blue-600 border-b border-slate-200 focus:border-blue-500 outline-none bg-transparent text-center text-lg"/>
                                        </div>
                                        <button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors self-end md:self-center">
                                            <Trash2 size={20}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", weight: 10, quantity: 0 }])} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all flex items-center justify-center gap-2">
                                <Plus size={20}/> Ajouter un lot
                            </button>
                        </div>
                    </div>
                )}

                {/* --- TAB 3: DESIGN (INCHANGÉ) --- */}
                {activeTab === 'DESIGN' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        {/* MÊME CONTENU QUE PRÉCÉDEMMENT POUR LE DESIGN */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
                                <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4"><Palette size={20} className="text-blue-600"/> Identité Visuelle</h3>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Logo du commerce</label>
                                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                                        <LogoUploader currentUrl={designData.logo_url} onUrlChange={(url) => setDesignData({...designData, logo_url: url})} />
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2 ml-1">Conseil : Utilisez un format PNG transparent.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Couleur du Bouton (Actions)</label>
                                    <div className="flex items-center gap-4 p-3 bg-white rounded-xl border border-slate-200">
                                        <div className="relative group cursor-pointer">
                                            <input type="color" className="absolute inset-0 w-10 h-10 opacity-0 cursor-pointer z-10" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/>
                                            <div className="w-10 h-10 rounded-lg shadow-inner border border-slate-200" style={{ backgroundColor: designData.primary_color }}></div>
                                        </div>
                                        <span className="font-mono font-bold text-slate-800 uppercase">{designData.primary_color}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
                                <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4"><Sun size={20} className="text-orange-500"/> Style du Jeu</h3>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Couleurs de la Roue</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {PALETTES.map((p) => (
                                            <div key={p.id} onClick={() => setDesignData({...designData, wheel_palette: p.id})} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${designData.wheel_palette === p.id ? 'bg-white border-blue-600 shadow-md ring-1 ring-blue-600' : 'bg-transparent border-slate-200'}`}>
                                                <span className="font-bold text-xs text-slate-700 uppercase">{p.label}</span>
                                                <div className="flex h-6 w-16 rounded overflow-hidden border border-slate-200"><div className="flex-1" style={{backgroundColor: p.c1}}></div><div className="flex-1" style={{backgroundColor: p.c2}}></div></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Apparence de la carte</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div onClick={() => setDesignData({...designData, card_style: 'light'})} className={`cursor-pointer p-3 rounded-xl border-2 text-center text-xs font-bold transition-all ${designData.card_style === 'light' ? 'border-blue-600 bg-white text-blue-600 shadow-sm' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>Mode Clair</div>
                                        <div onClick={() => setDesignData({...designData, card_style: 'dark'})} className={`cursor-pointer p-3 rounded-xl border-2 text-center text-xs font-bold transition-all ${designData.card_style === 'dark' ? 'border-blue-600 bg-slate-900 text-white shadow-sm' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>Mode Sombre</div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 italic">Définit la couleur de fond de la carte de jeu.</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                            <h3 className="font-black text-lg text-slate-800 mb-4">Fond d'écran & Titre</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                {TITLE_STYLES.map((style) => (
                                    <div key={style.id} onClick={() => setDesignData({...designData, title_style: style.id})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all ${designData.title_style === style.id ? 'border-blue-600 bg-white shadow-md' : 'border-slate-200'}`}>
                                        <p className="font-bold text-[10px] uppercase text-slate-500 mb-2">{style.label}</p>
                                        <div className="bg-slate-900 text-white p-2 rounded text-[10px] font-black italic">{style.preview}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                {BACKGROUNDS.map((bg, index) => (
                                    <div key={index} onClick={() => setDesignData({...designData, bg_choice: index, bg_image_url: bg})} className={`relative aspect-[9/16] cursor-pointer rounded-xl overflow-hidden border-4 transition-all ${(!designData.bg_image_url && designData.bg_choice === index) || designData.bg_image_url === bg ? 'border-blue-600 shadow-lg scale-105 z-10' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                                        <img src={bg} className="w-full h-full object-cover" alt="Fond" />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 pt-6 border-t border-slate-200">
                                <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Ou image personnalisée</label>
                                <BackgroundUploader 
                                    currentUrl={designData.bg_image_url} 
                                    onUrlChange={(url) => setDesignData({...designData, bg_image_url: url})} 
                                />
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