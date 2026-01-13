"use client"

import { LayoutDashboard, Gamepad2, Trophy, Settings, Users, LogOut, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

export function Sidebar({ restaurant, onClose }: { restaurant: any, onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  
  const isActive = (path: string) => pathname?.includes(path)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className={`
      bg-slate-900 text-white flex flex-col h-screen p-4 sticky top-0 z-50
      ${onClose 
        ? 'w-[280px] fixed left-0' // Largeur fixe quand elle est dans le menu mobile
        : 'w-64 hidden md:flex'     // Largeur fixe et cachée sur mobile en mode "layout"
      }
    `}>
      <div className="px-4 py-4 mb-6 flex justify-between items-center">
        <div>
            <h2 className="font-black text-2xl tracking-tight text-blue-500">Fideliz Admin</h2>
            <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-widest">{restaurant.name}</p>
        </div>
        {onClose && (
            <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-white transition-colors">
                <X size={24} />
            </button>
        )}
      </div>
      
      <nav className="flex-1 flex flex-col gap-2 overflow-y-auto">
        <Link 
          href={`/admin/${restaurant.slug}`}
          onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            pathname === `/admin/${restaurant.slug}` ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <LayoutDashboard size={20} /> Dashboard
        </Link>

        {/* ... Garde tes autres liens identiques ... */}
        <Link 
          href={`/admin/${restaurant.slug}/games`}
          onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/games") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Gamepad2 size={20} /> Mes Jeux
        </Link>

        <Link 
          href={`/admin/${restaurant.slug}/customers`}
          onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/customers") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Users size={20} /> Clients CRM
        </Link>

        <Link 
          href={`/admin/${restaurant.slug}/winners`}
          onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/winners") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Trophy size={20} /> Gagnants
        </Link>

        <Link 
          href={`/admin/${restaurant.slug}/settings`}
          onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/settings") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Settings size={20} /> Paramètres
        </Link>
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="w-full bg-slate-800 hover:bg-red-900/30 hover:text-red-400 transition p-3 rounded-xl flex items-center gap-3 text-sm font-bold text-slate-300 group"
          >
            <div className="bg-black group-hover:bg-red-900/50 w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors">
                <LogOut size={14} />
            </div>
            Déconnexion
          </button>
      </div>
    </aside>
  )
}