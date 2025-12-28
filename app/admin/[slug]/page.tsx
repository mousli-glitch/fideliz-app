import AdminQrCard from '@/components/admin-qr-card' // Import OK
import { createClient } from '@supabase/supabase-js'
import AdminWinnerRow from '@/components/admin-winner-row'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface AdminPageProps {
  params: Promise<{ slug: string }>
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { slug } = await params

  // Récupération des données
  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select(`
      id, 
      name, 
      winners (id, created_at, email, first_name, prize_title, status)
    `)
    .eq('slug', slug)
    .single()

  if (error || !restaurant) {
    return <div className="p-8 text-center text-red-500">Restaurant introuvable.</div>
  }

  // Tri par date
  const winners = (restaurant.winners as any[] || []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto">
        
        {/* EN-TÊTE */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard {restaurant.name}</h1>
            <p className="text-slate-500">Suivi des gains en temps réel</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm border text-sm font-medium">
            Total : {winners.length}
          </div>
        </div>

        {/* --- AJOUT ICI : LE QR CODE --- */}
        <AdminQrCard slug={slug} />

        {/* TABLEAU */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Date</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Client</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cadeau</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {winners.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic">Aucun gagnant.</td>
                </tr>
              ) : (
                winners.map((winner) => (
                  <AdminWinnerRow 
                    key={winner.id} 
                    winner={winner} 
                    restaurantSlug={slug} 
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}