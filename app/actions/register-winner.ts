"use server"

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { validateEmail, validatePhone } from '@/utils/contact-validation'
import { estGelDeBascule, messageMaintenance, ERREUR_MAINTENANCE } from "@/lib/securite/maintenance"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rate-limit : nombre max de participations par IP sur la fenêtre glissante
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 heure

// IP hashée (RGPD) : on ne stocke jamais l'IP en clair
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

// Enregistrement d'un gagnant via la fonction SQL transactionnelle `register_win` :
// - décrémentation atomique du stock (jamais négatif)
// - anti-rejeu (1 participation par e-mail et par jeu) / délai si rejouabilité
// - création du contact CRM (non bloquante)
// - rate-limit par IP (anti-spam rapide, sans bloquer les clients d'un même WiFi)
export async function registerWinnerAction(data: any) {
  try {
    // Filtre anti-faux (backstop serveur) : bloque les contacts clairement invalides
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

    // Rate-limit par IP : trop de participations récentes depuis la même IP = on bloque temporairement.
    // Le seuil est réglable par jeu (games.ip_rate_limit_per_hour), défaut 5.
    const ipHash = await getIpHash()
    if (ipHash) {
      let maxPerHour = RATE_LIMIT_MAX
      const { data: g } = await supabaseAdmin
        .from('games')
        .select('ip_rate_limit_per_hour')
        .eq('id', data.game_id)
        .single()
      if (g && (g as any).ip_rate_limit_per_hour) maxPerHour = Number((g as any).ip_rate_limit_per_hour)

      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
      const { count } = await supabaseAdmin
        .from('winners')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gt('created_at', since)
      if ((count ?? 0) >= maxPerHour) {
        return { success: false, error: 'rate_limited', message: "Trop de participations depuis cet appareil. Merci de réessayer plus tard." }
      }
    }

    const { data: result, error } = await supabaseAdmin.rpc('register_win', {
      p_game_id: data.game_id,
      p_prize_id: data.prize_id,
      p_email: emailCheck.clean,
      p_phone: cleanPhone,
      p_first_name: data.first_name,
      p_marketing_optin: data.opt_in ?? false,
    })

    if (error) {
      /*
       * Le gel de bascule d'abord. Sans cette branche, l'erreur remontait au
       * client qui la relançait, la rattrapait, et affichait un écran TICKET
       * portant « ERREUR-CONTACT-STAFF » — un faux ticket, que l'employé
       * n'aurait rien pu scanner. Mesuré sur banc le 20/08/2026.
       */
      if (estGelDeBascule(error)) {
        return { success: false, error: ERREUR_MAINTENANCE, message: messageMaintenance(error) }
      }
      console.error("❌ Erreur RPC register_win:", error.message)
      return { success: false, error: error.message }
    }

    if (!result?.success) {
      // Cas métier : already_played, stock_empty, replay_too_soon, game_not_found, prize_not_found
      return { success: false, error: result?.error || "unknown_error", hours_left: result?.hours_left ?? null }
    }

    // On enregistre l'IP hashée sur la participation (pour le rate-limit futur)
    if (ipHash && result.winner_id) {
      await supabaseAdmin.from('winners').update({ ip_hash: ipHash }).eq('id', result.winner_id)
    }

    return {
      success: true,
      ticket: {
        winner_id: result.winner_id,
        qr_code: result.qr_code,
        expires_at: result.expires_at,
        /*
         * Voir `play-game.ts` : `|| 0` transformait un minimum indéterminé en
         * « aucun minimum ». `min_spend` reste en EUROS ; `min_spend_cents`
         * est la référence, et `null` y signifie « indéterminé ».
         */
        min_spend: result.min_spend ?? null,
        min_spend_cents: result.min_spend_cents ?? null,
      },
    }
  } catch (e: any) {
    console.error("🚨 Crash registerWinnerAction:", e)
    return { success: false, error: e.message }
  }
}
