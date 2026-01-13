import { createClient } from "@supabase/supabase-js"
import { Lock } from "lucide-react"
import LogoutButton from "@/components/LogoutButton"
import { Sidebar } from "@/components/admin/sidebar" // Assure-toi du chemin selon ton arborescence
import { MobileHeader } from "@/components/admin/mobile-header" // Nouveau composant créé à l'étape 2

export default async function RestaurantGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 2. Vérification du statut (On ajoute 'slug' pour la Sidebar)
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("is_active, name, slug")
    .eq("slug", slug)
    .single()

  // 3. LE BLOCAGE TOTAL 🛑 (Inchangé)
  if (restaurant && restaurant.is_active === false) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-red-900/10 border border-red-900 p-8 rounded-3xl max-w-md w-full text-center space-y-6 relative">
          <div className="w-20 h-20 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Lock size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tight">Accès Suspendu</h1>
            <p className="text-red-400 font-medium mt-2">
              L'accès au compte de <strong>{restaurant.name}</strong> a été verrouillé par l'administrateur.
            </p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl text-slate-400 text-sm border border-slate-800">
            <p>Toutes les pages (Jeux, CRM, Stats) sont inaccessibles.</p>
            <p className="mt-2 text-xs opacity-70">Raison : Maintenance ou Facturation.</p>
          </div>
          <div className="pt-4 flex justify-center">
            <LogoutButton />
          </div>
        </div>
      </div>
    )
  }

  // 4. LE SQUELETTE VISUEL RESPONSIVE 📱💻
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50">
      {/* Menu mobile (Header haut invisible sur PC) */}
      <MobileHeader restaurant={restaurant} />

      {/* Sidebar (Fixe à gauche sur PC, invisible sur Mobile) */}
      <Sidebar restaurant={restaurant} />

      {/* Contenu principal qui prend tout l'espace restant */}
      <main className="flex-1 w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}