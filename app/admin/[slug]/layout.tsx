"use client"

import { Sidebar } from "@/components/admin/sidebar" // On ne garde que celle-là
import { MobileHeader } from "@/components/admin/mobile-header"
import { useParams } from "next/navigation"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const restaurant = { name: "Administration", slug: params.slug }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* On affiche UNIQUEMENT la Sidebar corrigée. 
         L'ancienne barre avec le logo "F" doit être supprimée d'ici.
      */}
      <Sidebar restaurant={restaurant} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile qui appelle aussi la bonne Sidebar */}
        <MobileHeader restaurant={restaurant} />
        
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}