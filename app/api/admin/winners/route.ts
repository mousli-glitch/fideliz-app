import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialisation Admin
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// 1. LISTER LES GAGNANTS (GET)
export async function GET(request: Request) {
  try {
    // CORRECTION ICI : On précise le nom exact de la contrainte (FK) pour lever l'ambiguïté
    const { data, error } = await supabaseAdmin
      .from('winners')
      .select('*, restaurants!fk_winners_restaurants(name, slug)') 
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
        console.error("ERREUR SUPABASE:", error);
        throw error;
    }

    return NextResponse.json({ winners: data })
  } catch (error: any) {
    return NextResponse.json({ 
        error: 'Erreur serveur', 
        details: error.message || String(error),
        hint: error.hint || "Aucun indice",
        code: error.code || "N/A"
    }, { status: 500 })
  }
}

// 2. VALIDER UN GAIN (PATCH)
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('winners')
      .update({ 
        status: 'redeemed', 
        redeemed_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'available') 
      .select()

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Gain déjà validé !' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ 
        error: 'Erreur serveur',
        details: error.message || String(error)
    }, { status: 500 })
  }
}