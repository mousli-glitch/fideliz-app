import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { GameInterface } from '@/components/game-interface'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface PlayPageProps {
  params: Promise<{ slug: string }>
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { slug } = await params

  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('id, name, slug, brand_color, logo_url, background_url, text_color') 
    .eq('slug', slug)
    .single()

  if (error || !restaurant) {
    return notFound()
  }

  const prizes = [
    { id: '1', label: 'Un Café Offert', color: '#fbbf24' },
    { id: '2', label: '-10% Addition', color: '#f87171' },
    { id: '3', label: 'Un Digestif', color: '#a78bfa' },
    { id: '4', label: 'Perdu...', color: '#94a3b8' },
    { id: '5', label: 'Un Dessert', color: '#34d399' },
    { id: '6', label: 'Une Surprise', color: '#60a5fa' },
  ]

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <GameInterface 
        restaurantId={restaurant.id}
        gameSlug={slug} // 👈 VOILÀ LA CORRECTION : On envoie "demo" ici
        restaurantName={restaurant.name}
        prizes={prizes}
        brandColor={restaurant.brand_color}
        logoUrl={restaurant.logo_url}
        backgroundUrl={restaurant.background_url}
        textColor={restaurant.text_color}
      />
    </main>
  )
}