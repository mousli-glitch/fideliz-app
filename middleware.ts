import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // On protège tout ce qui commence par /admin ou /api/admin
  if (req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api/admin')) {
    
    // Récupérer le user/pass de l'URL (ex: basic auth) ou juste vérifier un cookie plus tard.
    // Pour l'instant, version simple : Si on n'est pas authentifié, on peut bloquer.
    // NOTE : Pour cette V3 "MVP", on laisse ouvert MAIS on prépare le terrain.
    // Dans une V4, on ajoutera ici la vérification du mot de passe.
    
    return NextResponse.next()
  }
}

// C'est ici qu'on définit les zones protégées
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}