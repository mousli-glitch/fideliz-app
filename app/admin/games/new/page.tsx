"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus, Save, Loader2 } from "lucide-react"

type PrizeForm = {
  label: string
  color: string
  weight: number
  quantity: number | null
}

export default function NewGamePage() {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // -- STATE JEU --
  const [gameConfig, setGameConfig] = useState({
    active_action: "GOOGLE_REVIEW",
    action_url: "",
    validity_days: 30,
    min_spend: ""
  })

  // -- STATE LOTS --
  const [prizes, setPrizes] = useState<PrizeForm[]>([
    { label: "Un Café", color: "#FBBF24", weight: 50, quantity: null },
    { label: "Une Surprise", color: "#F87171", weight: 10, quantity: 5 }
  ])

  // --- GESTION DES LOTS ---
  const addPrize = () => {
    setPrizes([...prizes, { label: "", color: "#E5E7EB", weight: 10, quantity: null }])
  }

  const removePrize = (index: number) => {
    if (prizes.length <= 1) return alert("Il faut au moins 1 lot.")
    setPrizes(prizes.filter((_, i) => i !== index))
  }

  const updatePrize = (index: number, field: keyof PrizeForm, value: any) => {
    const newPrizes = [...prizes]
    newPrizes[index] = { ...newPrizes[index], [field]: value }
    setPrizes(newPrizes)
  }

  // --- SAUVEGARDE (LOGIQUE UPDATE + INSERT) ---
  const handleSave = async () => {
    if (!gameConfig.action_url) return alert("L'URL de l'action est obligatoire.")
    if (prizes.length < 1) return alert("Il faut au moins 1 lot.")
    
    setSaving(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Non connecté")

      // 1. Récupérer l'ID Restaurant
      const { data: resto } = await (supabase.from("restaurants") as any)
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!resto) throw new Error("Restaurant introuvable.")

      // 🚨 NOUVELLE LOGIQUE : AUTO-ARCHIVAGE
      // On passe tous les jeux 'active' de ce restaurant en 'ended'
      const { error: archiveError } = await (supabase.from("games") as any)
        .update({ status: 'ended' })
        .eq("restaurant_id", resto.id)
        .eq("status", "active")
      
      if (archiveError) throw new Error("Erreur lors de l'archivage des anciens jeux.")

      // 2. Créer le NOUVEAU Jeu (qui sera le seul 'active')
      const { data: newGame, error: gameError } = await (supabase.from("games") as any)
        .insert({
          restaurant_id: resto.id,
          active_action: gameConfig.active_action,
          action_url: gameConfig.action_url,
          validity_days: Number(gameConfig.validity_days),
          min_spend: gameConfig.min_spend || null,
          status: 'active'
        })
        .select()
        .single()

      if (gameError) {
        // Gestion propre de l'erreur d'unicité (au cas où)
        if (gameError.message.includes("one_active_game_per_restaurant")) {
          throw new Error("Un autre jeu est déjà actif. Veuillez rafraîchir la page.")
        }
        throw gameError
      }

      // 3. Créer les Lots
      const prizesToInsert = prizes.map(p => ({
        game_id: newGame.id,
        label: p.label,
        color: p.color,
        weight: Number(p.weight),
        quantity: p.quantity === 0 ? null : Number(p.quantity) || null
      }))

      const { error: prizeError } = await (supabase.from("prizes") as any)
        .insert(prizesToInsert)
      
      if (prizeError) throw prizeError

      // Succès
      router.refresh()
      router.push("/admin")
      
    } catch (error: any) {
      console.error(error)
      alert("Erreur: " + error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Créer un nouveau jeu</h2>
        <p className="text-slate-500">
          Publier un nouveau jeu terminera automatiquement la campagne précédente.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-lg">1. L'Action Client</h3>
            <div className="space-y-2">
              <Label>Type d'action</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={gameConfig.active_action}
                onChange={e => setGameConfig({...gameConfig, active_action: e.target.value})}
              >
                <option value="GOOGLE_REVIEW">Avis Google ⭐</option>
                <option value="INSTAGRAM_FOLLOW">Instagram Follow 📸</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Lien Cible (URL)</Label>
              <Input 
                placeholder="https://..." 
                value={gameConfig.action_url}
                onChange={e => setGameConfig({...gameConfig, action_url: e.target.value})}
              />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-lg">2. Conditions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Validité (jours)</Label>
                <Input type="number" value={gameConfig.validity_days} onChange={e => setGameConfig({...gameConfig, validity_days: Number(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>Min. Achat</Label>
                <Input placeholder="Ex: 15€" value={gameConfig.min_spend} onChange={e => setGameConfig({...gameConfig, min_spend: e.target.value})} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">3. Les Lots</h3>
              <Button size="sm" variant="outline" onClick={addPrize}><Plus size={16}/> Ajouter</Button>
            </div>
            <div className="space-y-4">
              {prizes.map((prize, idx) => (
                <div key={idx} className="flex gap-2 items-start bg-slate-50 p-3 rounded border">
                  <div className="grid gap-2 flex-1">
                    <div className="flex gap-2">
                      <Input placeholder="Nom" value={prize.label} onChange={e => updatePrize(idx, 'label', e.target.value)} />
                      <input type="color" className="h-10 w-10 cursor-pointer" value={prize.color} onChange={e => updatePrize(idx, 'color', e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1"><Label className="text-xs">Poids</Label><Input type="number" value={prize.weight} onChange={e => updatePrize(idx, 'weight', Number(e.target.value))} /></div>
                      <div className="flex-1"><Label className="text-xs">Stock</Label><Input type="number" placeholder="∞" value={prize.quantity ?? ""} onChange={e => updatePrize(idx, 'quantity', e.target.value === "" ? null : Number(e.target.value))} /></div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removePrize(idx)}><Trash2 size={18} /></Button>
                </div>
              ))}
            </div>
          </Card>
          <Button size="lg" className="w-full gap-2 font-bold" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />} PUBLIER LE JEU
          </Button>
        </div>
      </div>
    </div>
  )
}