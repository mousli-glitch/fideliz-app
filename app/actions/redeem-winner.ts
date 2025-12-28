"use server"

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function redeemWinner(winnerId: string, pageSlug: string) {
  try {
    // 1. Mise à jour dans Supabase
    const { error } = await supabase
      .from('winners')
      .update({ status: 'redeemed' }) // On passe en 'récupéré'
      .eq('id', winnerId)

    if (error) throw error

    // 2. On rafraîchit la page Admin automatiquement pour voir le changement
    revalidatePath(`/admin/${pageSlug}`)
    return { success: true }

  } catch (error) {
    console.error("Erreur validation:", error)
    return { success: false }
  }
}