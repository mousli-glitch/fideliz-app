import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 1. Config & Sécurité
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variables d'environnement manquantes.")
}

// Client Admin (droit absolu)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // 2. Normalisation
    const slug = body.slug?.toString().trim().toLowerCase()
    const email = body.email?.toString().trim().toLowerCase()

    // 3. Validation Inputs
    if (!slug || !email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email valide et Slug requis' }, { status: 400 })
    }

    // 4. Vérifier le Restaurant (avec maybeSingle pour éviter le crash si introuvable)
    const { data: restaurant, error: restError } = await supabaseAdmin
      .from('restaurants')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()

    if (restError) {
      console.error("Erreur DB Restaurant:", restError)
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
    }
    
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant introuvable' }, { status: 404 })
    }

    // --- 5. ANTI-SPAM V1 (ROBUSTE) ---
    // On vérifie si une ligne existe déjà pour ce couple (restaurant + email)
    const { data: existingEntry, error: spamError } = await supabaseAdmin
      .from('winners')
      .select('id')
      .eq('restaurant_id', restaurant.id)
      .eq('email', email)
      .maybeSingle()

    // Gestion de l'erreur technique (Ajustement 1)
    if (spamError) {
      console.error("Erreur vérification spam:", spamError)
      return NextResponse.json({ error: "Erreur de vérification" }, { status: 500 })
    }

    // Si une entrée existe déjà, on bloque
    if (existingEntry) {
      return NextResponse.json({ error: "Vous avez déjà tenté votre chance ici." }, { status: 403 })
    }
    // ----------------------------------

    // 6. Logique Gain (100% Gagnant)
    const prize = "Un Café Offert"

    // 7. Enregistrement
    const { error: insertError } = await supabaseAdmin
      .from('winners')
      .insert([
        {
          restaurant_id: restaurant.id,
          email: email,
          prize: prize,
          status: 'disponible'
        }
      ])

    if (insertError) {
      console.error("Erreur insert Supabase:", insertError)
      return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 })
    }

    return NextResponse.json({ success: true, prize: prize })

  } catch (e) {
    console.error("API Error (Catch):", e)
    return NextResponse.json({ error: "Format de requête invalide" }, { status: 400 })
  }
}