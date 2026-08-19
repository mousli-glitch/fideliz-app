"use server"

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { validateEmail, validatePhone } from '@/utils/contact-validation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

async function getIpHash(): Promise<string | null> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for') || ''
    const ip = fwd.split(',')[0].trim() || h.get('x-real-ip') || ''
    if (!ip) return null
    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fideliz-salt'
    return createHash('sha256').update(salt + ip).digest('hex')
  } catch {
    return null
  }
}

// MODE SÉCURISÉ : le joueur est identifié AVANT la roue ; le serveur fait le tirage
// et enregistre la participation en une seule fois (impossible de rejouer / choisir son lot).
export async function playGameAction(data: any) {
  try {
    const emailCheck = validateEmail(data.email)
    if (emailCheck.status === 'invalid') {
      return { success: false, error: 'invalid_email', message: emailCheck.message }
    }
    let cleanPhone: string | null = null
    if (data.phone && String(data.phone).trim()) {
      const phoneCheck = validatePhone(data.phone)
      if (phoneCheck.status === 'invalid') {
        return { success: false, error: 'invalid_phone', message: phoneCheck.message }
      }
      cleanPhone = phoneCheck.clean
    }

    // Rate-limit IP (seuil réglable par jeu)
    const ipHash = await getIpHash()
    if (ipHash) {
      let maxPerHour = RATE_LIMIT_MAX
      const { data: g } = await supabaseAdmin
        .from('games').select('ip_rate_limit_per_hour').eq('id', data.game_id).single()
      if (g && (g as any).ip_rate_limit_per_hour) maxPerHour = Number((g as any).ip_rate_limit_per_hour)
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
      const { count } = await supabaseAdmin
        .from('winners').select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash).gt('created_at', since)
      if ((count ?? 0) >= maxPerHour) {
        return { success: false, error: 'rate_limited', message: "Trop de participations depuis cet appareil. Merci de réessayer plus tard." }
      }
    }

    const { data: result, error } = await supabaseAdmin.rpc('play_game', {
      p_game_id: data.game_id,
      p_email: emailCheck.clean,
      p_phone: cleanPhone,
      p_first_name: data.first_name,
      p_marketing_optin: data.opt_in ?? false,
    })

    if (error) {
      console.error("❌ Erreur RPC play_game:", error.message)
      return { success: false, error: error.message }
    }
    if (!result?.success) {
      return { success: false, error: result?.error || 'unknown_error', hours_left: result?.hours_left ?? null, message: (result as any)?.message }
    }

    if (ipHash && result.winner_id) {
      await supabaseAdmin.from('winners').update({ ip_hash: ipHash }).eq('id', result.winner_id)
    }

    return {
      success: true,
      prize_id: result.prize_id,
      prize_label: result.prize_label,
      ticket: {
        winner_id: result.winner_id,
        qr_code: result.qr_code,
        expires_at: result.expires_at,
        /*
         * `result.min_spend || 0` se trouvait ici. Sur un minimum indéterminé,
         * `null || 0` vaut 0 — « aucun minimum ». C'est le `else 0` du SQL,
         * recopié en JavaScript : le corriger d'un côté et le laisser de
         * l'autre n'aurait rien corrigé du tout.
         *
         * `min_spend` reste en EUROS, comme avant. `min_spend_cents` est la
         * référence, et `null` y veut dire « indéterminé », pas « aucun ».
         */
        min_spend: result.min_spend ?? null,
        min_spend_cents: result.min_spend_cents ?? null,
      },
    }
  } catch (e: any) {
    console.error("🚨 Crash playGameAction:", e)
    return { success: false, error: e.message }
  }
}
