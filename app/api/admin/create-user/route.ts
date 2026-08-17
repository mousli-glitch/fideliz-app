import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/utils/supabase/server'
import { deciderCreationCompte } from '@/lib/securite/garde-admin'
import { journaliser } from '@/lib/securite/journal'

/*
 * ═══════════════════════════════════════════════════════════════
 *  CRÉATION DE COMPTE — RÉSERVÉE AU ROOT
 * ═══════════════════════════════════════════════════════════════
 *
 * Cette route n'avait AUCUN contrôle. Elle acceptait `role` et
 * `restaurant_id` depuis le corps de la requête et appelait
 * `auth.admin.createUser` avec la clé de service : n'importe qui
 * connaissant l'URL pouvait se fabriquer un compte root et prendre la
 * main sur la plateforme entière. Le middleware ne la couvrait pas
 * (matcher limité à /admin et /super-admin).
 *
 * Corrigé le 15/08/2026, durci le 17/08/2026.
 *
 * La décision d'autoriser vit dans `lib/securite/garde-admin.ts`, à part.
 * Ce n'est pas un goût pour l'abstraction : on ne peut pas ouvrir une
 * session de root depuis une suite de tests sans manipuler un vrai mot de
 * passe, donc la seule façon de PROUVER que le refus fonctionne est de
 * pouvoir l'exécuter sans réseau ni session. La route se contente
 * d'appliquer le verdict.
 *
 * Le rôle demandé est borné : cette route ne peut pas fabriquer un root,
 * même appelée par un root. Un root se crée à la main, en base.
 *
 * Note : aucun code du dépôt n'appelle cette route. Elle est conservée
 * plutôt que supprimée pour qu'un éventuel appel externe reçoive un 401
 * explicite, et non un 404 qui masquerait le problème.
 */

export async function POST(request: Request) {
  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

  try {
    // ─── 1. Qui appelle ? ───
    const session = await createSessionClient()
    const {
      data: { user },
    } = await session.auth.getUser()

    const { data: profile } = user
      ? await session.from('profiles').select('role, restaurant_id, is_active').eq('id', user.id).single()
      : { data: null }

    // ─── 2. La charge utile, avant tout usage ───
    let charge: Record<string, unknown> = {}
    try {
      charge = (await request.json()) ?? {}
    } catch {
      charge = {}
    }

    /* L'existence du restaurant se vérifie avec la clé de service — mais
       seulement si l'appelant est déjà passé pour un root. On ne fait pas
       tourner la clé de service pour le compte d'un inconnu. */
    let restaurantExiste: boolean | undefined
    const roleDemande = charge.role
    const restoDemande = charge.restaurant_id
    if (
      (profile as { role?: string } | null)?.role === 'root' &&
      roleDemande === 'restaurant' &&
      typeof restoDemande === 'string'
    ) {
      const { data: resto } = await admin().from('restaurants').select('id').eq('id', restoDemande).maybeSingle()
      restaurantExiste = !!resto
    }

    const verdict = deciderCreationCompte({
      authentifie: !!user,
      profil: profile as { role?: string; restaurant_id?: string; is_active?: boolean } | null,
      charge,
      restaurantExiste,
    })

    if (!verdict.ok) {
      /* On ne journalise pas les appels anonymes : ils sont légion sur une
         URL publique, et noieraient les refus qui apprennent quelque chose —
         ceux d'un compte identifié qui tente ce qu'il n'a pas le droit. */
      if (user) {
        await journaliser(admin(), {
          action: 'admin.create_user.refus',
          accepte: false,
          message: `Création de compte refusée : ${verdict.motif}`,
          userId: user.id,
          userEmail: user.email,
          details: { motif: verdict.motif, role_demande: charge.role ?? null },
        })
      }
      return NextResponse.json({ error: verdict.message }, { status: verdict.statut })
    }

    // ─── 3. Seulement maintenant, la création ───
    const { email, password, role, restaurant_id } = charge as {
      email: string
      password: string
      role: string
      restaurant_id?: string
    }

    const supabaseAdmin = admin()
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { role, restaurant_id: role === 'restaurant' ? restaurant_id : null },
    })

    if (authError) throw authError

    await journaliser(supabaseAdmin, {
      action: 'admin.create_user',
      accepte: true,
      message: `Compte ${role} créé`,
      userId: user!.id,
      userEmail: user!.email,
      restaurantId: role === 'restaurant' ? restaurant_id : null,
      details: { cible: authUser.user.id, role },
    })

    return NextResponse.json({ success: true, userId: authUser.user.id })
  } catch (error: unknown) {
    /* Le message d'erreur brut de Supabase pouvait révéler l'existence d'un
       compte. On le garde dans les journaux du serveur, pas dans la réponse. */
    console.error('Erreur API create-user:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'La création a échoué.' }, { status: 500 })
  }
}
