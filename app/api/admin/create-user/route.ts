import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/utils/supabase/server'

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
 * Corrigé le 15/08/2026. La garde suit le pattern déjà employé par les
 * routes saines du projet (voir app/api/sales/dashboard/route.ts) :
 * session → profil → rôle, AVANT toute instanciation du client de
 * service.
 *
 * Le rôle demandé est borné : cette route ne peut pas fabriquer un root.
 * Un root se crée à la main, en base — jamais par une requête HTTP.
 *
 * Note : aucun code du dépôt n'appelle cette route. Elle est conservée
 * plutôt que supprimée pour qu'un éventuel appel externe reçoive un 401
 * explicite, et non un 404 qui masquerait le problème.
 */

const ROLES_AUTORISES = ['restaurant', 'sales'] as const

export async function POST(request: Request) {
  try {
    // ─── 1. Qui appelle ? ───
    const session = await createSessionClient()
    const {
      data: { user },
    } = await session.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { data: profile } = await session
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile as { role?: string }).role !== 'root') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // ─── 2. Que demande-t-on ? ───
    const { email, password, role, restaurant_id } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 })
    }
    if (!ROLES_AUTORISES.includes(role)) {
      return NextResponse.json(
        { error: `Rôle invalide. Attendu : ${ROLES_AUTORISES.join(' ou ')}.` },
        { status: 400 }
      )
    }

    // ─── 3. Seulement maintenant, la clé de service ───
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, restaurant_id },
    })

    if (authError) throw authError

    return NextResponse.json({ success: true, userId: authUser.user.id })
  } catch (error: any) {
    console.error('Erreur API Admin:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
