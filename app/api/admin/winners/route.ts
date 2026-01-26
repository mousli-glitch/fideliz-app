import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(request: Request) {
  try {
    const { id } = await request.json()

    const { data, error } = await supabaseAdmin
      .from('winners')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'available') // Sécurité
      .select('id,status,redeemed_at') // ✅ permet de savoir si update réel

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, message: "Aucune ligne mise à jour (status != 'available' ou id invalide)." },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, data: data[0] })
  } catch (e) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 })
  }
}
