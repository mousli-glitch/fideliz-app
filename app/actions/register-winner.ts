"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Enregistrement d'un gagnant via la fonction SQL transactionnelle `register_win` :
// - décrémentation atomique du stock (jamais négatif)
// - anti-rejeu (1 participation par e-mail et par jeu)
// - création du contact CRM (non bloquante)
export async function registerWinnerAction(data: any) {
  try {
    const { data: result, error } = await supabaseAdmin.rpc('register_win', {
      p_game_id: data.game_id,
      p_prize_id: data.prize_id,
      p_email: data.email,
      p_phone: data.phone || null,
      p_first_name: data.first_name,
      p_marketing_optin: data.opt_in ?? false,
    })

    if (error) {
      console.error("❌ Erreur RPC register_win:", error.message)
      return { success: false, error: error.message }
    }

    if (!result?.success) {
      // Cas métier : already_played, stock_empty, game_not_found, prize_not_found
      return { success: false, error: result?.error || "unknown_error" }
    }

    return {
      success: true,
      ticket: {
        winner_id: result.winner_id,
        qr_code: result.qr_code,
        expires_at: result.expires_at,
        min_spend: result.min_spend || 0,
      },
    }
  } catch (e: any) {
    console.error("🚨 Crash registerWinnerAction:", e)
    return { success: false, error: e.message }
  }
}
