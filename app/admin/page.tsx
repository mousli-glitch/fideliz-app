import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

interface Restaurant {
  id: string
  slug: string | null
}

export default async function AdminGateway() {
  const supabase = await createClient()

  // On récupère le premier restaurant trouvé
  const { data: rawRestaurant } = await supabase
    .from("restaurants")
    .select("id, slug")
    .limit(1)
    .single()

  const restaurant = rawRestaurant as unknown as Restaurant

  if (restaurant) {
    // Si une URL personnalisée (slug) existe (ex: "chez-mario"), on l'utilise
    if (restaurant.slug && restaurant.slug.length > 1) {
      redirect(`/admin/${restaurant.slug}`)
    } 
    // Sinon on utilise l'ID classique
    else {
      redirect(`/admin/${restaurant.id}`)
    }
  }

  return <div>Aucun restaurant trouvé.</div>
}