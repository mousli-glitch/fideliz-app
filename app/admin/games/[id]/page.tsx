"use client"

import { useState, useEffect, use } from "react"
import { getAdminGameById, getGamePrizes, createPrizeAction, deletePrizeAction } from "../../../actions/admin" // Import relatif
import { Loader2, ArrowLeft, Trash2, Plus, QrCode } from "lucide-react"
import Link from "next/link"

export default function GameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [game, setGame] = useState<any>(null)
  const [prizes, setPrizes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Formulaire nouveau lot
  const [newPrize, setNewPrize] = useState({ label: "", color: "#3B82F6", weight: 10 })

  const loadData = async () => {
    setLoading(true)
    const g = await getAdminGameById(id)
    const p = await getGamePrizes(id)
    setGame(g)
    setPrizes(p)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  const handleAddPrize = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createPrizeAction({ ...newPrize, game_id: id })
      setNewPrize({ label: "", color: "#3B82F6", weight: 10 }) // Reset
      loadData() // Reload
    } catch (err) {
      alert("Erreur ajout lot")
    }
  }

  const handleDeletePrize = async (prizeId: string) => {
    if(!confirm("Supprimer ce lot ?")) return
    await deletePrizeAction(prizeId)
    loadData()
  }

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin inline"/></div>
  if (!game) return <div className="p-20 text-center">Jeu introuvable</div>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
       {/* Header */}
       <div className="flex justify-between items-start">
          <div>
            <Link href="/admin/games" className="flex items-center gap-2 text-slate-500 mb-2 hover:text-slate-800">
                <ArrowLeft size={20}/> Retour aux jeux
            </Link>
            <h1 className="text-3xl font-black text-slate-800">{game.name}</h1>
          </div>
          <Link href={`/qr/${game.restaurant_id}`} target="_blank" className="bg-white border-2 border-slate-900 text-slate-900 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50">
             <QrCode size={18}/> Voir le QR Code Client
          </Link>
       </div>

       <div className="grid md:grid-cols-2 gap-8">
          
          {/* COLONNE GAUCHE : AJOUTER UN LOT */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Plus className="bg-purple-100 text-purple-600 rounded p-1" size={24}/> Ajouter un lot
              </h2>
              <form onSubmit={handleAddPrize} className="space-y-4">
                  <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Nom du lot</label>
                      <input required type="text" placeholder="Ex: 1 Café Offert" className="w-full p-3 border rounded-lg" 
                        value={newPrize.label} onChange={e => setNewPrize({...newPrize, label: e.target.value})}
                      />
                  </div>
                  <div className="flex gap-4">
                      <div className="flex-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Couleur</label>
                          <div className="flex items-center gap-2 mt-1">
                              <input type="color" className="h-10 w-full cursor-pointer" 
                                value={newPrize.color} onChange={e => setNewPrize({...newPrize, color: e.target.value})}
                              />
                          </div>
                      </div>
                      <div className="flex-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Proba (Poids)</label>
                          <input type="number" min="1" max="100" className="w-full p-3 border rounded-lg" 
                             value={newPrize.weight} onChange={e => setNewPrize({...newPrize, weight: parseInt(e.target.value)})}
                          />
                      </div>
                  </div>
                  <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800">
                      Ajouter à la roue
                  </button>
              </form>
          </div>

          {/* COLONNE DROITE : LISTE DES LOTS */}
          <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-700">Lots actifs ({prizes.length})</h2>
              {prizes.map((prize) => (
                  <div key={prize.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="w-4 h-12 rounded-full" style={{ backgroundColor: prize.color }}></div>
                          <div>
                              <p className="font-bold text-slate-800">{prize.label}</p>
                              <p className="text-xs text-slate-400">Poids: {prize.weight}</p>
                          </div>
                      </div>
                      <button onClick={() => handleDeletePrize(prize.id)} className="text-red-400 hover:text-red-600 p-2">
                          <Trash2 size={18}/>
                      </button>
                  </div>
              ))}
              {prizes.length === 0 && <p className="text-slate-400 italic">Aucun lot configuré.</p>}
          </div>

       </div>
    </div>
  )
}