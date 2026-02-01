import { createClient } from "@/utils/supabase/server"
import { notFound, redirect } from "next/navigation"
import CsvExportButton from "@/components/admin/csv-export-button"
import { CustomersTable } from "@/components/admin/customers-table"

// --- TYPES LOCAUX ---
interface Restaurant {
  id: string
  name: string
}

// Fonction utilitaire pour vérifier si c'est un UUID
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams?: { page?: string }
}) {
  const { slug } = params
  const supabase = await createClient()

  // 1) DÉTECTION DU RESTAURANT
  let query = supabase.from("restaurants").select("id, name")
  query = isUUID(slug) ? query.eq("id", slug) : query.eq("slug", slug)

  const { data: rawRestaurant, error: restoError } = await query.single()
  if (restoError || !rawRestaurant) return notFound()

  const restaurant = rawRestaurant as unknown as Restaurant

  // 2) PAGINATION SSR (page via URL ?page=2)
  const PAGE_SIZE = 30
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1)

  const { count: totalCustomers, error: countError } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", restaurant.id)

  if (countError) {
    // si tu veux afficher une UI erreur plutôt que notFound, dis-moi
    return notFound()
  }

  const total = typeof totalCustomers === "number" ? totalCustomers : 0
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ✅ si quelqu’un arrive sur page trop haute, on le ramène au max
  if (page > maxPage) {
    redirect(`/admin/admin/${slug}/customers?page=${maxPage}`)
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: rawCustomers, error: customersError } = await supabase
    .from("contacts")
    .select(`id, first_name, email, phone, created_at, marketing_optin`)
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  if (customersError) return notFound()

  const customers = (rawCustomers || []) as any[]

  // Opt-in affiché (sur la page courante)
  const optInCount = customers.filter((c) => c.marketing_optin).length

  // hasMore initial fiable (basé sur page vs maxPage)
  const hasMoreInitial = page < maxPage

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* EN-TÊTE */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Portefeuille Clients 👥</h1>
            <p className="text-slate-500 mt-1 font-medium">
              Clients ayant accepté de recevoir des offres :{" "}
              <span className="text-blue-600 font-bold">{optInCount}</span> / {customers.length}
            </p>
          </div>

          <div className="flex gap-3">
            <CsvExportButton restaurantSlug={slug} filename={`clients-${restaurant.name}.csv`} />
          </div>
        </div>

        {/* TABLEAU DES CLIENTS */}
        <CustomersTable
          initialCustomers={customers}
          hasMoreInitial={hasMoreInitial}
          totalCount={typeof totalCustomers === "number" ? totalCustomers : undefined}
        />
      </div>
    </div>
  )
}