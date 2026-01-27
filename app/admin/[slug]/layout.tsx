"use client"

import { Sidebar } from "@/components/admin/sidebar"
import { MobileHeader } from "@/components/admin/mobile-header"
import { useParams } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()

  // Timer unique
  const checkInterval = useRef<NodeJS.Timeout | null>(null)

  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  // Fonction d'éjection centralisée
  const forceLogout = async () => {
    // anti-boucle
    if (window.location.pathname.startsWith("/login")) return

    if (checkInterval.current) clearInterval(checkInterval.current)

    alert("⛔ ÉTABLISSEMENT SUSPENDU\n\nVotre accès a été révoqué par l'administration.")
    await supabase.auth.signOut()
    window.location.href = "/login?reason=blocked"
  }

  useEffect(() => {
    const slug = (params?.slug as string) || ""
    if (!slug) return

    let channel: any = null

    const runCheck = async () => {
      const { data, error } = await supabase.rpc("check_restaurant_status", {
        slug_input: slug,
      })

      if (error) {
        console.error("Erreur vérification statut:", error)
        return
      }

      // ✅ Kick si bloqué OU inactif
      if (data?.is_blocked === true || data?.is_active === false) {
        await forceLogout()
      }
    }

    // 1) Check instant
    runCheck()

    // 2) Heartbeat
    if (checkInterval.current) clearInterval(checkInterval.current)
    checkInterval.current = setInterval(runCheck, 4000)

    // 3) Realtime (bonus)
    supabase
      .rpc("check_restaurant_status", { slug_input: slug })
      .then(({ data }) => {
        if (data?.restaurant_id) {
          channel = supabase
            .channel(`security_watch_${data.restaurant_id}`)
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "restaurants",
                filter: `id=eq.${data.restaurant_id}`,
              },
              async (payload: any) => {
                // ✅ Source de vérité
                if (payload?.new?.is_blocked === true || payload?.new?.is_active === false) {
                  await forceLogout()
                }
              }
            )
            .subscribe()
        }
      })

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [params?.slug, supabase])

  const restaurant = { name: "Administration", slug: (params?.slug as string) || "" }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar restaurant={restaurant} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader restaurant={restaurant} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
