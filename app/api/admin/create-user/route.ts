import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, password, role, restaurant_id } = await request.json()

    // INITIALISATION DU CLIENT ADMIN
    // On utilise la SERVICE_ROLE_KEY qui a les droits de contourner la sécurité
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Assure-toi que cette clé est dans ton .env
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 1. CRÉATION DE L'UTILISATEUR DANS AUTH
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Évite au client de devoir confirmer son mail pour tester
      user_metadata: { 
        role: role,
        restaurant_id: restaurant_id 
      }
    })

    if (authError) throw authError

    return NextResponse.json({ 
      success: true, 
      userId: authUser.user.id 
    })

  } catch (error: any) {
    console.error('Erreur API Admin:', error.message)
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}