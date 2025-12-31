"use client"

import { useEffect, useState, use } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus, Save, Loader2, ArrowLeft, CheckCircle2, FileEdit, Ban, CalendarDays, ShoppingBag, Gift } from "lucide-react"
import Link from "next/link"

type PrizeForm = {
  id?: string
  label: string
  color: string
  weight: number
  quantity: number | null
}

export default function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Config Jeu
  const [gameConfig, setGameConfig] = useState({
    active_action: "GOOGLE_REVIEW",
    action_url: "",
    validity_days: 30,
    min_spend: "",
    status: "draft",
    end_date: ""
  })

  const [prizes, setPrizes] = useState<PrizeForm[]>([])
  const [initialPrizeIds, setInitialPrizeIds] = useState<string[]>([])

  useEffect(() => {
    if (!gameId) return
    const fetchGame = async () => {
      const { data: game, error } = await (supabase.from("games") as any).select("*").eq("id", gameId).single()
      if (error || !game) return router.push("/admin")

      setGameConfig({
        active_action: game.active_action,
        action_url: game.action_url || "",
        validity_days: game.validity_days || 30,
        min_spend: game.min_spend || "",
        status: game.status,
        end_date: game.end_date ? game.end_date.split('T')[0] : ""
      })

      const { data: dbPrizes } = await (supabase.from("prizes") as any).select("*").eq("game_id", gameId).order("weight", { ascending: false })
      if (dbPrizes) {
        const formattedPrizes = dbPrizes.map((p: any) => ({
          id: p.id, label: p.label, color: p.color, weight: p.weight, quantity: p.quantity
        }))
        setPrizes(formattedPrizes)
        setInitialPrizeIds(formattedPrizes.map((p: any) => p.id))
      }
      setLoading(false)
    }
    fetchGame()
  }, [gameId])

  const addPrize = () => setPrizes([...prizes, { label: "", color: "#E5E7EB", weight: 10, quantity: null }])
  const removePrize = (index: number) => {
    if (prizes.length <= 1) return alert("Il faut au moins 1 lot.")
    setPrizes(prizes.filter((_, i) => i !== index))
  }
  const updatePrize = (index: number, field: keyof PrizeForm, value: any) => {
    const newPrizes = [...prizes]
    newPrizes[index] = { ...newPrizes[index], [field]: value }
    setPrizes(newPrizes)
  }

  const handleSave = async () => {
    if (!gameConfig.action_url) return alert("L'URL est obligatoire.")
    setSaving(true)

    try {
      const statusToSave = gameConfig.status === 'active' ? undefined : gameConfig.status
      const { error: gameError } = await (supabase.from("games") as any).update({
          active_action: gameConfig.active_action,
          action_url: gameConfig.action_url,
          validity_days: Number(gameConfig.validity_days),
          min_spend: gameConfig.min_spend || null,
          end_date: gameConfig.end_date || null,
          ...(statusToSave && { status: statusToSave }) 
        }).eq("id", gameId)
      if (gameError) throw gameError

      const currentIds = prizes.map(p => p.id).filter(Boolean)
      const idsToDelete = initialPrizeIds.filter(id => !currentIds.includes(id))
      if (idsToDelete.length > 0) await (supabase.from("prizes") as any).delete().in("id", idsToDelete)

      const prizesToUpsert = prizes.map(p => ({
        id: p.id, game_id: gameId, label: p.label, color: p.color,
        weight: Number(p.weight), quantity: p.quantity === 0 ? null : (Number(p.quantity) || null)
      }))
      const { error: prizeError } = await (supabase.from("prizes") as any).upsert(prizesToUpsert)
      if (prizeError) throw prizeError

      if (gameConfig.status === 'active') {
        const { error: rpcError } = await (supabase as any).rpc('activate_game', { p_game_id: gameId })
        if (rpcError) throw new Error("Erreur activation: " + rpcError.message)
      }

      router.refresh()
      router.push("/admin")
    } catch (error: any) {
      alert("Erreur: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 pt-6">
        <Link href="/admin">
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-slate-300 hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-slate-700"/>
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Configurer la Campagne</h2>
          <p className="text-slate-500 font-medium text-sm">Définissez les règles et les lots.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        
        {/* COLONNE GAUCHE (7/12) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* 1. STATUS SELECTOR */}
          <section>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-widest mb-4 ml-1">État de la campagne</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Brouillon */}
              <button 
                onClick={() => setGameConfig({...gameConfig, status: 'draft'})}
                className={`group flex flex-col items-center justify-center aspect-square rounded-2xl border-2 transition-all duration-200 ${
                  gameConfig.status === 'draft' 
                  ? 'border-slate-900 bg-slate-900 text-white shadow-xl scale-[1.02]' 
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-900 hover:shadow-md'
                }`}
              >
                <FileEdit size={28} className={`mb-3 ${gameConfig.status !== 'draft' && 'group-hover:scale-110 transition-transform'}`} />
                <span className="font-bold text-sm">Brouillon</span>
              </button>

              {/* En Ligne */}
              <button 
                onClick={() => setGameConfig({...gameConfig, status: 'active'})}
                className={`group flex flex-col items-center justify-center aspect-square rounded-2xl border-2 transition-all duration-200 ${
                  gameConfig.status === 'active' 
                  ? 'border-green-600 bg-green-600 text-white shadow-xl shadow-green-100 scale-[1.02]' 
                  : 'border-slate-200 bg-white text-slate-500 hover:border-green-500 hover:text-green-600 hover:shadow-md'
                }`}
              >
                <CheckCircle2 size={28} className={`mb-3 ${gameConfig.status !== 'active' && 'group-hover:scale-110 transition-transform'}`} />
                <span className="font-bold text-sm">En Ligne</span>
              </button>

              {/* Terminé */}
              <button 
                onClick={() => setGameConfig({...gameConfig, status: 'ended'})}
                className={`group flex flex-col items-center justify-center aspect-square rounded-2xl border-2 transition-all duration-200 ${
                  gameConfig.status === 'ended' 
                  ? 'border-red-600 bg-red-600 text-white shadow-xl shadow-red-100 scale-[1.02]' 
                  : 'border-slate-200 bg-white text-slate-500 hover:border-red-500 hover:text-red-600 hover:shadow-md'
                }`}
              >
                <Ban size={28} className={`mb-3 ${gameConfig.status !== 'ended' && 'group-hover:scale-110 transition-transform'}`} />
                <span className="font-bold text-sm">Terminée</span>
              </button>
            </div>
          </section>

          {/* 2. PARAMÈTRES */}
          <Card className="p-8 shadow-sm border-slate-200 space-y-8 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">1</div>
                <h3 className="font-bold text-lg text-slate-900">Paramètres du jeu</h3>
            </div>
            
            {/* ACTION */}
            <div>
              <Label className="mb-3 block font-bold text-slate-900">Action demandée au client</Label>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setGameConfig({...gameConfig, active_action: 'GOOGLE_REVIEW'})}
                  className={`p-4 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-3 transition-all ${
                      gameConfig.active_action === 'GOOGLE_REVIEW' 
                      ? 'border-slate-900 bg-slate-50 text-slate-900' 
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  ⭐ Avis Google
                </button>
                <button 
                  onClick={() => setGameConfig({...gameConfig, active_action: 'INSTAGRAM_FOLLOW'})}
                  className={`p-4 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-3 transition-all ${
                      gameConfig.active_action === 'INSTAGRAM_FOLLOW' 
                      ? 'border-pink-600 bg-pink-50 text-pink-700' 
                      : 'bg-white border-slate-200 text-slate-500 hover:border-pink-400 hover:text-pink-600'
                  }`}
                >
                  📸 Instagram
                </button>
              </div>
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label className="font-bold text-slate-900">Lien Cible (URL)</Label>
              <Input 
                value={gameConfig.action_url} 
                onChange={e => setGameConfig({...gameConfig, action_url: e.target.value})} 
                placeholder="https://..."
                className="bg-white border-2 border-slate-200 h-12 focus:border-slate-900 focus:ring-0 rounded-lg text-slate-900 placeholder:text-slate-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-6 pt-2">
              {/* DATE FIN */}
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 flex items-center gap-2">
                  <CalendarDays size={16}/> Date de fin (Optionnel)
                </Label>
                <Input 
                  type="date"
                  value={gameConfig.end_date} 
                  onChange={e => setGameConfig({...gameConfig, end_date: e.target.value})}
                  className="bg-white border-2 border-slate-200 h-11 focus:border-slate-900 rounded-lg"
                />
              </div>

              {/* MIN ACHAT */}
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 flex items-center gap-2">
                  <ShoppingBag size={16}/> Min. Achat (Optionnel)
                </Label>
                <Input 
                  value={gameConfig.min_spend} 
                  onChange={e => setGameConfig({...gameConfig, min_spend: e.target.value})}
                  placeholder="Ex: 15€"
                  className="bg-white border-2 border-slate-200 h-11 focus:border-slate-900 rounded-lg"
                />
              </div>
            </div>

            {/* VALIDITÉ */}
            <div className="space-y-2 pt-4 border-t border-slate-100 mt-2">
              <Label className="font-bold text-slate-900">Délai de récupération</Label>
              <div className="flex gap-4 items-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                <Input 
                  type="number" 
                  value={gameConfig.validity_days} 
                  onChange={e => setGameConfig({...gameConfig, validity_days: Number(e.target.value)})}
                  className="w-24 h-12 font-bold text-center text-lg border-2 border-slate-300 focus:border-slate-900 bg-white"
                />
                <div className="flex flex-col">
                     <span className="text-sm font-bold text-slate-900">Jours après le gain</span>
                     <span className="text-xs text-slate-500">Pour venir récupérer le cadeau.</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* COLONNE DROITE (5/12) : LOTS */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 shadow-sm border-slate-200 bg-slate-50 h-full">
            <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
               <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">2</div>
                 <h3 className="font-bold text-lg text-slate-900">Les Lots</h3>
               </div>
              <Button size="sm" onClick={addPrize} className="bg-white text-slate-900 border-2 border-slate-200 hover:border-slate-400 hover:bg-white font-bold text-xs h-9 shadow-sm">
                <Plus size={14} className="mr-1"/> Ajouter
              </Button>
            </div>
            
            <div className="space-y-4">
              {prizes.map((prize, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm group hover:border-slate-300 hover:shadow-md transition-all">
                  
                  {/* Ligne 1 : Nom et Couleur */}
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1 space-y-1">
                         <Label className="text-[10px] font-bold text-slate-400 uppercase">Nom du lot</Label>
                        <Input 
                          placeholder="Ex: Un Café" 
                          value={prize.label} 
                          onChange={e => updatePrize(idx, 'label', e.target.value)}
                          className="h-10 font-bold text-slate-900 border-slate-200 focus:border-slate-900 bg-white"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Couleur</Label>
                        <input 
                          type="color" 
                          className="h-10 w-12 rounded-lg cursor-pointer border-2 border-slate-200 p-0.5 bg-white"
                          value={prize.color} 
                          onChange={e => updatePrize(idx, 'color', e.target.value)}
                        />
                    </div>
                  </div>
                  
                  {/* Ligne 2 : Poids et Stock */}
                  <div className="flex items-end gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[9px] uppercase text-slate-500 font-bold tracking-wider flex items-center gap-1">
                         Chance <span className="text-slate-300">(Poids)</span>
                      </Label>
                      <Input 
                        type="number" 
                        value={prize.weight} 
                        onChange={e => updatePrize(idx, 'weight', Number(e.target.value))}
                        className="h-9 text-xs font-bold border-slate-200 focus:border-slate-500 text-center"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Stock</Label>
                      <Input 
                        type="number" 
                        placeholder="∞" 
                        value={prize.quantity ?? ""} 
                        onChange={e => updatePrize(idx, 'quantity', e.target.value === "" ? null : Number(e.target.value))}
                        className="h-9 text-xs font-bold border-slate-200 focus:border-slate-500 text-center placeholder:text-slate-300"
                      />
                    </div>
                    <div className="">
                       <button 
                        onClick={() => removePrize(idx)} 
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100"
                        title="Supprimer ce lot"
                        >
                         <Trash2 size={16} />
                       </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          
          <div className="pt-4 sticky bottom-6 z-10">
              <Button size="lg" className="w-full gap-2 font-black tracking-wide shadow-xl shadow-slate-300/50 bg-slate-900 hover:bg-black text-white py-8 text-lg rounded-2xl transition-transform active:scale-[0.98]" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />} ENREGISTRER TOUT
              </Button>
          </div>
        </div>

      </div>
    </div>
  )
}