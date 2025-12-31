"use client"

import { useEffect, useState, use } from "react"
import { createClient } from "@/utils/supabase/client"
import { Loader2, Store, AlertCircle } from "lucide-react"
import { PublicGameClient } from "@/components/game/public-game-client" // 👈 Import Important

export default function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // On utilise 'any' pour simplifier l'intégration finale
  const [restaurant, setRestaurant] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [prizes, setPrizes] = useState<any[]>([])

  useEffect(() => {
    const fetchGameData = async () => {
      if (!slug) return
      
      // 1. Récupérer le Restaurant
      const { data: restoData, error: restoError } = await (supabase.from("public_restaurants") as any)
        .select("*")
        .eq("slug", slug)
        .single()

      if (restoError || !restoData) {
        setError("Restaurant introuvable")
        setLoading(false)
        return
      }
      setRestaurant(restoData)

      // 2. Récupérer le Jeu Actif
      const { data: gameData } = await (supabase.from("games") as any)
        .select("*")
        .eq("restaurant_id", restoData.id)
        .eq("status", "active")
        .single()

      if (gameData) {
        setGame(gameData)
        // 3. Récupérer les Lots
        const { data: prizesData } = await (supabase.from("prizes") as any)
          .select("*")
          .eq("game_id", gameData.id)
          .order("weight", { ascending: true })
          
        if (prizesData) setPrizes(prizesData)
      }
      setLoading(false)
    }
    fetchGameData()
  }, [slug])

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" /></div>
  
  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <Store size={48} className="text-slate-300 mb-4" />
      <h1 className="text-xl font-bold text-slate-800">Oups !</h1>
      <p className="text-slate-500 mt-2">{error}</p>
    </div>
  )

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 overflow-hidden"
      style={{ 
        backgroundColor: restaurant?.brand_color || "#000",
        color: restaurant?.text_color || "#fff",
        backgroundImage: restaurant?.bg_image_url ? `url(${restaurant.bg_image_url})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Overlay sombre léger pour lisibilité */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-0"></div>

      <div className="relative z-10 w-full max-w-md">
        {/* EN-TÊTE FIXE */}
        <div className="text-center mb-8">
          {restaurant?.logo_url && (
            <img src={restaurant.logo_url} alt="Logo" className="w-24 h-24 mx-auto mb-4 rounded-full object-cover shadow-2xl border-4 border-white" />
          )}
          <h1 className="text-3xl font-black tracking-tight drop-shadow-md">{restaurant?.name}</h1>
        </div>

        {/* CONTENU DYNAMIQUE */}
        {!game ? (
          <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 text-center">
            <AlertCircle className="mx-auto mb-2 opacity-80" />
            <p className="font-bold">Aucun jeu en cours</p>
          </div>
        ) : (
          // 👇 C'EST ICI QUE LE VRAI JEU EST APPELÉ
          <PublicGameClient game={game} prizes={prizes} restaurant={restaurant} />
        )}
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-4 text-center w-full z-10 opacity-30 text-[10px] font-mono pointer-events-none">
        Powered by Fideliz
      </div>
    </div>
  )
}