'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function activateGameAction(gameId: string, restaurantId: string, slug: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non connecté")

  // 2. On désactive TOUS les jeux de ce restaurant
  await supabase
    .from('games')
    // @ts-ignore
    .update({ status: 'archived' })
    .eq('restaurant_id', restaurantId)

  // 3. On active UNIQUEMENT le jeu sélectionné
  const { error } = await supabase
    .from('games')
    // @ts-ignore
    .update({ status: 'active' })
    .eq('id', gameId)

  if (error) {
    console.error("Erreur activation:", error)
    throw new Error("Impossible d'activer ce jeu")
  }

  // 4. On rafraîchit la page
  revalidatePath(`/admin/${slug}/games`)
}