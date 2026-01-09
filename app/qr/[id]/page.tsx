import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import QrCard from "@/components/QrCard"

export default async function QRPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  
  // 1. Récupération de l'ID du jeu
  const { id } = await params

  // 2. On récupère le jeu ET le restaurant
  const { data: game } = await supabase
    .from('games')
    .select(`
      *,
      restaurants (
        slug
      )
    `)
    .eq('id', id)
    .single()

  if (!game) return notFound()

  // On récupère le slug du restaurant
  const restaurantSlug = (game as any).restaurants?.slug

  if (!restaurantSlug) {
    return <div className="p-10 text-center">Erreur : Ce jeu n'est pas lié à un restaurant avec un slug valide.</div>
  }

  // 3. On construit l'URL INTELLIGENTE
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fideliz-app-fawn.vercel.app"
  
  // 🔥 C'est ici qu'on retire le "/play/" qui posait problème
  // L'URL sera : https://.../scan/pointb
  const smartUrl = `${appUrl}/scan/${restaurantSlug}`

  // On passe 'url' explicitement à QrCard
  return <QrCard url={smartUrl} slug={restaurantSlug} />
}