import { createClient } from "@supabase/supabase-js" 
import { PublicGameClient } from "@/components/game/public-game-client"

export const revalidate = 0 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

  let game: any = null
  let restaurant: any = null

  // SCÉNARIO 1 : ID JEU
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

  // SCÉNARIO 2 : SLUG RESTO
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

  // Gestion des erreurs
  if (!restaurant) return <ErrorScreen title="Expérience introuvable" code={slug} />
  if (!game) return <ErrorScreen title="Pas de jeu en cours" message={`Cette expérience n'est pas disponible pour le moment.`} />

  // ✅ BLOCAGE RESTAURANT (NEUTRE, SANS NOM)
  // source de vérité = is_blocked (mais compat si blocked_at / is_active)
  if (restaurant?.is_blocked === true || restaurant?.blocked_at || restaurant?.is_active === false) {
    return (
      <ErrorScreen
        title="Service momentanément indisponible"
        message="Cette expérience est temporairement suspendue. Merci de réessayer plus tard."
      />
    )
  }

  // Récupération des lots
  const { data: prizes } = await (supabase.from('prizes') as any)
    .select('*')
    .eq('game_id', game.id)
    .order('weight', { ascending: false })

  const gameWithDesign = {
    ...game,
    card_style: game.card_style || 'dark'
  }

  const restaurantWithDesign = {
    ...restaurant,
    design: {
      card_style: game.card_style || 'dark'
    }
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-y-auto bg-black font-sans">
      {game.bg_image_url && (
        <div 
          className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat z-0"
          style={{ backgroundImage: `url('${game.bg_image_url}')` }}
        />
      )}

      <div className="fixed inset-0 bg-black/30 z-10" />

      <div className="relative z-20 w-full min-h-[100dvh] flex flex-col">
        <PublicGameClient 
          game={gameWithDesign} 
          prizes={prizes || []} 
          restaurant={restaurantWithDesign} 
        />
      </div>
    </div>
  )
}

function ErrorScreen({ title, message, code }: { title: string, message?: string, code?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 font-sans text-center">
      <div className="max-w-md space-y-4">
        <div className="text-5xl">🛠️</div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {message && <p className="text-slate-400">{message}</p>}
        {code && <p className="text-slate-500 text-sm font-mono bg-slate-900 p-2 rounded inline-block">{code}</p>}
      </div>
    </div>
  )
}
