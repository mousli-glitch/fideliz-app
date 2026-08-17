'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { exigerRestaurantParSlug, tracerAction } from '@/lib/securite/garde-action'

/*
 * GARDE INTERNE (18/08/2026) — restaurateur, sur SON restaurant.
 *
 * L'action ne vérifiait que la session, puis supprimait par `id` en laissant
 * la RLS trancher — le commentaire d'origine le disait lui-même : « si count
 * est 0, c'est que la RLS a bloqué silencieusement ». Se reposer sur un
 * effet de bord pour deviner qu'on n'avait pas le droit n'est pas un
 * contrôle : c'est une lecture d'après-coup.
 *
 * Le `slug` est résolu et confronté à la session, puis le jeu visé est
 * rattaché à ce restaurant. Supprimer un jeu efface ses lots et rend un QR
 * imprimé muet ; ça mérite mieux qu'un compteur à zéro.
 */
export async function deleteGameAction(gameId: string, slug: string) {
  const garde = await exigerRestaurantParSlug(slug, ['restaurant', 'root'], 'jeu.suppression')
  if (!garde.ok) throw new Error(garde.error)

  const supabase = await createClient()

  // Le jeu visé appartient-il bien à ce restaurant ?
  const { data: jeu } = await supabase
    .from('games')
    .select('id, restaurant_id')
    .eq('id', gameId)
    .maybeSingle()

  if (!jeu || (jeu as { restaurant_id?: string }).restaurant_id !== garde.restaurant!.id) {
    throw new Error("Ce jeu n'appartient pas à ce restaurant.")
  }

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