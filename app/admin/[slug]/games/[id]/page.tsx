"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { 
  Loader2, Save, Layout, Gift, Palette, Clock, ArrowLeft, 
  Trash2, Sun, Plus, Check, Wand2, AlertCircle 
} from "lucide-react"
import Link from "next/link"
import GooglePlaceInput from "@/components/GooglePlaceInput"
import LogoUploader from "@/components/LogoUploader" 
import { updateGameAction } from "@/app/actions/update-game"

// --- LES 10 FONDS (VOS 6 + 4 PASSE-PARTOUT) ---
const BACKGROUNDS = [
  "https://i.postimg.cc/VvsZ09Qf/four-slices-pepperoni-pizza-corners-dark-background-top-view-space-copy-text.jpg",
  "https://i.postimg.cc/2SLcW8tP/triangular-slices-chicago-style-pizza-with-hot-sauce-transparent-background.jpg",
  "https://i.postimg.cc/1zpvW7s0/drawing-hamburgers-with-toothpick-background.jpg",
  "https://i.postimg.cc/DZ6BhWW5/background-37.jpg",
  "https://i.postimg.cc/J0dxy95G/64f68220-f9ae-4dc1-994f-d9f0e972aad4.jpg",
  "https://i.postimg.cc/448BF9R4/set-sushi-rolls-plate-with-chopsticks.jpg",
  "https://images.unsplash.com/photo-1517433367423-c7e5b0f35086?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1503455637927-730bce8583c0?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=1000&auto=format&fit=crop", 
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop"
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
  const [activeTab, setActiveTab] = useState<'INFOS' | 'DESIGN' | 'LOTS'>('INFOS')

  const [gameId, setGameId] = useState<string>("")
  const [restaurantId, setRestaurantId] = useState<string>("") 
  
  const [formData, setFormData] = useState<any>({
    name: "",
    active_action: "GOOGLE_REVIEW",
    action_url: "",
    validity_days: 30, 
    min_spend: 0,
    has_min_spend: false
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

  // --- LOGIQUE 100% ---
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

  // --- 1. CHARGEMENT ---
  useEffect(() => {
    const loadGame = async () => {
        const idToLoad = params?.id
        if(!idToLoad) return;
        const { data: game } = await (supabase.from('games') as any).select('*').eq('id', idToLoad).single()
        if (game) {
            setGameId(game.id); setRestaurantId(game.restaurant_id) 
            const { data: restaurant } = await (supabase.from('restaurants') as any).select('*').eq('id', game.restaurant_id).single()
            setFormData({
                name: game.name,
                active_action: game.active_action,
                action_url: game.action_url || "",
                validity_days: game.validity_days || 30,
                min_spend: game.min_spend ? Number(game.min_spend) : 0,
                has_min_spend: Number(game.min_spend) > 0
            })
            setDesignData({
                primary_color: restaurant?.primary_color || "#E11D48",
                logo_url: restaurant?.logo_url || "",
                bg_choice: game.bg_choice || 0,
                title_style: game.title_style || 'STYLE_1',
                bg_image_url: game.bg_image_url || "",
                card_style: game.card_style || (restaurant?.text_color === '#FFFFFF' ? 'dark' : 'light'),
                wheel_palette: game.wheel_palette || 'MONACO'
            })
            const { data: prizesData } = await (supabase.from('prizes') as any).select('*').eq('game_id', game.id).order('weight', {ascending: false})
            setPrizes(prizesData || [])
        }
        setLoading(false)
    }
    loadGame()
  }, [params, supabase])

  // --- 2. MISE À JOUR ---
  const handleUpdate = async () => {
    if (!formData.name) return alert("Veuillez donner un Nom au Jeu.")
    if (!isWeightValid) return alert(`Total Probabilités : ${totalWeight}%. Il doit être de 100%.`)
    
    setSaving(true)
    try {
        const res = await updateGameAction(gameId, {
            restaurant_id: restaurantId,
            form: formData,
            design: designData,
            prizes: prizes.map(p => ({ ...p, color: "#000000", weight: Number(p.weight) })) // Forçage du type Nombre
        })
        if (!res.success) throw new Error(res.error)
        alert("✅ Jeu modifié avec succès !")
        router.push(`/admin/${params.slug}/games`); router.refresh()
    } catch (e: any) {
        alert("Oups erreur : " + e.message)
    } finally {
        setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600"/></div>

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div>
                <Link href={`/admin/${params.slug}/games`} className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Retour</Link>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900">Modifier le Jeu ✏️</h1>
            </div>
            <button onClick={handleUpdate} disabled={saving || !isWeightValid} className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all w-full sm:w-auto shadow-lg ${isWeightValid ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-300 text-slate-500'}`}>
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} Enregistrer {!isWeightValid && `(${totalWeight}%)`}
            </button>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><Layout size={18}/> 1. Infos</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><Gift size={18}/> 2. Lots</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><Palette size={18}/> 3. Design</button>
            </div>

            <div className="p-6 md:p-10">
                {activeTab === 'INFOS' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-xs font-black text-slate-500 uppercase mb-2">Nom</label><input type="text" className="w-full p-4 border rounded-2xl bg-slate-50 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}/></div>
                            <div><label className="block text-xs font-black text-slate-500 uppercase mb-2">Action</label><select className="w-full p-4 border rounded-2xl bg-slate-50 font-bold" value={formData.active_action} onChange={e => setFormData({...formData, active_action: e.target.value})}><option value="GOOGLE_REVIEW">⭐ Avis Google</option><option value="INSTAGRAM">📸 Instagram</option><option value="FACEBOOK">👍 Facebook</option><option value="TIKTOK">🎵 TikTok</option></select></div>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                            {formData.active_action === 'GOOGLE_REVIEW' ? <GooglePlaceInput onSelect={handleGoogleSelect} defaultValue={formData.action_url} /> : <input type="url" className="w-full p-4 border rounded-2xl bg-white" value={formData.action_url} onChange={e => setFormData({...formData, action_url: e.target.value})}/>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                            <div><label className="block text-xs font-black text-slate-500 uppercase mb-2">Validité (jours)</label><input type="number" className="w-full p-4 border rounded-2xl bg-slate-50 font-bold" value={formData.validity_days} onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}/></div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                <div className="flex items-center gap-3 mb-3"><input type="checkbox" id="min_s" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/><label htmlFor="min_s" className="text-sm font-bold text-slate-700">Minimum commande</label></div>
                                {formData.has_min_spend && <div className="flex items-center gap-2"><input type="number" className="w-full p-2 border rounded-lg bg-white" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/><span className="text-slate-400 font-black">€</span></div>}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'LOTS' && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
                        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl text-white">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Total Probabilités : {totalWeight}%</span>
                                <button onClick={autoBalance} className="text-[10px] font-black uppercase text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg flex items-center gap-2"><Wand2 size={12}/> Équilibrer</button>
                            </div>
                            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full transition-all ${isWeightValid ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(totalWeight, 100)}%` }}></div></div>
                        </div>
                        <div className="space-y-3">
                            {prizes.map((prize, index) => (
                                <div key={index} className="flex flex-col md:flex-row gap-4 p-5 bg-white rounded-2xl border border-slate-200 items-center">
                                    <div className="flex-1 w-full"><label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Lot</label><input type="text" maxLength={15} value={prize.label} onChange={(e) => { const n = [...prizes]; n[index].label = e.target.value; setPrizes(n); }} className="w-full p-2 font-black text-slate-900 border-b outline-none"/></div>
                                    <div className="w-full md:w-32"><label className="text-[9px] font-black text-slate-400 uppercase mb-1 block text-center">Chance (%)</label><input type="number" value={prize.weight} onChange={(e) => { const n = [...prizes]; n[index].weight = parseInt(e.target.value) || 0; setPrizes(n); }} className="w-full p-2 font-black text-blue-600 text-center text-lg border-b outline-none"/></div>
                                    <button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={20}/></button>
                                </div>
                            ))}
                            <button onClick={() => setPrizes([...prizes, { label: "Nouveau lot", weight: 10 }])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black uppercase tracking-widest flex items-center justify-center gap-2"><Plus size={20}/> Ajouter un lot</button>
                        </div>
                    </div>
                )}

                {activeTab === 'DESIGN' && (
                    <div className="space-y-10 animate-in slide-in-from-right-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                                <label className="text-xs font-black text-slate-500 uppercase mb-4 block">Logo & Couleur</label>
                                <LogoUploader currentUrl={designData.logo_url} onUrlChange={(url) => setDesignData({...designData, logo_url: url})} />
                                <div className="mt-6 flex items-center gap-4 pt-6 border-t"><input type="color" className="w-12 h-12 rounded-xl" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/><span className="font-mono font-black text-slate-600">{designData.primary_color}</span></div>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                                <label className="text-xs font-black text-slate-500 uppercase mb-4 block">Couleurs Roue</label>
                                <div className="space-y-2">{PALETTES.map((p) => (<div key={p.id} onClick={() => setDesignData({...designData, wheel_palette: p.id})} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer ${designData.wheel_palette === p.id ? 'bg-white border-blue-600 shadow-md' : 'bg-transparent border-slate-200'}`}><span className="text-[10px] font-black uppercase">{p.label}</span><div className="flex h-5 w-12 rounded overflow-hidden border"><div className="flex-1" style={{backgroundColor: p.c1}}></div><div className="flex-1" style={{backgroundColor: p.c2}}></div></div></div>))}</div>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                            <label className="text-xs font-black text-slate-500 uppercase mb-6 block">Ambiance de fond</label>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">{BACKGROUNDS.map((bg, index) => (<div key={index} onClick={() => setDesignData({...designData, bg_choice: index, bg_image_url: ''})} className={`relative aspect-[9/16] cursor-pointer rounded-2xl overflow-hidden border-4 ${(!designData.bg_image_url && designData.bg_choice === index) ? 'border-blue-600 scale-105 z-10' : 'border-white opacity-60'}`}><img src={bg} className="w-full h-full object-cover" alt="Fond" />{(!designData.bg_image_url && designData.bg_choice === index) && <div className="absolute inset-0 flex items-center justify-center"><Check className="text-blue-600 bg-white p-1 rounded-full"/></div>}</div>))}</div>
                            <input type="url" placeholder="Ou URL personnalisée..." className="w-full p-4 border rounded-2xl bg-white mt-8" value={designData.bg_image_url || ''} onChange={e => setDesignData({...designData, bg_image_url: e.target.value})} />
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}