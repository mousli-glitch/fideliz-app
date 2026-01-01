import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin") && !req.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.next()
  }

  const authHeader = req.headers.get("authorization")

  if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.split(" ")[1]
    const decoded = atob(base64)
    const [user, pwd] = decoded.split(":")

    if (user === "admin" && pwd === process.env.ADMIN_PASSWORD) {
      return NextResponse.next()
    }
  }

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