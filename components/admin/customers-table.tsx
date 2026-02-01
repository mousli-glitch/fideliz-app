"use client"

import { useMemo, useState, useEffect } from "react"
import {
  Search,
  Mail,
  MessageSquare,
  UserCheck,
  Trash2,
  Loader2,
  UserX,
  CheckSquare,
  Square,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { deleteContactAction } from "@/app/actions/delete-contact"
import { getCustomersPageAction } from "@/app/actions/get-customers-page"

type Customer = {
  id: string
  first_name: string
  email: string | null
  phone: string
  marketing_optin: boolean
  created_at: string
  game: { active_action: string } | null
  prize: { label: string } | null
}

type CustomersPageResult =
  | {
      success: true
      customers: Customer[]
      total: number
      totalPages: number
      page: number
      hasMore: boolean
    }
  | { success: false; message: string }

interface CustomersTableProps {
  initialCustomers: Customer[]
  totalCount?: number

  // ✅ AJOUT OPTION A : props SSR
  page?: number
  totalPages?: number
  initialQuery?: string
}

export function CustomersTable({
  initialCustomers,
  totalCount,
  page: pageFromSSR,
  totalPages: totalPagesFromSSR,
  initialQuery,
}: CustomersTableProps) {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const PAGE_SIZE = 30

  // ✅ États init depuis SSR
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers || [])
  const [searchTerm, setSearchTerm] = useState(initialQuery ?? "")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [page, setPage] = useState<number>(pageFromSSR ?? 1)
  const [totalPages, setTotalPages] = useState<number>(() => {
    if (typeof totalPagesFromSSR === "number") return Math.max(1, totalPagesFromSSR)
    if (typeof totalCount === "number") return Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    return 1
  })

  // ⚠️ On garde hasMore en fallback (si totalPages est inconnu côté client, ex: erreur count)
  const [hasMore, setHasMore] = useState<boolean>(() => {
    if (typeof totalPagesFromSSR === "number") return (pageFromSSR ?? 1) < totalPagesFromSSR
    // fallback : si on n'a pas totalPages, on suppose "peut-être"
    return (initialCustomers || []).length === PAGE_SIZE
  })

  const [isPaging, setIsPaging] = useState(false)
  const [pendingPage, setPendingPage] = useState<number | null>(null)

  // Sélection multiple
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // ✅ IMPORTANT : si on navigue SSR (URL change), on resynchronise le state
  useEffect(() => {
    setCustomers(initialCustomers || [])
  }, [initialCustomers])

  useEffect(() => {
    if (typeof pageFromSSR === "number") setPage(pageFromSSR)
  }, [pageFromSSR])

  useEffect(() => {
    if (typeof totalPagesFromSSR === "number") setTotalPages(Math.max(1, totalPagesFromSSR))
  }, [totalPagesFromSSR])

  useEffect(() => {
    setSearchTerm(initialQuery ?? "")
  }, [initialQuery])

  // ✅ Filtre local = seulement sur la page affichée
  // (La recherche globale est gérée par le SSR via ?q=...)
  const filteredCustomers = useMemo(() => {
    const term = (searchTerm || "").toLowerCase().trim()
    if (!term) return customers

    return customers.filter((client) => {
      return (
        (client.first_name || "").toLowerCase().includes(term) ||
        (client.email || "").toLowerCase().includes(term) ||
        (client.phone || "").includes(term)
      )
    })
  }, [customers, searchTerm])

  // Sélection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCustomers.length) setSelectedIds([])
    else setSelectedIds(filteredCustomers.map((c) => c.id))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // ✅ Pagination client-fetch (tu peux garder ça)
  // Si tu veux passer en 100% SSR URL, on le fait ensuite.
  const loadPage = async (targetPage: number) => {
    if (!slug || isPaging) return
    if (targetPage < 1) return
    if (totalPages && targetPage > totalPages) return

    setIsPaging(true)
    setPendingPage(targetPage)

    // ✅ Page 1 : on remet l’SSR (évite re-fetch inutile)
    if (targetPage === 1) {
      setCustomers(initialCustomers || [])
      setPage(1)
      setSelectedIds([])
      setHasMore(typeof totalPages === "number" ? 1 < totalPages : (initialCustomers || []).length === PAGE_SIZE)
      scrollTop()
      setPendingPage(null)
      setIsPaging(false)
      return
    }

    // ✅ Appel action en mode page (OFFSET)
    const res = (await getCustomersPageAction(slug, targetPage, PAGE_SIZE)) as CustomersPageResult

    if (res.success) {
      setCustomers(res.customers || [])
      setPage(res.page || targetPage)
      setHasMore(Boolean(res.hasMore))
      setTotalPages(res.totalPages || totalPages)
      setSelectedIds([])
      scrollTop()
    } else {
      console.error("CRM pagination error:", res.message)
      // On garde l'ancienne page affichée (pas de blanc)
    }

    setPendingPage(null)
    setIsPaging(false)
  }

  const canPrev = page > 1 && !isPaging
  const canNext = ((totalPages ? page < totalPages : hasMore) && !isPaging) || false

  const handlePrev = async () => {
    if (!canPrev) return
    await loadPage(page - 1)
  }

  const handleNext = async () => {
    if (!canNext) return
    await loadPage(page + 1)
  }

  // ✅ (Optionnel) Entrée = met à jour l’URL (pour SSR global search) si tu appuies sur Entrée
  // Ça te permet d’avoir la vraie recherche globale SSR (via ?q=)
  const handleSubmitGlobalSearch = () => {
    const q = (searchTerm || "").trim()
    const qp = q ? `&q=${encodeURIComponent(q)}` : ""
    router.push(`/admin/admin/${slug}/customers?page=1${qp}`)
    // La page SSR rechargera initialCustomers/page/totalPages/initialQuery
  }

  // Suppression groupée
  const handleBulkDelete = async () => {
    const count = selectedIds.length
    if (!confirm(`Supprimer définitivement les ${count} client(s) sélectionné(s) ?`)) return

    setIsBulkDeleting(true)
    const result = await deleteContactAction(selectedIds, slug)
    if (result.success) {
      setCustomers((prev) => prev.filter((c) => !selectedIds.includes(c.id)))
      setSelectedIds([])
    } else {
      alert("Erreur : " + result.error)
    }
    setIsBulkDeleting(false)
  }

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Supprimer ce client ?")) return
    setDeletingId(id)
    const result = await deleteContactAction([id], slug)
    if (result.success) {
      setCustomers((prev) => prev.filter((c) => c.id !== id))
      setSelectedIds((prev) => prev.filter((selected) => selected !== id))
    }
    setDeletingId(null)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un client..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 transition bg-white text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmitGlobalSearch()
            }}
            disabled={isPaging}
          />
          <p className="mt-1 text-[10px] text-slate-400">
            Astuce : appuie sur <span className="font-bold">Entrée</span> pour lancer la recherche globale (SSR).
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={isBulkDeleting || isPaging}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-sm disabled:opacity-40"
          >
            {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Supprimer {selectedIds.length} sélection(s)
          </button>
        )}
      </div>

      {/* ✅ Wrapper relatif + overlay pour éviter page blanche */}
      <div className="overflow-x-auto relative">
        {isPaging && (
          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Chargement de la page {pendingPage ?? "..."}
            </div>
          </div>
        )}

        {/* On garde l’ancienne page affichée pendant le fetch */}
        <div className={isPaging ? "opacity-60 pointer-events-none" : ""}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-4 w-10 text-center">
                  <button onClick={toggleSelectAll} className="hover:text-blue-600 transition-colors" disabled={isPaging}>
                    {selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0 ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-4">Client</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">Marketing</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((client) => {
                  const isSelected = selectedIds.includes(client.id)
                  return (
                    <tr
                      key={client.id}
                      className={`hover:bg-blue-50/50 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => toggleSelect(client.id)}
                          className="text-slate-300 hover:text-blue-600"
                          disabled={isPaging}
                        >
                          {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                        </button>
                      </td>

                      <td className="px-4 py-4 font-bold text-slate-900">{client.first_name || "Anonyme"}</td>

                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex flex-col text-xs">
                          <span className="flex items-center gap-2 text-slate-500">
                            <Mail size={12} /> {client.email || "-"}
                          </span>
                          <span className="flex items-center gap-2 text-slate-500">
                            <MessageSquare size={12} /> {client.phone || "-"}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        {client.marketing_optin ? (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <UserCheck size={10} /> Opt-in
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <UserX size={10} /> Non
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteOne(client.id)}
                          disabled={deletingId === client.id || isPaging}
                          className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingId === client.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
        <div className="text-xs text-slate-500">
          Page <span className="font-bold">{page}</span>
          {totalPages ? (
            <>
              {" "}
              / <span className="font-bold">{totalPages}</span>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={!canPrev}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-40"
          >
            Précédent
          </button>

          <button
            onClick={handleNext}
            disabled={!canNext}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  )
}