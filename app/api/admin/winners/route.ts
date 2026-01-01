import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(request: Request) {
  try {
    const { id } = await request.json()
    const { error } = await supabaseAdmin
      .from('winners')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'available') // Sécurité
    
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 })
  }
}