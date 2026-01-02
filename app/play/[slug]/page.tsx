import { createClient } from "@/utils/supabase/client"
import { PublicGameClient } from "@/components/game/public-game-client"

// 👇 INDISPENSABLE : On désactive le cache pour voir les changements DIRECTEMENT
export const revalidate = 0 

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = createClient()
  const { slug } = await params

  // --- LOGIQUE INTELLIGENTE ---
  // On vérifie si le "slug" est en fait un ID (UUID)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

  let query = (supabase.from('public_restaurants') as any).select('*')

  if (isUUID) {
    // Si c'est un ID (comme ton lien actuel), on cherche par ID
    query = query.eq('id', slug)
  } else {
    // Sinon, on cherche par Slug (le nom)
    query = query.eq('slug', slug)
  }

  const { data: restaurant, error: restoError } = await query.single()

  if (restoError || !restaurant) {
    return <div className="p-10 text-center">Restaurant introuvable ({slug})</div>
  }

  // 2. Récupérer le JEU ACTIF de ce restaurant
  const { data: game, error: gameError } = await (supabase.from('games') as any)
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'active')
    .single()

  if (gameError || !game) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
           <div className="text-center">
              <h1 className="text-xl font-bold mb-2">Pas de jeu en cours 😢</h1>
              <p>Revenez plus tard !</p>
           </div>
        </div>
     )
  }

  // 3. Récupérer les LOTS associés
  const { data: prizes } = await (supabase.from('prizes') as any)
    .select('*')
    .eq('game_id', game.id)
    .order('weight', { ascending: false })

  // 4. On envoie tout ça au composant Client
  return (
    <PublicGameClient 
      game={game} 
      prizes={prizes || []} 
      restaurant={restaurant} 
    />
  )
}