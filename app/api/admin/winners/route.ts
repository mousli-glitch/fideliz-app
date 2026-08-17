import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/utils/supabase/server'
import { deciderValidationTicket } from '@/lib/securite/garde-admin'
import { journaliser } from '@/lib/securite/journal'

/*
 * ═══════════════════════════════════════════════════════════════
 *  VALIDATION D'UN TICKET — MÊME ÉTANCHÉITÉ QUE L'ACTION
 * ═══════════════════════════════════════════════════════════════
 *
 * Cette route consommait un ticket sur simple `{id}` dans le corps de la
 * requête, avec la clé de service et AUCUN contrôle : n'importe qui
 * connaissant l'UUID d'un gagnant — celui-là même qui est encodé dans le
 * QR du ticket client, donc lisible par quiconque voit le papier —
 * pouvait le brûler à distance.
 *
 * Corrigé le 15/08/2026, durci le 17/08/2026.
 *
 * La chaîne de contrôles reproduit celle de `validateWinAction`
 * (app/actions/validate-win.ts), qui est la voie normale de validation :
 * session → profil → compte actif → rôle → étanchéité en remontant du
 * ticket vers son jeu.
 *
 * L'expiration est SIGNALÉE, jamais opposée. Une première version renvoyait
 * 410 sur un ticket périmé — c'était une erreur : le scanner de caisse offre
 * explicitement « Valider quand même » sur ce cas précis
 * (app/admin/[slug]/scanner/page.tsx:186). C'est un geste commercial voulu,
 * pas un trou. Un restaurateur authentifié qui honore le ticket d'un client
 * revenu un jour trop tard rend service ; le refuser aurait retiré une
 * fonctionnalité en croyant fermer une faille. La péremption part donc au
 * journal, et c'est tout.
 *
 * Le journal, justement : un refus d'étanchéité est exactement ce qu'on veut
 * pouvoir retrouver après coup.
 *
 * Ce qui n'est PAS ici : le contrôle de module. Fideliz n'a pas encore de
 * table d'entitlements — elle arrive avec la fusion. Le jour où elle
 * existera, sa vérification se pose entre l'étanchéité et le statut.
 */

export async function PATCH(request: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    // ─── 1. Qui appelle ? ───
    const session = await createSessionClient()
    const {
      data: { user },
    } = await session.auth.getUser()

    const { data: profile } = user
      ? await session.from('profiles').select('role, restaurant_id, is_active').eq('id', user.id).single()
      : { data: null }

    const p = profile as { role?: string; restaurant_id?: string; is_active?: boolean } | null

    let corps: Record<string, unknown> = {}
    try {
      corps = (await request.json()) ?? {}
    } catch {
      corps = {}
    }
    const id = corps.id

    /* Le ticket et son jeu ne sont lus que si l'appelant a déjà une identité
       recevable : sinon un anonyme se servirait de cette route comme d'un
       oracle sur l'existence d'un UUID. */
    type Ticket = { id: string; status: string | null; game_id: string | null; created_at: string | null }
    type Jeu = { id: string; restaurant_id: string | null; validity_days: number | null }

    let ticket: Ticket | null = null
    let jeu: Jeu | null = null
    const identiteRecevable =
      !!user && !!p && p.is_active !== false && ['restaurant', 'root'].includes(p.role ?? '')

    if (identiteRecevable && typeof id === 'string') {
      const { data: t } = await admin
        .from('winners')
        .select('id, status, game_id, created_at')
        .eq('id', id)
        .maybeSingle()
      ticket = (t as Ticket | null) ?? null

      if (ticket?.game_id) {
        const { data: g } = await admin
          .from('games')
          .select('id, restaurant_id, validity_days')
          .eq('id', ticket.game_id)
          .maybeSingle()
        jeu = (g as Jeu | null) ?? null
      }
    }

    const verdict = deciderValidationTicket({
      authentifie: !!user,
      profil: p,
      identifiantDemande: id,
      ticket,
      jeu,
      maintenant: new Date(),
    })

    if (!verdict.ok) {
      if (user) {
        await journaliser(admin, {
          action: 'admin.winner.validation_refus',
          accepte: false,
          message: `Validation refusée : ${verdict.motif}`,
          userId: user.id,
          userEmail: user.email,
          restaurantId: jeu?.restaurant_id ?? null,
          details: { motif: verdict.motif, ticket: typeof id === 'string' ? id : null },
        })
      }
      return NextResponse.json({ error: verdict.message, motif: verdict.motif }, { status: verdict.statut })
    }

    // ─── 2. Consommation, avec l'anti-double-validation d'origine ───
    /* Le `.eq('status','available')` reste la vraie garantie d'unicité : deux
       appels simultanés voient tous deux « available », mais un seul verra sa
       condition satisfaite au moment de l'écriture. Le second reçoit zéro
       ligne, et un 409. C'est Postgres qui arbitre, pas nous. */
    const { data, error } = await admin
      .from('winners')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('id', id as string)
      .eq('status', 'available')
      .select('id,status,redeemed_at')

    if (error) throw error

    if (!data || data.length === 0) {
      await journaliser(admin, {
        action: 'admin.winner.validation_refus',
        accepte: false,
        message: 'Validation refusée : COURSE_PERDUE',
        userId: user!.id,
        userEmail: user!.email,
        restaurantId: jeu?.restaurant_id ?? null,
        details: { motif: 'COURSE_PERDUE', ticket: id },
      })
      return NextResponse.json(
        { success: false, motif: 'DEJA_CONSOMME', message: 'Ce ticket vient d’être utilisé.' },
        { status: 409 }
      )
    }

    await journaliser(admin, {
      action: 'admin.winner.validation',
      accepte: true,
      message: verdict.perime ? 'Ticket périmé validé quand même' : 'Ticket validé en caisse',
      userId: user!.id,
      userEmail: user!.email,
      restaurantId: jeu?.restaurant_id ?? null,
      details: { ticket: id, perime: !!verdict.perime },
    })

    return NextResponse.json({ success: true, data: data[0] })
  } catch (error: unknown) {
    console.error('Erreur API winners:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
