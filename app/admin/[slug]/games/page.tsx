"use client"

import { useEffect, useState } from "react"
import { getAdminGames, deleteGameAction } from "../../../actions/admin"
import { Loader2, Plus, Trash2, QrCode, Gamepad2, Star, Camera, Facebook, Video, Pencil, Globe } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

export default function AdminGamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const params = useParams()

  const fetchGames = async () => {
    setLoading(true)
    const data = await getAdminGames()
    
    // TRI : Le jeu actif en premier, puis les archivés par date décroissante
    const sortedGames = data.sort((a: any, b: any) => {
        if (a.status === 'active') return -1
        if (b.status === 'active') return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    setGames(sortedGames)
    setLoading(false)
  }

  useEffect(() => { fetchGames() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce jeu ?")) return
    await deleteGameAction(id)
    setGames(prev => prev.filter(g => g.id !== id))
  }

  const getIcon = (type: string) => {
    switch(type) {
        case 'INSTAGRAM': return <Camera size={14} className="text-pink-600"/>
        case 'FACEBOOK': return <Facebook size={14} className="text-blue-600"/>
        case 'TIKTOK': return <Video size={14} className="text-black"/>
        case 'GOOGLE_REVIEW': return <Globe size={14} className="text-blue-500"/>
        default: return <Star size={14} className="text-orange-500"/>
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Gamepad2 className="text-purple-600"/> Mes Jeux
        </h1>
        <Link href={`/admin/${params.slug}/games/new`} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg transition-all active:scale-95">
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
                <Link href={`/admin/${params.slug}/games/new`} className="text-purple-600 font-bold underline">Créez le premier !</Link>
            </div>
          )}
          
          {games.map((game) => {
            const isActive = game.status === 'active'

            return (
              <div 
                key={game.id} 
                className={`p-6 rounded-2xl border flex flex-col md:flex-row justify-between items-center transition-all ${isActive ? 'bg-white border-green-200 shadow-md ring-1 ring-green-100' : 'bg-white border-slate-200 opacity-75 hover:opacity-100'}`}
              >
                  <div className="mb-4 md:mb-0 text-center md:text-left">
                      <div className="flex items-center gap-3 justify-center md:justify-start mb-2">
                          <h3 className={`text-xl font-bold ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>{game.name}</h3>
                          
                          {/* BADGES DE STATUT : VERT VS ROUGE */}
                          {isActive ? (
                              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] uppercase font-black border border-green-200 flex items-center gap-2 tracking-wider">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                En ligne
                              </span>
                          ) : (
                              <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] uppercase font-black border border-red-100 flex items-center gap-2 tracking-wider">
                                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                                Hors ligne
                              </span>
                          )}
                      </div>

                      <div className="flex items-center gap-2 justify-center md:justify-start text-sm text-slate-500 font-medium">
                          <div className="bg-slate-50 border border-slate-200 px-2 py-1 rounded-md flex items-center gap-1.5">
                              {getIcon(game.active_action)}
                              <span className="text-xs uppercase tracking-tighter">{game.active_action}</span>
                          </div>
                          <span className="text-slate-300">•</span>
                          <span className="truncate max-w-[250px] italic">{game.action_url}</span>
                      </div>
                  </div>

                  <div className="flex gap-2">
                      <Link 
                          href={`/admin/${params.slug}/games/${game.id}`} 
                          className="px-4 py-2 bg-white border border-slate-200 hover:border-purple-300 hover:text-purple-600 rounded-xl font-bold text-sm text-slate-600 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                      >
                          <Pencil size={14} /> Modifier
                      </Link>

                      <Link href={`/qr/${game.restaurant_id}`} target="_blank" className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors border border-blue-100 shadow-sm" title="Voir le jeu">
                          <QrCode size={20}/>
                      </Link>
                      
                      <button onClick={() => handleDelete(game.id)} className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors border border-red-100 shadow-sm active:scale-95" title="Supprimer">
                          <Trash2 size={20}/>
                      </button>
                  </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}