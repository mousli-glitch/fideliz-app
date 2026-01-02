"use server"

import { createClient } from '@supabase/supabase-js'

// 👇 ON UTILISE LA CLÉ SERVICE ROLE (ADMIN SUPRÊME)
// Cela permet de contourner les règles RLS qui bloquaient l'affichage
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 1. Récupérer tous les gagnants (Pour la liste)
export async function getAdminWinners() {
  const { data, error } = await supabaseAdmin
    .from('winners')
    .select(`
      *,
      games ( name ),
      prizes ( label, color, weight )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Erreur Fetch Winners:", error)
    return []
  }
  return data
}

// 2. Valider un gain (Redeem)
export async function redeemWinnerAction(winnerId: string) {
  const { error } = await supabaseAdmin
    .from('winners')
    .update({ 
      status: 'consumed',
      consumed_at: new Date().toISOString()
    })
    .eq('id', winnerId)

  if (error) throw new Error(error.message)
  
  // On revalidate pour mettre à jour l'interface sans recharger
  return { success: true }
}

// 3. Récupérer les stats (Pour le futur dashboard)
export async function getAdminStats() {
    const { count: winnersCount } = await supabaseAdmin.from('winners').select('*', { count: 'exact', head: true })
    const { count: gamesCount } = await supabaseAdmin.from('games').select('*', { count: 'exact', head: true })
    
    // Exemple simple, on pourra enrichir
    return {
        winners: winnersCount || 0,
        games: gamesCount || 0
    }
}