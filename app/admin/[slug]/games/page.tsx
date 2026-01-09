"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Gamepad2, Plus, Edit, QrCode, Trash2, ExternalLink, ArrowRight, Loader2, Play } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { useParams } from "next/navigation"

// 🔥 AJOUT : On importe l'action serveur que tu viens de créer
import { deleteGameAction } from "@/app/actions/deleteGameAction"

export default function GamesListPage() {
  // On force le type en tableau <any[]> pour éviter les erreurs TypeScript
  const [games, setGames] = useState<any[]>([]) 
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  const params = useParams()
  const supabase = createClient()
  const slug = params?.slug as string

  // 1. Charger les données (Restaurant + Liste des jeux)
  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return

      // Récupérer le restaurant
      const { data: rawResto } = await supabase
        .from("restaurants")
        .select("id, name, slug")
        .eq("slug", slug)
        .single()
      
      const restoData = rawResto as any

      if (restoData) {
        setRestaurant(restoData)

        // Récupérer les jeux liés
        const { data: gamesData } = await supabase
          .from("games")
          .select("*")
          .eq("restaurant_id", restoData.id)
          .order("created_at", { ascending: false })
        
        // On s'assure que c'est un tableau
        setGames(gamesData || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [slug])

  // 2. Fonction de Suppression (MODIFIÉE)
  const handleDelete = async (gameId: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce jeu définitivement ?")) {
      try {
        // A. On appelle l'action serveur pour supprimer en BDD
        await deleteGameAction(gameId, slug)

        // B. Si ça réussit, on met à jour l'affichage localement tout de suite
        setGames((currentGames) => currentGames.filter((g) => g.id !== gameId))
        
        // Optionnel : un petit console log pour debug
        console.log("Jeu supprimé avec succès")

      } catch (error) {
        console.error("Erreur lors de la suppression:", error)
        alert("Une erreur est survenue lors de la suppression.")
      }
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
              Gérez vos campagnes de fidélité pour <span className="text-slate-900 font-bold">{restaurant?.name}</span>.
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
            games.map((game) => (
              <div
                key={game.id}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:shadow-md hover:border-blue-200 transition-all"
              >
                {/* INFO DU JEU */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                      {game.name || "Jeu sans nom"}
                    </h2>
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-green-200">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse"></span>
                      En ligne
                    </span>
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
                  
                  {/* Modifier */}
                  <Link
                    href={`/admin/${slug}/games/${game.id}`}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold hover:border-slate-300 hover:bg-slate-50 transition-all text-sm"
                  >
                    <Edit size={16} />
                    Modifier
                  </Link>

                  {/* 🔥 NOUVEAU BOUTON : JOUER (Lien direct) */}
                  <a
                    href={`/play/${game.id}`}
                    target="_blank"
                    className="w-11 h-11 flex items-center justify-center bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors border border-purple-100 cursor-pointer"
                    title="Tester le jeu"
                  >
                    <Play size={20} className="ml-1" /> {/* ml-1 pour centrer visuellement le triangle */}
                  </a>

                  {/* QR Code */}
                  <Link
                    href={`/qr/${game.id}`}
                    target="_blank"
                    className="w-11 h-11 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100 cursor-pointer"
                  >
                    <QrCode size={20} />
                  </Link>
                  
                  {/* Supprimer */}
                  <button 
                    onClick={() => handleDelete(game.id)}
                    className="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors border border-red-100 opacity-60 hover:opacity-100"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            // EMPTY STATE (Si liste vide)
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                <Gamepad2 size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Aucun jeu créé</h3>
              <p className="text-slate-500 max-w-sm mb-8">
                Vous n'avez pas encore de campagne active.
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