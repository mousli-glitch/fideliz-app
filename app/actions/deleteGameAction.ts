'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteGameAction(gameId: string, slug: string) {
  // 1. Connexion Supabase
  const supabase = await createClient()

  // 🔍 DEBUG : Qui essaie de supprimer ?
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.error("❌ ERREUR AUTH : Utilisateur non connecté ou session invalide.")
    throw new Error("Vous n'êtes pas connecté.")
  }
  console.log("👤 User ID connecté :", user.id)
  console.log("🗑 Tentative suppression du jeu ID :", gameId)

  // 2. Suppression dans Supabase
  const { error, count } = await supabase
    .from('games') 
    .delete({ count: 'exact' }) 
    .eq('id', gameId)

  // 3. Analyse du résultat
  if (error) {
    console.error('❌ ERREUR TECHNIQUE SUPABASE :', error)
    throw new Error(`Erreur technique: ${error.message}`)
  }

  // Si count est 0, c'est que la RLS a bloqué silencieusement
  if (count === 0) {
    console.error('⛔️ ACCÈS REFUSÉ (RLS) : Supabase a dit "succès" mais a supprimé 0 ligne.')
    console.error('👉 Vérifie que ce jeu appartient bien à un restaurant qui appartient à cet User ID.')
    throw new Error('Impossible de supprimer : Vous n\'avez pas les droits sur ce jeu.')
  }

  console.log("✅ SUCCÈS : Jeu supprimé !")

  // 4. Rafraîchir le cache
  revalidatePath(`/admin/${slug}/games`)
}