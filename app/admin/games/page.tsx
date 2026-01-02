"use client"

import { useEffect, useState } from "react"
import { getAdminGames, toggleGameStatusAction, deleteGameAction } from "../../actions/admin"
import { Loader2, Plus, Power, Trash2, QrCode, Gamepad2, Star, Camera, Facebook, Video } from "lucide-react"
import Link from "next/link"

export default function AdminGamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGames = async () => {
    setLoading(true)
    const data = await getAdminGames()
    setGames(data)
    setLoading(false)
  }

  useEffect(() => { fetchGames() }, [])

  const handleToggle = async (game: any) => {
    await toggleGameStatusAction(game.id, game.status)
    fetchGames()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce jeu ?")) return
    await deleteGameAction(id)
    setGames(prev => prev.filter(g => g.id !== id))
  }

  // Petite icône selon le réseau
  const getIcon = (type: string) => {
    switch(type) {
        case 'INSTAGRAM': return <Camera size={16} className="text-pink-600"/>
        case 'FACEBOOK': return <Facebook size={16} className="text-blue-600"/>
        case 'TIKTOK': return <Video size={16} className="text-black"/>
        default: return <Star size={16} className="text-orange-500"/>
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Gamepad2 className="text-purple-600"/> Mes Jeux
        </h1>
        <Link href="/admin/games/new" className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800">
          <Plus size={20} /> Nouveau Jeu
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-purple-500 w-12 h-12"/></div>
      ) : (
        <div className="grid gap-4">
          {games.length === 0 && (
            <div className="text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                <p className="text-slate-400 mb-4">Aucun jeu pour l'instant.</p>
                <Link href="/admin/games/new" className="text-purple-600 font-bold underline">Créez le premier !</Link>
            </div>
          )}
          {games.map((game) => (
            <div key={game.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center hover:border-purple-200 transition-all">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-slate-800">{game.name}</h3>
                        <div className="bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1">
                            {getIcon(game.active_action)}
                            <span className="text-xs font-bold text-slate-600">{game.active_action}</span>
                        </div>
                    </div>
                    <p className="text-sm text-slate-400 max-w-md truncate">{game.action_url}</p>
                </div>
                <div className="flex gap-2">
                    <Link href={`/admin/games/${game.id}`} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-sm text-slate-700 transition-colors">
                        Gérer les lots 🎁
                    </Link>
                    <Link href={`/qr/${game.restaurant_id}`} target="_blank" className="p-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors" title="Voir le jeu">
                        <QrCode size={20}/>
                    </Link>
                    <button onClick={() => handleDelete(game.id)} className="p-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors">
                        <Trash2 size={20}/>
                    </button>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}