"use client"

import Link from "next/link"
import { usePathname, useParams, useRouter } from "next/navigation"
import { LayoutDashboard, Trophy, Settings, Gamepad2, Users, LogOut } from "lucide-react"
import { createClient } from "@/utils/supabase/client" // Import nécessaire pour la déconnexion

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  
  // On sécurise le slug
  const slug = params?.slug ? String(params.slug) : ""

  const navItems = [
    { label: "Dashboard", href: `/admin/${slug}`, icon: LayoutDashboard },
    { label: "Mes Jeux", href: `/admin/${slug}/games`, icon: Gamepad2 },
    { label: "Clients CRM", href: `/admin/${slug}/customers`, icon: Users },
    { label: "Gagnants", href: `/admin/${slug}/winners`, icon: Trophy },
    { label: "Paramètres", href: `/admin/${slug}/settings`, icon: Settings },
  ]

  // Fonction de déconnexion
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col justify-between shrink-0 h-screen sticky top-0">
        <div>
          <div className="mb-10 flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">F</div>
             <span className="text-xl font-bold tracking-tight">Fideliz Admin</span>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== `/admin/${slug}` && pathname?.startsWith(item.href))
              
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                    isActive 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon size={20} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* FOOTER : BOUTON DÉCONNEXION */}
        <div className="pt-6 border-t border-slate-800">
           <button 
             onClick={handleLogout}
             className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white py-3 rounded-xl transition-all font-bold text-sm"
           >
             <LogOut size={18} />
             Déconnexion
           </button>
        </div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 overflow-y-auto h-screen relative">
        {children}
      </main>

    </div>
  )
}