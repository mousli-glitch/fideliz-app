'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteGameAction(gameId: string, slug: string) {
  // ✅ CORRECTION MAJEURE ICI : 'await' a été ajouté
  // Sans cela, le serveur plante (Erreur 500) car il essaie d'utiliser une Promesse
  const supabase = await createClient()

  // 1. Suppression dans Supabase avec vérification du nombre (count)
  const { error, count } = await supabase
    .from('games') 
    .delete({ count: 'exact' }) // On demande à Supabase combien de lignes ont été supprimées
    .eq('id', gameId)

  // Gestion des erreurs techniques (ex: base de données hors ligne)
  if (error) {
    console.error('Erreur suppression Supabase:', error)
    throw new Error('Erreur technique lors de la suppression')
  }

  // 2. Gestion des droits (RLS)
  // Si count vaut 0, c'est que la suppression n'a pas eu lieu (souvent à cause des droits)
  if (count === 0) {
    console.error('Aucune ligne supprimée. Problème de droits RLS ou ID incorrect.')
    throw new Error('Impossible de supprimer : Vous n\'avez pas les droits ou le jeu n\'existe pas.')
  }

  // 3. Rafraîchir le cache pour mettre à jour l'interface
  revalidatePath(`/admin/${slug}/games`)
}