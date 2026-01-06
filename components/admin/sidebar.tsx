"use client"

import { LayoutDashboard, Gamepad2, Trophy, Settings, Users, LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

export function Sidebar({ restaurant }: { restaurant: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  
  // Fonction pour vérifier si le lien est actif
  const isActive = (path: string) => pathname?.includes(path)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen p-4 sticky top-0">
      
      {/* LOGO / NOM DU RESTO */}
      <div className="px-4 py-4 mb-6">
        <h2 className="font-black text-2xl tracking-tight text-blue-500">Fideliz Admin</h2>
        <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-widest">{restaurant.name}</p>
      </div>
      
      <nav className="flex-1 flex flex-col gap-2">
        
        {/* DASHBOARD */}
        <Link 
          href={`/admin/${restaurant.slug}`}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            pathname === `/admin/${restaurant.slug}` ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <LayoutDashboard size={20} /> Dashboard
        </Link>

        {/* MES JEUX */}
        <Link 
          href={`/admin/${restaurant.slug}/games`}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/games") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Gamepad2 size={20} /> Mes Jeux
        </Link>

        {/* CLIENTS CRM */}
        <Link 
          href={`/admin/${restaurant.slug}/customers`}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/customers") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Users size={20} /> Clients CRM
        </Link>

        {/* GAGNANTS */}
        <Link 
          href={`/admin/${restaurant.slug}/winners`}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/winners") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Trophy size={20} /> Gagnants
        </Link>

        {/* PARAMÈTRES */}
        <Link 
          href={`/admin/${restaurant.slug}/settings`}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
            isActive("/settings") ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/50" : "hover:bg-slate-800 text-slate-400"
          }`}
        >
          <Settings size={20} /> Paramètres
        </Link>

      </nav>

      {/* FOOTER - DÉCONNEXION (Remplacement du Scanner) */}
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
    </div>
  )
}