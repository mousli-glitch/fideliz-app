"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client" // 👈 NOUVEAU
import { LayoutDashboard, Settings, Trophy, LogOut } from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient() // 👈 NOUVEAU

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
    router.push("/login")
  }

  const menuItems = [
    { label: "Mes Jeux", href: "/admin", icon: LayoutDashboard },
    { label: "Gagnants", href: "/admin/winners", icon: Trophy },
    { label: "Mon Restaurant", href: "/admin/settings", icon: Settings },
  ]

  return (
    <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col h-full">
      <div className="p-6 border-b border-slate-100">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">FIDELIZ<span className="text-blue-600">.</span></h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-slate-100">
        <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          <LogOut size={18} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}