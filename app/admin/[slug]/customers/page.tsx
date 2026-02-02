import { createClient as createServiceClient } from "@supabase/supabase-js"
import { notFound, redirect } from "next/navigation"
import CsvExportButton from "@/components/admin/csv-export-button"
import { CustomersTable } from "@/components/admin/customers-table"

interface Restaurant {
  id: string
  name: string
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// ✅ Safe decode (évite crash "URIError: URI malformed")
function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Helpers debug (caractères invisibles)
const toHex = (s: string) =>
  Array.from(s)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ")

export const dynamic = "force-dynamic"

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams?: { page?: string; q?: string }
}) {
  const { slug } = params

  // ✅ slug propre (IMPORTANT)
  const cleanSlug = safeDecodeURIComponent(String(slug ?? "")).trim()

  const debugSlug = {
    slug_raw: String(slug ?? ""),
    slug_clean: cleanSlug,
    slug_raw_len: String(slug ?? "").length,
    slug_clean_len: cleanSlug.length,
    slug_raw_hex: toHex(String(slug ?? "")),
    slug_clean_hex: toHex(cleanSlug),
  }

  // ✅ Client ADMIN (bypass RLS) — comme winners
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1) Restaurant (id ou slug) — ✅ UTILISE cleanSlug
  let query = supabase.from("restaurants").select("id, name")
  query = isUUID(cleanSlug) ? query.eq("id", cleanSlug) : query.eq("slug", cleanSlug)

  const { data: rawRestaurant, error: restoError } = await query.maybeSingle()

  // ✅ Debug lisible si introuvable
  if (restoError || !rawRestaurant) {
    const { data: sample, error: sampleErr } = await supabase
      .from("restaurants")
      .select("id, slug, name")
      // plus safe que created_at si la colonne n'existe pas
      .order("name", { ascending: true })
      .limit(10)

    return (
      <pre className="p-6 text-xs bg-red-50 border border-red-200 rounded-xl overflow-auto">
        {JSON.stringify(
          {
            debug: "CRM restaurant not found",
            debugSlug,
            restoError,
            rawRestaurant,
            envUrlPrefix: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").slice(0, 40),
            hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
            sampleErr,
            sampleRestaurants: sample,
          },
          null,
          2
        )}
      </pre>
    )
  }

  const restaurant = rawRestaurant as Restaurant

  // 2) Pagination + recherche SSR via URL
  const PAGE_SIZE = 30
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1)
  const q = (searchParams?.q ?? "").trim()

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let contactsQuery = supabase
    .from("contacts")
    .select("id, first_name, email, phone, created_at, marketing_optin", { count: "exact" })
    .eq("restaurant_id", restaurant.id)

  // ✅ Recherche globale sur tout le CRM
  if (q) {
    const safe = q.replace(/%/g, "\\%").replace(/_/g, "\\_")
    const qLike = `%${safe}%`
    contactsQuery = contactsQuery.or(`first_name.ilike.${qLike},email.ilike.${qLike},phone.ilike.${qLike}`)
  }

  const { data: rawCustomers, count: totalCustomers, error: customersError } = await contactsQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  if (customersError) return notFound()

  const customers = (rawCustomers || []) as any[]
  const total = typeof totalCustomers === "number" ? totalCustomers : 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ✅ Page trop haute → redirect vers dernière page (en gardant q)
  if (page > totalPages) {
    const qp = q ? `&q=${encodeURIComponent(q)}` : ""
    redirect(`/admin/${cleanSlug}/customers?page=${totalPages}${qp}`)
  }

  const optInCount = customers.filter((c) => c.marketing_optin).length

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Portefeuille Clients 👥</h1>
            <p className="text-slate-500 mt-1 font-medium">
              Clients ayant accepté de recevoir des offres :{" "}
              <span className="text-blue-600 font-bold">{optInCount}</span> / {customers.length}
              {q ? (
                <span className="ml-2 text-slate-400">
                  (filtré par : <span className="font-bold">{q}</span>)
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex gap-3">
            <CsvExportButton restaurantSlug={cleanSlug} filename={`clients-${restaurant.name}.csv`} />
          </div>
        </div>

        <CustomersTable
          initialCustomers={customers}
          totalCount={typeof totalCustomers === "number" ? totalCustomers : undefined}
          page={page}
          totalPages={totalPages}
          initialQuery={q}
        />
      </div>
    </div>
  )
}