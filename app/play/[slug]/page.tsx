import { createClient } from "@supabase/supabase-js" 
import { PublicGameClient } from "@/components/game/public-game-client"
import { notFound } from "next/navigation"

// 👇 CRUCIAL : Ceci force le site à ne pas garder l'ancienne couleur en mémoire
export const revalidate = 0 

// Connexion Admin directe pour être sûr de tout lire
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // 1. On cherche le restaurant
  // On vérifie si c'est un ID (pour les tests) ou un Slug (pour le vrai lien)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

  let query = (supabase.from('restaurants') as any).select('*')
  if (isUUID) { query = query.eq('id', slug) } else { query = query.eq('slug', slug) }

  const { data: restaurant, error: restoError } = await query.single()

  if (restoError || !restaurant) {
    return <div className="p-10 text-center bg-black text-white">Restaurant introuvable ({slug})</div>
  }

  // 2. On cherche le jeu actif
  const { data: game, error: gameError } = await (supabase.from('games') as any)
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'active')
    .single()

  if (gameError || !game) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
           <div className="text-center">
              <h1 className="text-xl font-bold mb-2">Pas de jeu en cours 😢</h1>
              <p>Revenez plus tard !</p>
           </div>
        </div>
     )
  }

  // 3. On charge les lots
  const { data: prizes } = await (supabase.from('prizes') as any)
    .select('*')
    .eq('game_id', game.id)
    .order('weight', { ascending: false })

  // 4. On envoie tout au client
  // C'est ici que la couleur 'primary_color' du restaurant est passée au jeu
  return (
    <PublicGameClient 
      game={game} 
      prizes={prizes || []} 
      restaurant={restaurant} 
    />
  )
}