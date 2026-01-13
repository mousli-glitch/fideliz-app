import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // 1. PROTECTION DE BASE : Si pas de user connecté sur les routes sensibles
  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/super-admin')
  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. VÉRIFICATION DES RÔLES (Protection avancée)
  if (user) {
    // On récupère le rôle dans la table profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role

    // Sécurité pour l'espace ROOT (Toi uniquement)
    if (pathname.startsWith('/super-admin/root') && role !== 'root') {
      return NextResponse.redirect(new URL('/login', request.url)) 
    }

    // Sécurité pour l'espace SALES (Commerciaux et Root)
    if (pathname.startsWith('/super-admin/sales') && role !== 'sales' && role !== 'root') {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Sécurité pour l'espace ADMIN Restaurateur
    // On s'assure qu'un commercial ne puisse pas modifier les jeux d'un resto par l'URL
    if (pathname.startsWith('/admin') && role === 'sales') {
        // Optionnel : tu peux rediriger les sales vers leur dashboard s'ils essaient d'entrer dans un /admin
        return NextResponse.redirect(new URL('/super-admin/sales/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/super-admin/:path*'],
}