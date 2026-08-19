"use server"

import { createClient } from '@supabase/supabase-js'
import { validateEmail, normalizePhone } from '@/utils/contact-validation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * Cette action est joignable SANS COMPTE — c'est sa raison d'être : un joueur
 * n'en a pas. Elle porte pourtant la clé de service, qui contourne la RLS.
 * Tout ce qu'elle rend est donc rendu au monde entier, et la projection
 * ci-dessous est le seul filtre entre la base et l'inconnu.
 *
 * Le 19/08/2026, `get_replay_status` rendait `play_count` — le nombre de
 * participations d'une adresse e-mail sur un jeu donné. Les identifiants de
 * jeu étant publics, n'importe qui pouvait interroger n'importe quelle
 * adresse. La RPC a cessé de le rendre (migration 20260819120000) ; ce module
 * a cessé de tout relayer aveuglément. Les deux barrières sont indépendantes :
 * si la RPC recommençait un jour à rendre ce champ, il ne ressortirait pas
 * d'ici pour autant.
 */
type ReponseReplay = {
  ok: true
  replay: boolean
  status?: string
  hours_left?: number
  action?: string
  action_url?: string
}

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

    /*
     * Projection explicite — surtout PAS `...result`.
     *
     * Le spread relayait tout champ que la RPC décidait d'ajouter, connu ou
     * non du client. C'est exactement ainsi que `play_count` sortait. Ce qui
     * n'est pas nommé ici ne sort pas : ajouter un champ à la réponse devient
     * une décision, au lieu d'un effet de bord.
     *
     * Les cinq champs listés sont ceux que `public-game-client.tsx` lit
     * réellement — vérifié sur tout le dépôt le 19/08/2026.
     */
    const reponse: ReponseReplay = { ok: true, replay: result?.replay === true }
    if (typeof result?.status === 'string') reponse.status = result.status
    if (typeof result?.hours_left === 'number') reponse.hours_left = result.hours_left
    if (typeof result?.action === 'string') reponse.action = result.action
    if (typeof result?.action_url === 'string') reponse.action_url = result.action_url
    return reponse
  } catch (e: any) {
    console.error("🚨 Crash checkReplayStatusAction:", e)
    return { ok: false, error: e.message }
  }
}
