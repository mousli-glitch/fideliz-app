import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import QrCard from "@/components/QrCard"

export default async function QRPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  
  // 1. Récupération de l'ID du jeu depuis l'URL
  const { id } = await params

  // 2. On récupère le jeu ET le restaurant lié pour avoir le slug
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

  // 🔥 CORRECTION ICI : On caste 'game' en 'any' pour éviter l'erreur "never"
  const restaurantSlug = (game as any).restaurants?.slug

  if (!restaurantSlug) {
    return <div className="p-10 text-center">Erreur : Ce jeu n'est pas lié à un restaurant avec un slug valide.</div>
  }

  // 3. On définit l'URL de base pour pointer vers le SCAN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fideliz-app-fawn.vercel.app"
  
  // On construit l'URL du scan : .../scan/nom-du-resto
  const scanBaseUrl = `${appUrl}/scan`

  // On délègue l'affichage au client
  return <QrCard slug={restaurantSlug} baseUrl={scanBaseUrl} />
}