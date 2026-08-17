import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/utils/supabase/server'

/*
 * ═══════════════════════════════════════════════════════════════
 *  VALIDATION D'UN TICKET — MÊME ÉTANCHÉITÉ QUE L'ACTION
 * ═══════════════════════════════════════════════════════════════
 *
 * Cette route consommait un ticket sur simple `{id}` dans le corps de la
 * requête, avec la clé de service et AUCUN contrôle : n'importe qui
 * connaissant l'UUID d'un gagnant — celui-là même qui est encodé dans le
 * QR du ticket client — pouvait le brûler à distance. Le seul garde-fou
 * (`.eq('status','available')`) empêche la double validation, pas le
 * tiers.
 *
 * Corrigé le 15/08/2026. La chaîne de contrôles reproduit exactement
 * celle de `validateWinAction` (app/actions/validate-win.ts:70-128), qui
 * est la voie normale de validation : session → profil → compte actif →
 * rôle → et surtout l'étanchéité, en remontant du ticket vers son jeu
 * pour comparer le restaurant.
 *
 * Sans cette dernière vérification, un restaurateur authentifié pourrait
 * consommer les tickets d'un confrère : c'est le contrôle qui compte, pas
 * la simple présence d'une session.
 */

export async function PATCH(request: Request) {
  try {
    // ─── 1. Session ───
    const session = await createSessionClient()
    const {
      data: { user },
    } = await session.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { data: profile } = await session
      .from('profiles')
      .select('role, restaurant_id, is_active')
      .eq('id', user.id)
      .single()

    const p = profile as { role?: string; restaurant_id?: string; is_active?: boolean } | null
    if (!p) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 })
    }
    if (p.is_active === false) {
      return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 })
    }
    if (!['restaurant', 'root'].includes(p.role ?? '')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 })
    }

    // ─── 2. Clé de service, une fois l'appelant connu ───
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ─── 3. Étanchéité : ce ticket appartient-il à SON restaurant ? ───
    const { data: win } = await supabaseAdmin
      .from('winners')
      .select('id, game_id')
      .eq('id', id)
      .single()

    if (!win) {
      return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })
    }

    const { data: game } = await supabaseAdmin
      .from('games')
      .select('id, restaurant_id')
      .eq('id', (win as { game_id: string }).game_id)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Jeu introuvable pour ce ticket' }, { status: 404 })
    }

    if (p.role !== 'root') {
      const g = game as { restaurant_id: string }
      if (!p.restaurant_id || p.restaurant_id !== g.restaurant_id) {
        return NextResponse.json(
          { error: 'Ce ticket ne correspond pas à votre restaurant' },
          { status: 403 }
        )
      }
    }

    // ─── 4. Consommation, avec l'anti-double-validation d'origine ───
    const { data, error } = await supabaseAdmin
      .from('winners')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'available')
      .select('id,status,redeemed_at')

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, message: "Aucune ligne mise à jour (status != 'available' ou id invalide)." },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, data: data[0] })
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
