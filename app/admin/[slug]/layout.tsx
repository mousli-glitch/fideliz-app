"use client"

import { Sidebar } from "@/components/admin/sidebar"
import { MobileHeader } from "@/components/admin/mobile-header"
import { useParams } from "next/navigation"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  // On crée un objet restaurant minimaliste pour la sidebar le temps du chargement
  const restaurant = { name: "Administration", slug: params.slug }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* 1. Sidebar fixe sur PC, cachée sur mobile */}
      <Sidebar restaurant={restaurant} />

      {/* 2. Contenu principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header visible UNIQUEMENT sur mobile */}
        <MobileHeader restaurant={restaurant} />
        
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}