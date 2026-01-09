"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Gamepad2, Plus, Edit, QrCode, Trash2, ExternalLink, ArrowRight, Loader2, Play, Power } from "lucide-react" // 🔥 J'ai retiré 'ScanLine'
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

  // 1. Charger les données
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

        const { data: gamesData } = await supabase
          .from("games")
          .select("*")
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
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* EN-TÊTE */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
              <Gamepad2 className="text-purple-600" size={32} />
              Mes Jeux
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              Gérez vos campagnes pour <span className="text-slate-900 font-bold">{restaurant?.name}</span>.
              <br/>
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 inline-block">
                ℹ️ Un seul jeu peut être actif à la fois.
              </span>
            </p>
          </div>

          <Link
            href={`/admin/${slug}/games/new`}
            className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
          >
            <Plus size={20} />
            Nouveau Jeu
          </Link>
        </div>

        {/* LISTE DES JEUX */}
        <div className="space-y-4">
          {games.length > 0 ? (
            games.map((game) => {
              const isActive = game.status === 'active';
              
              return (
              <div
                key={game.id}
                className={`group bg-white rounded-2xl p-6 shadow-sm border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all ${
                  isActive ? 'border-green-500 ring-1 ring-green-500 shadow-green-100' : 'border-slate-200 hover:border-blue-200'
                }`}
              >
                {/* INFO DU JEU */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900">
                      {game.name || "Jeu sans nom"}
                    </h2>
                    
                    {isActive ? (
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-green-200">
                        <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse"></span>
                        En ligne (Actif)
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                        Inactif
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 font-medium">
                    <span className="bg-slate-100 px-2 py-1 rounded-lg text-slate-600 font-mono text-[10px] uppercase border border-slate-200">
                      {game.active_action || "JEU"}
                    </span>
                    <span className="hidden md:inline text-slate-300">•</span>
                    <a
                      href={game.action_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 flex items-center gap-1 truncate max-w-[200px] hover:underline"
                    >
                      {game.action_url}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                {/* BOUTONS D'ACTION */}
                <div className="flex items-center gap-2 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
                  
                  {/* BOUTON D'ACTIVATION */}
                  <button
                    onClick={() => !isActive && handleActivate(game.id)}
                    disabled={isActive}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all text-sm border ${
                      isActive 
                        ? "bg-green-50 text-green-700 border-green-200 cursor-default" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900"
                    }`}
                    title={isActive ? "Ce jeu est actuellement visible par les clients" : "Activer ce jeu (désactivera les autres)"}
                  >
                    <Power size={16} className={isActive ? "fill-green-700" : ""} />
                    {isActive ? "Activé" : "Activer"}
                  </button>

                  <div className="w-px h-8 bg-slate-200 mx-1 hidden md:block"></div>

                  {/* ❌ J'AI SUPPRIMÉ LE BOUTON SCAN ICI ❌ */}

                  {/* Modifier */}
                  <Link
                    href={`/admin/${slug}/games/${game.id}`}
                    className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all"
                    title="Modifier"
                  >
                    <Edit size={16} />
                  </Link>

                  {/* Play / Test (Lien direct vers le jeu, pour debug) */}
                  <a
                    href={`/play/${game.id}`}
                    target="_blank"
                    className="w-10 h-10 flex items-center justify-center bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors border border-purple-100 cursor-pointer"
                    title="Voir le jeu (ID direct)"
                  >
                    <Play size={18} className="ml-0.5" />
                  </a>

                  {/* QR Code */}
                  <Link
                    href={`/qr/${game.id}`}
                    target="_blank"
                    className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100 cursor-pointer"
                    title="Imprimer le QR Code"
                  >
                    <QrCode size={18} />
                  </Link>
                  
                  {/* Supprimer */}
                  <button 
                    onClick={() => handleDelete(game.id)}
                    className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors border border-red-100 opacity-60 hover:opacity-100"
                    title="Supprimer"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )})
          ) : (
            // EMPTY STATE
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                <Gamepad2 size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Aucun jeu créé</h3>
              <p className="text-slate-500 max-w-sm mb-8">
                Créez votre premier jeu pour commencer à fidéliser vos clients.
              </p>
              <Link
                href={`/admin/${slug}/games/new`}
                className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center gap-2"
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