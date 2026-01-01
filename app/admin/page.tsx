import { createClient } from '@supabase/supabase-js'
import QrCard from './QrCard' 
import ClientValidateButton from './ClientValidateButton'

// Initialisation Admin
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  
  // 1. On récupère d'abord le restaurant (pour avoir le bon slug)
  // Dans cette V1, on prend le premier restaurant trouvé dans la base
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('slug, name')
    .limit(1)
    .single()

  // Si on ne trouve pas de restaurant, on met 'demo' par défaut pour pas que ça plante
  const currentSlug = restaurant?.slug || 'demo'
  const currentName = restaurant?.name || 'Mon Restaurant'

  // 2. On récupère les gagnants
  const { data: winners, error } = await supabaseAdmin
    .from('winners')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error("Erreur:", error)
  }

  // 3. On construit l'URL dynamique avec le VRAI slug (ex: testmicroo)
  const qrUrl = `${APP_URL}/qr/${currentSlug}`

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">FIDELIZ Admin</h1>
          <p className="text-gray-500">Gérant : {currentName}</p>
        </header>

        {/* Le QR Code pointera maintenant vers .../qr/testmicroo */}
        <QrCard url={qrUrl} />

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Derniers Gagnants</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 uppercase text-xs font-semibold text-gray-700">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Gain</th>
                  <th className="px-6 py-3">Statut</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(!winners || winners.length === 0) ? (
                   <tr>
                     <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                       Aucun gagnant pour le moment.
                     </td>
                   </tr>
                ) : (
                  winners.map((winner: any) => (
                    <tr key={winner.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        {new Date(winner.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {winner.email}
                      </td>
                      <td className="px-6 py-4 text-green-700 font-bold">
                        {winner.prize}
                      </td>
                      <td className="px-6 py-4">
                        {winner.status === 'available' ? (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">
                            Disponible
                          </span>
                        ) : (
                          <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-semibold">
                            Consommé
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                         {winner.status === 'available' && (
                            <ClientValidateButton id={winner.id} />
                         )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}