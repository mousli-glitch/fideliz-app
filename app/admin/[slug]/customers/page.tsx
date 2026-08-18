import { createClient as createServiceClient } from "@supabase/supabase-js"
import { notFound, redirect } from "next/navigation"
import { autoriserRestaurant } from "@/lib/securite/garde-page-restaurant"
import { headers } from "next/headers"
import CsvExportButton from "@/components/admin/csv-export-button"
import { CustomersTable } from "@/components/admin/customers-table"

interface Restaurant {
  id: string
  name: string
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

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
  // ✅ Next 16: params est async
  params: Promise<{ slug: string }>
  // ✅ Next 16: searchParams peut aussi être async
  searchParams?: Promise<{ page?: string; q?: string }>
}) {
  const { slug } = await params // ✅ IMPORTANT

  /*
   * AUTORISATION AVANT TOUTE LECTURE — la clé de service contourne la RLS.
   * On repart de l'identifiant rendu par la garde, jamais du slug de l'URL :
   * une page qui résout elle-même le slug peut oublier de le vérifier, une
   * page qui reçoit un identifiant déjà autorisé ne le peut pas.
   */
  const acces = await autoriserRestaurant(slug, "clients.consultation")
  if (!acces.autorise) {
    return (
      <div className="p-8 text-center">
        <p className="font-bold text-slate-500">Ce restaurant n&apos;est pas accessible avec ce compte.</p>
      </div>
    )
  }

  const sp = await searchParams // ✅ IMPORTANT (sinon page/q restent à 1 et vide)

  const slugRaw = String(slug ?? "")
  const cleanSlug = safeDecodeURIComponent(slugRaw).trim()

  // ✅ si slug vide : routing / appel incorrect
  if (!cleanSlug) {
    const h = await headers() // ✅ Next 16: headers() est async
    const allHeaders = Object.fromEntries(h.entries())

    return (
      <pre className="p-6 text-xs bg-amber-50 border border-amber-200 rounded-xl overflow-auto">
        {JSON.stringify(
          {
            debug: "CRM called without slug (routing/link issue)",
            paramsSlugRaw: slugRaw,
            paramsSlugClean: cleanSlug,
            slugRawHex: toHex(slugRaw),
            slugCleanHex: toHex(cleanSlug),
            hint: "Request reached this page but params.slug is empty. With Next 16 this usually means params wasn't awaited somewhere. This file now awaits params.",
            headers: {
              host: allHeaders["host"],
              referer: allHeaders["referer"],
              "x-forwarded-host": allHeaders["x-forwarded-host"],
              "x-forwarded-proto": allHeaders["x-forwarded-proto"],
              "x-vercel-id": allHeaders["x-vercel-id"],
            },
          },
          null,
          2
        )}
      </pre>
    )
  }

  // ✅ Client ADMIN (bypass RLS)
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1) Restaurant (id ou slug)
  let query = supabase.from("restaurants").select("id, name")
  query = query.eq("id", acces.restaurantId)

  const { data: rawRestaurant, error: restoError } = await query.maybeSingle()

  if (restoError || !rawRestaurant) {
    const { data: sample } = await supabase.from("restaurants").select("id, slug, name").limit(10)

    return (
      <pre className="p-6 text-xs bg-red-50 border border-red-200 rounded-xl overflow-auto">
        {JSON.stringify(
          {
            debug: "CRM restaurant not found",
            debugSlug: {
              slug_raw: slugRaw,
              slug_clean: cleanSlug,
              slug_raw_len: slugRaw.length,
              slug_clean_len: cleanSlug.length,
              slug_raw_hex: toHex(slugRaw),
              slug_clean_hex: toHex(cleanSlug),
            },
            restoError,
            rawRestaurant,
            envUrlPrefix: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").slice(0, 40),
            hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
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
  const page = Math.max(1, Number.parseInt(sp?.page ?? "1", 10) || 1)
  const q = (sp?.q ?? "").trim()

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // --- 1) Query DATA (range)
  let dataQuery = supabase
    .from("contacts")
    .select("id, first_name, email, phone, created_at, marketing_optin")
    .eq("restaurant_id", restaurant.id)

  // --- 2) Query COUNT (head true)
  let countQuery = supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurant.id)

  // ✅ Recherche globale sur tout le CRM
  if (q) {
    const safe = q.replace(/%/g, "\\%").replace(/_/g, "\\_")
    const qLike = `%${safe}%`
    const orClause = `first_name.ilike.${qLike},email.ilike.${qLike},phone.ilike.${qLike}`

    dataQuery = dataQuery.or(orClause)
    countQuery = countQuery.or(orClause)
  }

  const [{ data: rawCustomers, error: customersError }, { count: totalCustomers, error: countError }] =
    await Promise.all([
      dataQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
      countQuery,
    ])

  if (customersError || countError) {
    console.error("CRM error:", { customersError, countError })
    return notFound()
  }

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