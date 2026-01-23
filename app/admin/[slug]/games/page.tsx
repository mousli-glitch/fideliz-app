"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Gamepad2, Plus, Edit, QrCode, Trash2, ExternalLink, ArrowRight, Loader2, Play, Power, Package, AlertTriangle } from "lucide-react" 
import { createClient } from "@/utils/supabase/client"
import { useParams } from "next/navigation"

// Import des actions serveur
import { deleteGameAction } from "@/app/actions/deleteGameAction"
import { activateGameAction } from "@/app/actions/activateGameAction"

export default function GamesListPage() {
  const [games, setGames] = useState<any[]>([]) 
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  const params = useParams()
  const supabase = createClient()
  const slug = params?.slug as string

  // 1. Charger les données (AVEC LES LOTS)
  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return

      const { data: rawResto } = await supabase
        .from("restaurants")
        .select("id, name, slug")
        .eq("slug", slug)
        .single()
      
      const restoData = rawResto as any

      if (restoData) {
        setRestaurant(restoData)

        // On récupère les jeux ET les prizes associés
        const { data: gamesData } = await supabase
          .from("games")
          .select("*, prizes(*)") 
          .eq("restaurant_id", restoData.id)
          .order("created_at", { ascending: false })
        
        setGames(gamesData || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [slug])

  // Fonction de Suppression
  const handleDelete = async (gameId: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce jeu définitivement ?")) {
      try {
        await deleteGameAction(gameId, slug)
        setGames((currentGames) => currentGames.filter((g) => g.id !== gameId))
      } catch (error) {
        alert("Une erreur est survenue lors de la suppression.")
      }
    }
  }

  // Fonction d'Activation
  const handleActivate = async (gameId: string) => {
    const newGamesState = games.map(g => ({
      ...g,
      status: g.id === gameId ? 'active' : 'archived'
    }))
    setGames(newGamesState)

    try {
      await activateGameAction(gameId, restaurant.id, slug)
    } catch (error) {
      console.error(error)
      alert("Erreur lors de l'activation")
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600 w-10 h-10"/></div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24">
      <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
        
        {/* EN-TÊTE RESPONSIVE */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
              <Gamepad2 className="text-purple-600" size={32} />
              Mes Jeux
            </h1>
            <p className="text-slate-500 font-medium mt-1 text-sm md:text-base">
              Gérez vos campagnes pour <span className="text-slate-900 font-bold">{restaurant?.name}</span>.
              <br/>
              <span className="text-[10px] md:text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 inline-block">
                ℹ️ Un seul jeu peut être actif à la fois.
              </span>
            </p>
          </div>

          <Link
            href={`/admin/${slug}/games/new`}
            className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg active:scale-95 transition-all text-sm md:text-base"
          >
            <Plus size={20} />
            Nouveau Jeu
          </Link>
        </div>

        {/* LISTE DES JEUX */}
        <div className="grid grid-cols-1 gap-4">
          {games.length > 0 ? (
            games.map((game) => {
              const isActive = game.status === 'active';
              
              return (
              <div
                key={game.id}
                className={`group bg-white rounded-2xl p-4 md:p-6 shadow-sm border flex flex-col items-start justify-between gap-4 transition-all ${
                  isActive ? 'border-green-500 ring-1 ring-green-500 shadow-green-50' : 'border-slate-200 hover:border-blue-200'
                }`}
              >
                {/* LIGNE DU HAUT : INFO DU JEU + STATUT */}
                <div className="w-full flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg md:text-xl font-bold text-slate-900 truncate">
                            {game.name || "Jeu sans nom"}
                            </h2>
                            
                            {isActive ? (
                            <span className="bg-green-100 text-green-700 px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-green-200 shrink-0">
                                <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse"></span>
                                Actif
                            </span>
                            ) : (
                            <span className="bg-slate-100 text-slate-500 px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider border border-slate-200 shrink-0">
                                Inactif
                            </span>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs md:text-sm text-slate-500 font-medium">
                            <span className="bg-slate-100 px-2 py-1 rounded-lg text-slate-600 font-mono text-[9px] md:text-[10px] uppercase border border-slate-200 w-fit">
                            {game.active_action || "JEU"}
                            </span>
                            <a
                            href={game.action_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 flex items-center gap-1 truncate max-w-full sm:max-w-[200px] hover:underline"
                            >
                            {game.action_url}
                            <ExternalLink size={10} />
                            </a>
                        </div>
                    </div>

                    {/* BOUTONS D'ACTION */}
                    <div className="grid grid-cols-4 sm:flex items-center gap-2 w-full md:w-auto">
                        <button
                            onClick={() => !isActive && handleActivate(game.id)}
                            disabled={isActive}
                            className={`col-span-4 sm:col-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all text-sm border ${
                            isActive 
                                ? "bg-green-50 text-green-700 border-green-200 cursor-default" 
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900"
                            }`}
                            title={isActive ? "Ce jeu est actuellement visible" : "Activer ce jeu"}
                        >
                            <Power size={16} className={isActive ? "fill-green-700" : ""} />
                            {isActive ? "Activé" : "Activer"}
                        </button>

                        <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>

                        <Link
                            href={`/admin/${slug}/games/${game.id}`}
                            className="w-full sm:w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all"
                            title="Modifier"
                        >
                            <Edit size={16} />
                        </Link>

                        <a
                            href={`/play/${game.id}`}
                            target="_blank"
                            className="w-full sm:w-10 h-10 flex items-center justify-center bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors border border-purple-100 cursor-pointer"
                            title="Tester"
                        >
                            <Play size={18} />
                        </a>

                        <Link
                            href={`/qr/${game.id}`}
                            target="_blank"
                            className="w-full sm:w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100 cursor-pointer"
                            title="QR Code"
                        >
                            <QrCode size={18} />
                        </Link>
                        
                        <button 
                            onClick={() => handleDelete(game.id)}
                            className="w-full sm:w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors border border-red-100 opacity-60 hover:opacity-100"
                            title="Supprimer"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                {/* 🔥 LIGNE DES STOCKS EN TEMPS RÉEL */}
                {game.is_stock_limit_active ? (
                    <div className="w-full mt-2 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                            <Package size={14} className="text-slate-400"/>
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">État des stocks</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                            {game.prizes && game.prizes.length > 0 ? (
                                game.prizes.map((prize: any) => {
                                    // Logique couleur : Rouge si <= 0, Sinon Vert/Gris
                                    const isOutOfStock = prize.quantity !== null && prize.quantity <= 0;
                                    const isLowStock = prize.quantity !== null && prize.quantity > 0 && prize.quantity < 5;
                                    
                                    return (
                                        <div 
                                            key={prize.id} 
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                                isOutOfStock 
                                                    ? 'bg-red-50 border-red-200 text-red-700' 
                                                    : isLowStock
                                                        ? 'bg-orange-50 border-orange-200 text-orange-800'
                                                        : 'bg-white border-slate-200 text-slate-700'
                                            }`}
                                        >
                                            <span>{prize.label}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                isOutOfStock 
                                                    ? 'bg-red-200 text-red-900' 
                                                    : isLowStock
                                                        ? 'bg-orange-200 text-orange-900'
                                                        : 'bg-slate-100 text-slate-800'
                                            }`}>
                                                {prize.quantity !== null ? prize.quantity : '∞'}
                                            </span>
                                            {isOutOfStock && <AlertTriangle size={10} className="text-red-600"/>}
                                        </div>
                                    )
                                })
                            ) : (
                                <span className="text-xs text-slate-400 italic">Aucun lot configuré pour ce jeu.</span>
                            )}
                        </div>
                    </div>
                ) : (
                    // Si stocks désactivés
                    <div className="w-full mt-1 pt-2 border-t border-slate-50 flex items-center gap-2 opacity-50">
                        <Package size={12} className="text-slate-400"/>
                        <span className="text-[10px] text-slate-400 italic">Gestion des stocks désactivée pour ce jeu (Illimité).</span>
                    </div>
                )}

              </div>
            )})
          ) : (
            // EMPTY STATE
            <div className="flex flex-col items-center justify-center py-12 md:py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-center px-4">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                <Gamepad2 size={40} />
              </div>
              <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2">Aucun jeu créé</h3>
              <p className="text-slate-500 text-sm md:text-base max-w-sm mb-8">
                Créez votre premier jeu pour commencer à fidéliser vos clients.
              </p>
              <Link
                href={`/admin/${slug}/games/new`}
                className="bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center gap-2"
              >
                Créer mon premier jeu <ArrowRight size={20}/>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}