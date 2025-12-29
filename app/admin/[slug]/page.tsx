import AdminDashboard from "@/components/AdminDashboard"
import { createClient } from "@supabase/supabase-js" // Besoin de Supabase pour récupérer la couleur et le nom
import { notFound } from "next/navigation"
import { QrGenerator } from "@/components/qr-generator" // 👈 Import du nouveau composant

interface AdminPageProps {
  params: Promise<{ slug: string }>
}

// Client simple pour lire les infos du resto (nom, couleur)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function AdminPage({ params }: AdminPageProps) {
  const { slug } = await params

  // 1. On récupère les infos du restaurant pour le QR Code
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, brand_color')
    .eq('slug', slug)
    .single()

  if (!restaurant) return notFound()

  return (
    <main className="min-h-screen bg-slate-50 p-4 pb-20"> {/* pb-20 pour laisser de la place en bas */}
      <div className="max-w-md mx-auto mb-6 pt-6 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Staff Only 👮‍♂️
            </h1>
            <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase">
                {slug}
            </span>
        </div>
      </div>
      
      {/* Le Dashboard existant */}
      <AdminDashboard slug={slug} />

      {/* 2. Le Nouveau Générateur de QR Code */}
      <div className="max-w-md mx-auto mt-12">
        <QrGenerator 
          slug={slug} 
          restaurantName={restaurant.name} 
          brandColor={restaurant.brand_color} 
        />
      </div>
    </main>
  )
}