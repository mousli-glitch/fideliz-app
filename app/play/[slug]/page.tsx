import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { GameConfigV1 } from '@/types/game-config'
import GameInterface from '@/components/game-interface' // On importe notre nouveau composant

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function PlayPage({ params }: PageProps) {
  const { slug } = await params

  // 1. Récupération (Cerveau)
  const { data: game, error } = await supabase
    .from('games')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (error || !game) {
    notFound()
  }

  // 2. Passage de relais (Muscles)
  // On passe la configuration au composant Client qui va gérer l'affichage
  return <GameInterface config={game.config as GameConfigV1} />
}