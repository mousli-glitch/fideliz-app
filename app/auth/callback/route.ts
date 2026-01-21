import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  
  // On récupère le code (PKCE) et la destination suivante
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = {
      get(name: string) { return request.cookies.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options })
      },
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieStore }
    )
    
    // Échange du code contre une session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // ✅ SUCCÈS : On redirige vers la page prévue (ex: /update-password)
      return NextResponse.redirect(`${origin}${next}`)
    } else {
       // ❌ ÉCHEC ÉCHANGE : On affiche l'erreur précise
       console.error('Auth Error Exchange:', error)
       return NextResponse.redirect(`${origin}/login?error=exchange_failed&details=${encodeURIComponent(error.message)}`)
    }
  }

  // ❌ ÉCHEC CODE : Aucun code trouvé dans l'URL
  return NextResponse.redirect(`${origin}/login?error=missing_code`)
}