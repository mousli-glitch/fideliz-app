"use server"

import { createClient } from '@supabase/supabase-js'
import { validateEmail, normalizePhone } from '@/utils/contact-validation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Appelée AVANT de jouer (uniquement si la rejouabilité est active) :
// - vérifie si le joueur (e-mail/téléphone) doit attendre le délai -> status 'too_soon'
// - sinon renvoie l'action du moment (issue de la séquence) -> status 'ok'
export async function checkReplayStatusAction(data: {
  game_id: string
  email: string
  phone?: string
}) {
  try {
    const emailCheck = validateEmail(data.email)
    if (emailCheck.status === 'invalid') {
      return { ok: false, error: 'invalid_email', message: emailCheck.message }
    }

    const { data: result, error } = await supabaseAdmin.rpc('get_replay_status', {
      p_game_id: data.game_id,
      p_email: emailCheck.clean,
      p_phone: data.phone ? (normalizePhone(data.phone) || null) : null,
    })

    if (error) {
      console.error("❌ Erreur RPC get_replay_status:", error.message)
      return { ok: false, error: error.message }
    }

    if (result?.error) {
      return { ok: false, error: result.error }
    }

    return { ok: true, ...result }
  } catch (e: any) {
    console.error("🚨 Crash checkReplayStatusAction:", e)
    return { ok: false, error: e.message }
  }
}
