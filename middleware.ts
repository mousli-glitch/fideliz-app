import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  // On protège les routes qui commencent par /admin OU /api/admin
  if (!req.nextUrl.pathname.startsWith("/admin") && !req.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.next()
  }

  // Récupération de l'en-tête d'autorisation
  const authHeader = req.headers.get("authorization")

  if (authHeader?.startsWith("Basic ")) {
    // Décodage du user:password
    const base64 = authHeader.split(" ")[1]
    const decoded = atob(base64)
    const [user, pwd] = decoded.split(":")

    // Vérification stricte
    if (user === "admin" && pwd === process.env.ADMIN_PASSWORD) {
      return NextResponse.next()
    }
  }

  // Si pas connecté, on renvoie 401 pour déclencher la pop-up navigateur
  return new NextResponse("Authentification requise", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  })
}

// Configuration : on applique ce middleware sur ces chemins
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
}