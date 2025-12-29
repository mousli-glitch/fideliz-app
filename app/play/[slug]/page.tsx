import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { GameInterface } from '@/components/game-interface'

// 1. Initialisation du Client Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 2. Définition des Props (ce que la page reçoit de l'URL)
interface PlayPageProps {
  params: Promise<{ slug: string }>
}

// 3. La Page Principale (Async car on charge des données)
export default async function PlayPage({ params }: PlayPageProps) {
  const { slug } = await params

  // 4. Récupération des données depuis Supabase
  // On récupère aussi brand_color et logo_url maintenant !
  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('id, name, slug, brand_color, logo_url') 
    .eq('slug', slug)
    .single()

  // 5. Gestion d'erreur (Si le resto n'existe pas)
  if (error || !restaurant) {
    return notFound()
  }

  // Configuration des cadeaux (Statique pour la V1, dynamique plus tard)
  const prizes = [
    { id: '1', label: 'Un Café Offert', color: '#fbbf24' },
    { id: '2', label: '-10% Addition', color: '#f87171' },
    { id: '3', label: 'Un Digestif', color: '#a78bfa' },
    { id: '4', label: 'Perdu...', color: '#94a3b8' },
    { id: '5', label: 'Un Dessert', color: '#34d399' },
    { id: '6', label: 'Une Surprise', color: '#60a5fa' },
  ]

  // 6. Affichage du Jeu
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* On passe les nouvelles données au composant */}
      <GameInterface 
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        prizes={prizes}
        brandColor={restaurant.brand_color} // <-- Ici la couleur dynamique
        logoUrl={restaurant.logo_url}       // <-- Ici le logo dynamique
      />
    </main>
  )
}