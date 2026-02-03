"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
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
  X,
} from "lucide-react"
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation"
import { deleteContactAction } from "@/app/actions/delete-contact"

type Customer = {
  id: string
  first_name: string
  email: string | null
  phone: string
  marketing_optin: boolean
  created_at: string
  game?: { active_action: string } | null
  prize?: { label: string } | null
}

interface CustomersTableProps {
  initialCustomers: Customer[]
  totalCount?: number
  page: number
  totalPages: number
  initialQuery: string
}

export function CustomersTable({
  initialCustomers,
  totalCount,
  page: ssrPage,
  totalPages: ssrTotalPages,
  initialQuery,
}: CustomersTableProps) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  // ✅ slug fiable (params parfois vide au 1er render)
  const slugFromParams = (() => {
    const raw = params?.slug as string | string[] | undefined
    if (!raw) return ""
    return Array.isArray(raw) ? raw[0] : raw
  })()

  const slugFromPath = (() => {
    const parts = (pathname ?? "").split("/").filter(Boolean)
    if (parts[0] === "admin" && parts[1]) return parts[1]
    return ""
  })()

  const slug = (slugFromParams || slugFromPath || "").trim()

  // SSR mirror: the table always displays SSR data
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers || [])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Search UI state (real search is SSR via ?q=)
  const [searchInput, setSearchInput] = useState(initialQuery || "")

  // Navigation/loading
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setCustomers(initialCustomers || [])
    setSelectedIds([])
  }, [initialCustomers])

  useEffect(() => {
    setSearchInput(initialQuery || "")
  }, [initialQuery])

  // ✅ IMPORTANT: dès que l’URL change, on retire le label “Chargement…”
  useEffect(() => {
    setPendingLabel(null)
  }, [pathname, searchParams?.toString()])

  const page = ssrPage
  const totalPages = ssrTotalPages

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const buildUrl = (nextPage: number, q: string) => {
    const qp = new URLSearchParams(searchParams?.toString() || "")

    // page
    if (nextPage <= 1) qp.delete("page")
    else qp.set("page", String(nextPage))

    // query
    const cleanQ = (q || "").trim()
    if (!cleanQ) qp.delete("q")
    else qp.set("q", cleanQ)

    const queryString = qp.toString()
    return `/admin/${encodeURIComponent(slug)}/customers${queryString ? `?${queryString}` : ""}`
  }

  const navigate = (nextPage: number, q: string, label: string) => {
    if (!slug) return
    setPendingLabel(label)

    startTransition(() => {
      router.push(buildUrl(nextPage, q))
      // ✅ pas besoin de router.refresh() ici : le changement d’URL relance le SSR
    })

    scrollTop()
  }

  // -----------------------
  // ✅ LIVE SEARCH (debounced)
  // -----------------------
  const AUTO_SEARCH = true
  const AUTO_SEARCH_MIN_CHARS = 1
  const AUTO_SEARCH_DEBOUNCE_MS = 400

  const firstAutoRun = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!AUTO_SEARCH) return
    if (!slug) return

    // évite de déclencher un auto-search au 1er rendu
    if (firstAutoRun.current) {
      firstAutoRun.current = false
      return
    }

    const clean = (searchInput || "").trim()
    const cleanInitial = (initialQuery || "").trim()

    // si la valeur reflète déjà l’URL SSR, ne relance pas
    if (clean === cleanInitial) return

    if (clean && clean.length < AUTO_SEARCH_MIN_CHARS) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate(1, clean, clean ? `Recherche: "${clean}"` : "Liste complète")
    }, AUTO_SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, slug, initialQuery])

  // Selection
  const toggleSelectAll = () => {
    if (selectedIds.length === customers.length) setSelectedIds([])
    else setSelectedIds(customers.map((c) => c.id))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  // Pagination (SSR)
  const canPrev = page > 1 && !isPending
  const canNext = page < totalPages && !isPending

  const handlePrev = () => {
    if (!canPrev) return
    navigate(page - 1, initialQuery, `Page ${page - 1}`)
  }

  const handleNext = () => {
    if (!canNext) return
    navigate(page + 1, initialQuery, `Page ${page + 1}`)
  }

  // Search (manual)
  const applySearch = () => {
    const q = (searchInput || "").trim()
    navigate(1, q, q ? `Recherche: "${q}"` : "Liste complète")
  }

  const clearSearch = () => {
    setSearchInput("")
    navigate(1, "", "Liste complète")
  }

  // Deletes
  const handleBulkDelete = async () => {
    const count = selectedIds.length
    if (count === 0) return
    if (!confirm(`Supprimer définitivement les ${count} client(s) sélectionné(s) ?`)) return

    setIsBulkDeleting(true)
    const result = await deleteContactAction(selectedIds, slug)

    if (result.success) {
      setCustomers((prev) => prev.filter((c) => !selectedIds.includes(c.id)))
      setSelectedIds([])
      startTransition(() => router.refresh())
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
      setSelectedIds((prev) => prev.filter((x) => x !== id))
      startTransition(() => router.refresh())
    } else {
      alert("Erreur : " + result.error)
    }

    setDeletingId(null)
  }

  const headerRight = useMemo(() => {
    if (typeof totalCount === "number") {
      return (
        <div className="text-xs text-slate-500 font-medium">
          Total CRM : <span className="font-black text-slate-700">{totalCount}</span>
        </div>
      )
    }
    return null
  }, [totalCount])

  const showClear = (searchInput || "").trim().length > 0 || (initialQuery || "").trim().length > 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Global search bar */}
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-slate-50/50">
        <div className="flex-1 max-w-xl">
          {/* ✅ FIX ALIGN: tout en flex, plus d’absolute */}
          <div className="w-full h-11 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-500 transition">
            <Search className="text-slate-400 shrink-0" size={18} />

            <input
              type="text"
              placeholder="Rechercher dans tout le CRM (nom, email, téléphone)…"
              className="flex-1 h-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch()
              }}
              disabled={isPending}
            />

            {showClear ? (
              <button
                onClick={clearSearch}
                disabled={isPending}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                title="Réinitialiser"
              >
                <X size={16} />
              </button>
            ) : null}

            <button
              onClick={applySearch}
              disabled={isPending}
              className="h-8 px-3 inline-flex items-center justify-center rounded-lg bg-slate-900 text-white text-xs font-black hover:bg-slate-800 disabled:opacity-40"
            >
              Rechercher
            </button>
          </div>

          {initialQuery ? (
            <div className="mt-2 text-[11px] text-slate-500">
              Filtre actif : <span className="font-black text-slate-700">{initialQuery}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3">
          {headerRight}

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || isPending}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-sm disabled:opacity-40"
            >
              {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Supprimer {selectedIds.length}
            </button>
          )}
        </div>
      </div>

      {/* Table + overlay */}
      <div className="overflow-x-auto relative">
        {(isPending || pendingLabel) && (
          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Chargement… {pendingLabel ?? ""}
            </div>
          </div>
        )}

        <div className={isPending || pendingLabel ? "opacity-60 pointer-events-none" : ""}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="hover:text-blue-600 transition-colors"
                    disabled={isPending}
                    title="Tout sélectionner"
                  >
                    {selectedIds.length === customers.length && customers.length > 0 ? (
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
              {customers.length > 0 ? (
                customers.map((client) => {
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
                          disabled={isPending}
                          title="Sélectionner"
                        >
                          {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-black text-slate-900">{client.first_name || "Anonyme"}</div>
                        <div className="text-[11px] text-slate-400">
                          {client.created_at ? new Date(client.created_at).toLocaleString() : ""}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex flex-col text-xs gap-1">
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
                          disabled={deletingId === client.id || isPending}
                          className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title="Supprimer"
                        >
                          {deletingId === client.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
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
          Page <span className="font-black">{page}</span> / <span className="font-black">{totalPages}</span>
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