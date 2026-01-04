"use client"

import Link from "next/link"
import { usePathname, useParams } from "next/navigation" // 1. Ajout de useParams
import { LayoutDashboard, Trophy, Settings, Gamepad2, Users, LogOut } from "lucide-react" // 2. Ajout de l'icône Users

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams() // 3. On récupère les paramètres de l'URL
  
  // On sécurise le slug (s'il n'est pas encore chargé, on met une chaine vide pour éviter les bugs)
  const slug = params?.slug ? String(params.slug) : ""

  // 4. On construit les liens dynamiquement avec le slug
  const navItems = [
    { label: "Dashboard", href: `/admin/${slug}`, icon: LayoutDashboard },
    { label: "Mes Jeux", href: `/admin/${slug}/games`, icon: Gamepad2 },
    { label: "Clients CRM", href: `/admin/${slug}/customers`, icon: Users }, // <--- LE VOICI !
    { label: "Gagnants", href: `/admin/${slug}/winners`, icon: Trophy },
    { label: "Paramètres", href: `/admin/${slug}/settings`, icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      
      {/* SIDEBAR (Navigation) */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col justify-between shrink-0 h-screen sticky top-0">
        <div>
          <div className="mb-10 flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">F</div>
             <span className="text-xl font-bold tracking-tight">Fideliz Admin</span>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              // On vérifie si l'URL actuelle contient le lien (pour garder actif même dans les sous-pages)
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

        <div className="pt-6 border-t border-slate-800">
           <p className="text-xs text-slate-500 mb-2">Connecté via Basic Auth</p>
           {/* Le bouton scan */}
           <Link href={`/admin/${slug}/scan`} className="block w-full bg-slate-800 hover:bg-slate-700 text-center py-2 rounded-lg text-sm text-white transition-colors">
              Ouvrir le Scanner 📷
           </Link>
        </div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 overflow-y-auto h-screen">
        {children}
      </main>

    </div>
  )
}