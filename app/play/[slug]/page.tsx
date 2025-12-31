import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import GameFlow from "@/components/game-flow"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface PlayPageProps {
  params: Promise<{ slug: string }>
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { slug } = await params

  // 1. Récupérer le Resto
  // 👇 MODIFICATION ICI : On ajoute 'slug' dans la liste des champs à récupérer
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug, name, brand_color, active_action, action_url, rules_text') 
    .eq('slug', slug)
    .single()

  if (!restaurant) return notFound()

  // 2. Récupérer les Cadeaux (Prizes)
  const { data: prizes } = await supabase
    .from('prizes')
    .select('*')

  // 3. On passe TOUT au GameFlow
  return (
    <main>
      <GameFlow 
        restaurant={restaurant} 
        prizes={prizes || []} 
      />
    </main>
  )
}