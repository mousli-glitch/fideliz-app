import { createClient } from "@supabase/supabase-js"
import { Lock } from "lucide-react"
import LogoutButton from "@/components/LogoutButton"

// C'est un Server Component, donc très sécurisé
export default async function RestaurantGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // 1. Connexion Supabase (Serveur)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 2. Vérification du statut du restaurant
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("is_active, name")
    .eq("slug", slug)
    .single()

  // 3. LE BLOCAGE TOTAL 🛑
  // Si le restaurant est désactivé (false), on affiche cet écran
  // L'astuce "z-[9999] fixed inset-0" permet de recouvrir TOUT l'écran, même le menu de gauche !
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

  // 4. Si tout va bien, on laisse passer l'utilisateur vers la page demandée
  return <>{children}</>
}