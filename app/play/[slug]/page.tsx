import { createClient } from "@supabase/supabase-js" 
import { PublicGameClient } from "@/components/game/public-game-client"

// 👇 Force le rafraîchissement des données à chaque visite (évite les bugs de cache couleur)
export const revalidate = 0 

// Connexion Admin (Service Role) pour contourner le RLS et être sûr de trouver les données
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Vérifie si c'est un format UUID (ID compliqué) ou un texte (Slug simple)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

  let game = null
  let restaurant = null

  // ---------------------------------------------------------
  // SCÉNARIO 1 : C'est un ID de JEU (Cas du QR Code)
  // ---------------------------------------------------------
  if (isUUID) {
    const { data: foundGame } = await (supabase.from('games') as any)
      .select('*')
      .eq('id', slug)
      .single()

    if (foundGame) {
      game = foundGame
      const { data: foundResto } = await (supabase.from('restaurants') as any)
        .select('*')
        .eq('id', foundGame.restaurant_id)
        .single()
      restaurant = foundResto
    }
  }

  // ---------------------------------------------------------
  // SCÉNARIO 2 : C'est un SLUG de RESTAURANT (Cas du lien manuel)
  // ---------------------------------------------------------
  if (!restaurant) {
    let query = (supabase.from('restaurants') as any).select('*')
    
    if (isUUID) { 
        query = query.eq('id', slug) 
    } else { 
        query = query.eq('slug', slug) 
    }

    const { data: foundResto } = await query.single()
    restaurant = foundResto

    if (restaurant) {
        const { data: activeGame } = await (supabase.from('games') as any)
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .eq('status', 'active')
            .single()
        game = activeGame
    }
  }

  // ---------------------------------------------------------
  // VERDICT FINAL
  // ---------------------------------------------------------
  if (!restaurant) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-10 font-sans">
            <div className="text-center max-w-md">
                <div className="text-4xl mb-4">🤔</div>
                <h1 className="text-xl font-bold mb-2">Restaurant introuvable</h1>
                <p className="text-slate-400 text-sm">L'identifiant <code className="bg-slate-800 p-1 rounded text-yellow-500">{slug}</code> ne correspond à aucun établissement.</p>
            </div>
        </div>
    )
  }

  if (!game) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans">
           <div className="text-center">
              <div className="text-4xl mb-4">😴</div>
              <h1 className="text-xl font-bold mb-2">Pas de jeu en cours</h1>
              <p className="text-slate-400">Le restaurant <span className="text-blue-400 font-bold">{restaurant.name}</span> n'a pas de campagne active pour le moment.</p>
           </div>
        </div>
     )
  }

  const { data: prizes } = await (supabase.from('prizes') as any)
    .select('*')
    .eq('game_id', game.id)
    .order('weight', { ascending: false })

  // 🔥 MODIFICATION ICI : On extrait card_style depuis game.design pour le mettre à la racine
  const gameWithMappedDesign = {
    ...game,
    card_style: game.design?.card_style || 'dark'
  }

  const restaurantWithDesign = {
    ...restaurant,
    design: game.design
  }

  return (
    <PublicGameClient 
      game={gameWithMappedDesign} 
      prizes={prizes || []} 
      restaurant={restaurantWithDesign} 
    />
  )
}