"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const slug = (params?.slug as string) || ""

  const checkInterval = useRef<NodeJS.Timeout | null>(null)

  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  const forceLogout = async () => {
    if (window.location.pathname.startsWith("/login")) return
    if (checkInterval.current) clearInterval(checkInterval.current)

    alert("⛔ ÉTABLISSEMENT SUSPENDU\n\nVotre accès a été révoqué par l'administration.")
    await supabase.auth.signOut()
    window.location.href = "/login?reason=blocked"
  }

  useEffect(() => {
    if (!slug) return

    const runCheck = async () => {
      // ✅ IMPORTANT : ton RPC doit retourner is_blocked (ou on adapte après)
      const { data, error } = await supabase.rpc("check_restaurant_status", {
        slug_input: slug,
      })

      if (error) return

      // ✅ kick si is_blocked
      if (data?.is_blocked === true) {
        await forceLogout()
      }
    }

    runCheck()
    checkInterval.current = setInterval(runCheck, 4000)

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current)
    }
  }, [slug, supabase])

  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  )
}
