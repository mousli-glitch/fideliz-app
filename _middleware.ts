import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // On définit les routes qui nécessitent le mot de passe
  // 👉 J'ai ajouté "/verify" ici
  const isProtectedRoute = 
    path.startsWith("/admin") || 
    path.startsWith("/api/admin") || 
    path.startsWith("/verify")

  // Si ce n'est pas une route protégée, on laisse passer tout le monde
  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  // --- DÉBUT DE LA SÉCURITÉ (Basic Auth) ---
  const authHeader = req.headers.get("authorization")

  if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.split(" ")[1]
    const decoded = atob(base64)
    const [user, pwd] = decoded.split(":")

    // Vérifie le mot de passe stocké dans Vercel
    if (user === "admin" && pwd === process.env.ADMIN_PASSWORD) {
      return NextResponse.next()
    }
  }
  // --- FIN DE LA SÉCURITÉ ---

  // Si pas connecté, on demande le mot de passe
  return new NextResponse("Authentification requise pour valider les gains.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Espace Staff Only"',
    },
  })
}

export const config = {
  // 👉 IMPORTANT : J'ai ajouté "/verify/:path*" ici pour activer le middleware sur les scans
  matcher: ["/admin/:path*", "/api/admin/:path*", "/verify/:path*"],
}