"use client"

import { useState, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { createGameAction } from "@/app/actions/create-game"
import { 
  Loader2, Save, Layout, Gift, Palette, Clock, ArrowLeft, 
  Sun, Rocket, Trash2, Plus, AlertCircle, CheckCircle, Check, Wand2
} from "lucide-react"
import Link from "next/link"
import GooglePlaceInput from "@/components/GooglePlaceInput"
import LogoUploader from "@/components/LogoUploader" 

// --- VOS 10 FONDS D'ÉCRAN ---
const BACKGROUNDS = [
  "https://i.postimg.cc/VvsZ09Qf/four-slices-pepperoni-pizza-corners-dark-background-top-view-space-copy-text.jpg",
  "https://i.postimg.cc/2SLcW8tP/triangular-slices-chicago-style-pizza-with-hot-sauce-transparent-background.jpg",
  "https://i.postimg.cc/1zpvW7s0/drawing-hamburgers-with-toothpick-background.jpg",
  "https://i.postimg.cc/DZ6BhWW5/background-37.jpg",
  "https://i.postimg.cc/J0dxy95G/64f68220-f9ae-4dc1-994f-d9f0e972aad4.jpg",
  "https://i.postimg.cc/448BF9R4/set-sushi-rolls-plate-with-chopsticks.jpg",
  "https://images.unsplash.com/photo-1517433367423-c7e5b0f35086?q=80&w=1000&auto=format&fit=crop", // Bois
  "https://images.unsplash.com/photo-1503455637927-730bce8583c0?q=80&w=1000&auto=format&fit=crop", // Marbre
  "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=1000&auto=format&fit=crop", // Or Luxe
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop"  // Noir Abstrait
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
      wheel_palette: 'MONACO'
  })

  const [prizes, setPrizes] = useState([
    { label: "1 Café Offert", color: "#3b82f6", weight: 50 },
    { label: "-10% addition", color: "#10b981", weight: 30 },
    { label: "Dessert Offert", color: "#f59e0b", weight: 20 }
  ])

  // --- LOGIQUE CALCUL 100% ---
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
    setFormData(prev => ({ ...prev, action_url: url }))
  }

  const handleCreate = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!formData.name) {
        setErrorMsg("Le nom du jeu est obligatoire.");
        setActiveTab('INFOS');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    if (!isWeightValid) {
        setErrorMsg(`Le total des probabilités doit être de 100% (Actuel: ${totalWeight}%)`);
        setActiveTab('LOTS');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    
    setSaving(true)
    try {
        const res = await createGameAction({
            slug: params.slug,
            form: { ...formData, min_spend: formData.has_min_spend ? formData.min_spend : 0 },
            design: { ...designData, text_color: designData.card_style === 'dark' ? '#FFFFFF' : '#0F172A' },
            prizes: prizes.map(p => ({ label: p.label, color: "#000000", weight: Number(p.weight) }))
        })
        
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
        <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 animate-in fade-in duration-300 p-6 text-center">
            <CheckCircle size={64} className="text-green-500 mb-6" />
            <h1 className="text-3xl font-black text-slate-900 mb-2">Félicitations ! 🎉</h1>
            <p className="text-xl text-green-700 font-medium">{successMsg}</p>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div>
                <Link href={`/admin/${params.slug}/games`} className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800 text-sm font-bold"><ArrowLeft size={16}/> Annuler</Link>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2">Nouveau Jeu <Rocket className="text-purple-600" size={28}/></h1>
            </div>
            <button 
                onClick={handleCreate} 
                disabled={saving || !isWeightValid} 
                className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all w-full sm:w-auto shadow-lg ${isWeightValid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
            >
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>} 
                Créer le jeu {!isWeightValid && `(${totalWeight}%)`}
            </button>
        </div>

        {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
                <AlertCircle size={20} className="shrink-0" />
                <span className="font-bold text-sm">{errorMsg}</span>
            </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            
            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto scrollbar-hide">
                <button onClick={() => setActiveTab('INFOS')} className={`flex-1 min-w-[120px] py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'INFOS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-400'}`}><Layout size={18}/> 1. Infos</button>
                <button onClick={() => setActiveTab('LOTS')} className={`flex-1 min-w-[120px] py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'LOTS' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-400'}`}><Gift size={18}/> 2. Lots</button>
                <button onClick={() => setActiveTab('DESIGN')} className={`flex-1 min-w-[120px] py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'DESIGN' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-400'}`}><Palette size={18}/> 3. Design</button>
            </div>

            <div className="p-6 md:p-10">
                
                {/* --- ÉTAPE 1: INFOS --- */}
                {activeTab === 'INFOS' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Nom du Jeu *</label>
                                <input type="text" placeholder="Ex: Roue de Noël" className="w-full p-4 border rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Objectif Client</label>
                                <select className="w-full p-4 border rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={formData.active_action} onChange={e => setFormData({...formData, active_action: e.target.value, action_url: ""})}>
                                    <option value="GOOGLE_REVIEW">⭐ Avis Google</option>
                                    <option value="INSTAGRAM">📸 Instagram</option>
                                    <option value="FACEBOOK">👍 Facebook</option>
                                    <option value="TIKTOK">🎵 TikTok</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                            <label className="block text-xs font-black text-slate-500 uppercase mb-3">{formData.active_action === 'GOOGLE_REVIEW' ? 'Rechercher votre établissement *' : 'Lien URL de votre page *'}</label>
                            {formData.active_action === 'GOOGLE_REVIEW' ? (
                                <GooglePlaceInput onSelect={handleGoogleSelect} />
                            ) : (
                                <input type="url" placeholder="https://..." className="w-full p-4 border rounded-2xl bg-white outline-none focus:ring-2 focus:ring-blue-500" value={formData.action_url} onChange={e => setFormData({...formData, action_url: e.target.value})}/>
                            )}
                        </div>

                        <div className="border-t border-slate-100 pt-6 mt-6">
                            <h3 className="font-black text-lg mb-4 flex items-center gap-2 text-slate-800"><Clock size={20} className="text-slate-400"/> Paramètres</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2">Validité du gain (Jours)</label>
                                    <input type="number" className="w-full p-4 border rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={formData.validity_days} onChange={e => setFormData({...formData, validity_days: parseInt(e.target.value) || 0})}/>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                    <div className="flex items-center gap-3 mb-3">
                                        <input type="checkbox" id="min_spend_check" className="w-5 h-5 accent-blue-600" checked={formData.has_min_spend} onChange={e => setFormData({...formData, has_min_spend: e.target.checked})}/>
                                        <label htmlFor="min_spend_check" className="text-sm font-bold text-slate-700 cursor-pointer">Activer minimum commande</label>
                                    </div>
                                    {formData.has_min_spend && (
                                        <div className="flex items-center gap-2">
                                            <input type="number" className="w-full p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={formData.min_spend} onChange={e => setFormData({...formData, min_spend: parseInt(e.target.value) || 0})}/>
                                            <span className="text-slate-400 font-black">€</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ÉTAPE 2: LOTS (AVEC 100%) --- */}
                {activeTab === 'LOTS' && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4">
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

                        <div className="space-y-3">
                            {prizes.map((prize, index) => (
                                <div key={index} className="flex flex-col md:flex-row gap-4 p-5 bg-white rounded-2xl border border-slate-200 items-center hover:border-blue-400 transition-all">
                                    <div className="flex-1 w-full">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Cadeau à gagner</label>
                                        <input type="text" maxLength={15} value={prize.label} onChange={(e) => { const n = [...prizes]; n[index].label = e.target.value; setPrizes(n); }} className="w-full p-2 font-black text-slate-900 border-b border-slate-100 outline-none bg-transparent"/>
                                    </div>
                                    <div className="w-full md:w-32">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block text-center">Chance de gain (%)</label>
                                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                            <input type="number" value={prize.weight} onChange={(e) => { const n = [...prizes]; n[index].weight = parseInt(e.target.value) || 0; setPrizes(n); }} className="w-full font-black text-blue-600 outline-none bg-transparent text-center text-lg"/>
                                            <span className="text-slate-400 font-black">%</span>
                                        </div>
                                    </div>
                                    <button onClick={() => setPrizes(prizes.filter((_, i) => i !== index))} className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 self-end md:self-center"><Trash2 size={20}/></button>
                                </div>
                            ))}
                            <button onClick={() => setPrizes([...prizes, { label: "Nouveau Lot", color: "#000000", weight: 10 }])} className="w-full py-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black uppercase tracking-widest hover:bg-slate-50 hover:text-blue-600 transition-all flex items-center justify-center gap-2"><Plus size={20}/> Ajouter un lot</button>
                        </div>
                    </div>
                )}

                {/* --- ÉTAPE 3: DESIGN (AVEC 10 FONDS) --- */}
                {activeTab === 'DESIGN' && (
                    <div className="space-y-10 animate-in slide-in-from-right-4">
                        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2"><Palette className="text-blue-600" size={24}/> Identité & Logo</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Logo du jeu</label>
                                    <LogoUploader currentUrl={designData.logo_url} onUrlChange={(url) => setDesignData({...designData, logo_url: url})} />
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Couleur de la Roue</label>
                                        <div className="space-y-2">
                                            {PALETTES.map((p) => (
                                                <div key={p.id} onClick={() => setDesignData({...designData, wheel_palette: p.id})} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${designData.wheel_palette === p.id ? 'bg-white border-blue-600 shadow-md ring-1 ring-blue-600' : 'bg-transparent border-slate-200'}`}>
                                                    <span className="text-[10px] font-black uppercase text-slate-600">{p.label}</span>
                                                    <div className="flex h-5 w-12 rounded overflow-hidden border border-slate-200">
                                                        <div className="flex-1" style={{backgroundColor: p.c1}}></div>
                                                        <div className="flex-1" style={{backgroundColor: p.c2}}></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-slate-200">
                                        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Couleur Principale</label>
                                        <div className="flex items-center gap-4">
                                            <input type="color" className="w-12 h-12 rounded-xl cursor-pointer" value={designData.primary_color} onChange={e => setDesignData({...designData, primary_color: e.target.value})}/>
                                            <span className="font-mono font-black text-slate-600 uppercase">{designData.primary_color}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                            <h3 className="font-black text-xl text-slate-900 mb-6 flex items-center gap-2"><Sun className="text-orange-500" size={24}/> Thème & Titre</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                                <div onClick={() => setDesignData({...designData, card_style: 'light'})} className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex items-center justify-center font-black ${designData.card_style !== 'dark' ? 'border-blue-600 bg-white shadow-md' : 'border-slate-200 bg-transparent opacity-50'}`}>MODE CLAIR</div>
                                <div onClick={() => setDesignData({...designData, card_style: 'dark'})} className={`cursor-pointer p-6 rounded-2xl border-2 transition-all flex items-center justify-center font-black ${designData.card_style === 'dark' ? 'border-blue-600 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-transparent opacity-50'}`}>MODE SOMBRE</div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {TITLE_STYLES.map((style) => (
                                    <div key={style.id} onClick={() => setDesignData({...designData, title_style: style.id})} className={`cursor-pointer p-4 rounded-xl border-2 text-center transition-all ${designData.title_style === style.id ? 'border-blue-600 bg-white shadow-md' : 'border-slate-200 bg-transparent'}`}>
                                        <p className="font-black text-[10px] uppercase mb-3 text-slate-500">{style.label}</p>
                                        <div className="bg-slate-900 text-white p-2 rounded-lg font-black italic text-[10px]">{style.preview}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                            <h3 className="font-black text-xl text-slate-900 mb-6">Ambiance de fond</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                {BACKGROUNDS.map((bg, index) => (
                                    <div key={index} onClick={() => setDesignData({...designData, bg_choice: index, bg_image_url: ''})} className={`relative aspect-[9/16] cursor-pointer rounded-2xl overflow-hidden border-4 transition-all ${(!designData.bg_image_url && designData.bg_choice === index) ? 'border-blue-600 scale-105 z-10 shadow-xl' : 'border-white opacity-60 hover:opacity-100'}`}>
                                        <img src={bg} className="w-full h-full object-cover" alt="Fond" />
                                        {(!designData.bg_image_url && designData.bg_choice === index) && <div className="absolute inset-0 bg-blue-600/10 flex items-center justify-center"><div className="bg-white p-1 rounded-full"><Check size={16} className="text-blue-600"/></div></div>}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 pt-8 border-t border-slate-200">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block italic">URL Image personnalisée</label>
                                <input type="url" placeholder="https://..." className="w-full p-4 border rounded-2xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm" value={designData.bg_image_url || ''} onChange={e => setDesignData({...designData, bg_image_url: e.target.value})} />
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