'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteGameAction(gameId: string, slug: string) {
  // CORRECTION ICI : Ajout de 'await'
  const supabase = await createClient()

  // 1. Suppression dans Supabase
  const { error } = await supabase
    .from('games') 
    .delete()
    .eq('id', gameId)

  if (error) {
    console.error('Erreur suppression Supabase:', error)
    throw new Error('Impossible de supprimer le jeu')
  }

  // 2. Rafraîchir le cache
  revalidatePath(`/admin/${slug}/games`)
}