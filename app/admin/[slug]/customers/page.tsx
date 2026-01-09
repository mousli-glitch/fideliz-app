import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import { Mail, MessageSquare } from "lucide-react"
import CsvExportButton from "@/components/admin/csv-export-button"
import { CustomersTable } from "@/components/admin/customers-table"

// --- TYPES LOCAUX ---
interface Restaurant {
  id: string;
  name: string;
}

// Fonction utilitaire pour vérifier si c'est un UUID
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export default async function CustomersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  // 1. DÉTECTION DU RESTAURANT (Code inchangé)
  let query = supabase.from("restaurants").select("id, name")
  
  if (isUUID(slug)) {
    query = query.eq("id", slug)
  } else {
    query = query.eq("slug", slug)
  }

  // ON RÉCUPÈRE LES DONNÉES BRUTES
  const { data: rawRestaurant, error: restoError } = await query.single()

  if (restoError || !rawRestaurant) {
    return notFound()
  }

  // On force TypeScript à accepter que c'est bien un Restaurant.
  const restaurant = rawRestaurant as unknown as Restaurant;

  // 2. RÉCUPÉRATION DES CLIENTS (MODIFIÉ : SOURCE SÉCURISÉE)/customers/page.tsx]
  // Avant : on lisait 'winners'. Maintenant : on lit 'contacts'.
  const { data: rawCustomers } = await supabase
    .from("contacts") // 🔥 On cible la table permanente
    .select(`
      id, first_name, email, phone, created_at
    `)
    .eq("marketing_optin", true)
    .eq("restaurant_id", restaurant.id) // 🔥 Lien direct avec le resto (plus besoin de passer par 'game')
    .order("created_at", { ascending: false })

  // On force le typage des clients pour le composant
  const customers = (rawCustomers || []) as any[];

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* EN-TÊTE (Code inchangé) */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Portefeuille Clients 👥</h1>
            <p className="text-slate-500 mt-1 font-medium">
              Clients ayant accepté de recevoir des offres : <span className="text-blue-600 font-bold">{customers.length}</span>
            </p>
          </div>
          <div className="flex gap-3">
            {/* BOUTON EXPORT CSV (Code inchangé) */}
            <CsvExportButton 
              data={customers} 
              filename={`clients-${restaurant.name}.csv`} 
            />
          </div>
        </div>

        {/* ACTIONS DE CAMPAGNE (Code inchangé) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-200 cursor-not-allowed opacity-90">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2"><MessageSquare/> Campagne SMS</h3>
                        <p className="text-blue-100 text-sm mt-1">Envoyer une promo par SMS à toute la liste.</p>
                    </div>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">Bientôt</span>
                </div>
            </div>
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg shadow-purple-200 cursor-not-allowed opacity-90">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2"><Mail/> Campagne Email</h3>
                        <p className="text-purple-100 text-sm mt-1">Envoyer une newsletter à toute la liste.</p>
                    </div>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">Bientôt</span>
                </div>
            </div>
        </div>

        {/* TABLEAU DES CLIENTS */}
        <CustomersTable initialCustomers={customers} />

      </div>
    </div>
  )
}