'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteGameAction(gameId: string, slug: string) {
  const supabase = await createClient()

  // 1. Suppression dans Supabase avec vérification du nombre (count)
  const { error, count } = await supabase
    .from('games') 
    .delete({ count: 'exact' }) // 🔥 On demande le compte exact
    .eq('id', gameId)

  if (error) {
    console.error('Erreur suppression Supabase:', error)
    throw new Error('Erreur technique lors de la suppression')
  }

  // 🔥 C'est ici que le problème se trouvait :
  if (count === 0) {
    console.error('Aucune ligne supprimée. Problème de droits RLS.')
    throw new Error('Impossible de supprimer : Vous n\'avez pas les droits ou le jeu n\'existe pas.')
  }

  // 2. Rafraîchir le cache
  revalidatePath(`/admin/${slug}/games`)
}