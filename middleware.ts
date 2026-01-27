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

  // 1. PROTECTION DE BASE
  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/super-admin')
  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. VÉRIFICATION DES RÔLES & BLOCAGE
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, restaurant_id, is_active')
      .eq('id', user.id)
      .single()

    const role = profile?.role
    const restaurantId = profile?.restaurant_id

    // 🔥 BLOCAGE UTILISATEUR GLOBAL (SALES / ADMIN) 🔥
    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?reason=blocked', request.url))
    }

    // --- ✅ BLOCAGE RESTAURANT : source de vérité = restaurants.is_blocked ---
    if (pathname.startsWith('/admin') && restaurantId) {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('is_blocked, is_active')
        .eq('id', restaurantId)
        .single()

      // ✅ MODIF CHIRURGICALE ICI : blocked_at -> is_blocked
      if (restaurant?.is_blocked === true || restaurant?.is_active === false) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?reason=blocked', request.url))
      }
    }
    // ------------------------------------------------

    // Sécurité ROOT
    if (pathname.startsWith('/super-admin/root') && role !== 'root') {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Sécurité SALES
    if (pathname.startsWith('/super-admin/sales') && role !== 'sales' && role !== 'root') {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Sécurité Sales sur Admin
    if (pathname.startsWith('/admin') && role === 'sales') {
      return NextResponse.redirect(new URL('/super-admin/sales/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/super-admin/:path*'],
}
