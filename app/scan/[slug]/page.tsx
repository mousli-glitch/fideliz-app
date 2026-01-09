import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Gamepad2 } from 'lucide-react'

// On définit params comme une Promise (Spécifique Next.js 15)
export default async function SmartScanPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient()
  
  // 1. On attend que les paramètres soient chargés
  const { slug } = await params

  // 2. On trouve le restaurant via son slug
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!restaurant) {
    return <div className="p-10 text-center text-slate-500">Restaurant introuvable ({slug}).</div>
  }

  // Astuce TypeScript : on force le type pour éviter l'erreur "never"
  const restoId = (restaurant as any).id
  const restoName = (restaurant as any).name

  // 3. On cherche LE jeu actif pour ce restaurant
  const { data: activeGame } = await supabase
    .from('games')
    .select('id')
    .eq('restaurant_id', restoId)
    .eq('status', 'active') // On prend celui qui est vert !
    .single()

  // 4. Si on trouve un jeu actif, on redirige le joueur dessus
  if (activeGame) {
    const gameId = (activeGame as any).id
    redirect(`/play/${gameId}`)
  }

  // 5. Sinon, on affiche une page d'attente
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
        <Gamepad2 size={40} className="text-slate-300" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Pas de jeu en cours</h1>
      <p className="text-slate-500 max-w-md">
        Le restaurant <strong>{restoName}</strong> n'a pas de campagne active pour le moment. 
        <br/>Revenez plus tard !
      </p>
    </div>
  )
}