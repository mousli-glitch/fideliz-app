import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  // On ne protège que l'admin
  if (!req.nextUrl.pathname.startsWith("/admin") && !req.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.next()
  }

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

  // Si pas connecté, on affiche la pop-up système (PAS de redirection vers /login)
  return new NextResponse("Authentification requise", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  })
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
}