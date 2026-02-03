"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { deleteWinnerAction } from "@/app/actions/delete-winner"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import {
  Loader2,
  Search,
  Calendar,
  Trash2,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation"

interface AdminWinnersTableProps {
  initialWinners: any[]
  totalCount?: number
  page: number
  totalPages: number
  initialQuery: string
}

export function AdminWinnersTable({
  initialWinners,
  totalCount,
  page: ssrPage,
  totalPages: ssrTotalPages,
  initialQuery,
}: AdminWinnersTableProps) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  // ✅ slug fiable (comme CRM)
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

  // ✅ 50 par page (diff demandée)
  const PAGE_SIZE = 50

  // SSR mirror
  const [winners, setWinners] = useState<any[]>(initialWinners || [])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Search UI state (SSR via ?q=)
  const [searchInput, setSearchInput] = useState(initialQuery || "")

  // Navigation/loading
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setWinners(initialWinners || [])
    setSelectedIds([])
  }, [initialWinners])

  useEffect(() => {
    setSearchInput(initialQuery || "")
  }, [initialQuery])

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
    return `/admin/${encodeURIComponent(slug)}/winners${queryString ? `?${queryString}` : ""}`
  }

  // ✅ PREFETCH auto : page suivante + précédente (pour rendre le clic quasi instant)
  useEffect(() => {
    if (!slug) return
    if (isPending) return

    const pageAttachable = (p: number) => p >= 1 && p <= totalPages

    // Prefetch page suivante
    if (pageAttachable(page + 1)) {
      router.prefetch(buildUrl(page + 1, initialQuery))
    }

    // Prefetch page précédente
    if (pageAttachable(page - 1)) {
      router.prefetch(buildUrl(page - 1, initialQuery))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, page, totalPages, initialQuery, isPending])

  const navigate = (nextPage: number, q: string, label: string) => {
    if (!slug) return
    setPendingLabel(label)

    startTransition(() => {
      router.push(buildUrl(nextPage, q))
    })

    scrollTop()
  }

  // ✅ LIVE SEARCH (debounced) — comme CRM
  const AUTO_SEARCH = true
  const AUTO_SEARCH_MIN_CHARS = 1
  const AUTO_SEARCH_DEBOUNCE_MS = 400

  const firstAutoRun = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!AUTO_SEARCH) return
    if (!slug) return

    if (firstAutoRun.current) {
      firstAutoRun.current = false
      return
    }

    const clean = (searchInput || "").trim()
    const cleanInitial = (initialQuery || "").trim()
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

  // ✅ Format date remise
  const formatRedeemDate = (winner: any) => {
    const dt = winner?.redeemed_at || winner?.consumed_at
    if (!dt) return null
    try {
      return format(new Date(dt), "dd MMM HH:mm", { locale: fr })
    } catch {
      return null
    }
  }

  // ✅ (optionnel) filtrage local : on laisse, mais la vérité vient du SSR
  const filteredWinners = useMemo(() => {
    const s = (searchInput || "").trim().toLowerCase()
    if (!s) return winners
    return winners.filter((w) => {
      const email = w.email?.toLowerCase() || ""
      const name = w.first_name?.toLowerCase() || ""
      const prizeLabel = (w.prizes?.label || w.prize_label_snapshot || "").toLowerCase()
      return email.includes(s) || name.includes(s) || prizeLabel.includes(s)
    })
  }, [winners, searchInput])

  // Selection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredWinners.length) setSelectedIds([])
    else setSelectedIds(filteredWinners.map((w) => w.id))
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

  const showClear = (searchInput || "").trim().length > 0 || (initialQuery || "").trim().length > 0

  // ✅ Actions
  const handleQuickValidate = async (winnerId: string) => {
    if (!confirm("Confirmer la remise du lot ?")) return
    setLoadingId(winnerId)
    const result = await validateWinAction(winnerId)
    if (result.success) {
      setWinners((prev) =>
        prev.map((w) =>
          w.id === winnerId ? { ...w, status: "redeemed", redeemed_at: new Date().toISOString() } : w
        )
      )
      startTransition(() => router.refresh())
    }
    setLoadingId(null)
  }

  const handleDeleteOne = async (winnerId: string) => {
    if (!confirm("Supprimer ce gagnant ?")) return
    setDeletingId(winnerId)
    const result = await deleteWinnerAction([winnerId], slug)
    if (result.success) {
      setWinners((prev) => prev.filter((w) => w.id !== winnerId))
      setSelectedIds((prev) => prev.filter((s) => s !== winnerId))
      startTransition(() => router.refresh())
    }
    setDeletingId(null)
  }

  const handleBulkDelete = async () => {
    const count = selectedIds.length
    if (count === 0) return
    if (!confirm(`Supprimer définitivement les ${count} gagnants ?`)) return

    setIsBulkDeleting(true)
    const result = await deleteWinnerAction(selectedIds, slug)
    if (result.success) {
      setWinners((prev) => prev.filter((w) => !selectedIds.includes(w.id)))
      setSelectedIds([])
      startTransition(() => router.refresh())
    }
    setIsBulkDeleting(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* ✅ Search bar (même style/pattern que CRM) */}
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-slate-50/50">
        <div className="flex-1 max-w-xl">
          <div className="w-full h-11 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-500 transition">
            <Search className="text-slate-400 shrink-0" size={18} />

            <input
              type="text"
              placeholder={`Rechercher (nom, email, lot)… — ${PAGE_SIZE}/page`}
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
          {typeof totalCount === "number" ? (
            <div className="text-xs text-slate-500 font-medium">
              Total gagnants : <span className="font-black text-slate-700">{totalCount}</span>
            </div>
          ) : null}

          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || isPending}
              className="rounded-xl font-bold gap-2 shadow-lg"
            >
              {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
              Supprimer {selectedIds.length}
            </Button>
          )}
        </div>
      </div>

      {/* Table + overlay */}
      <div className="overflow-x-auto relative">
        {(isPending || pendingLabel) && (
          <div className="absolute inset-0 z-10 bg-white/80 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Chargement… {pendingLabel ?? ""}
            </div>
          </div>
        )}

        <div className={isPending || pendingLabel ? "pointer-events-none" : ""}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                <th className="px-4 py-4 w-10 text-center">
                  <button onClick={toggleSelectAll} disabled={isPending} title="Tout sélectionner">
                    {selectedIds.length === filteredWinners.length && filteredWinners.length > 0 ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-4">Date Gain</th>
                <th className="px-4 py-4">Client</th>
                <th className="px-4 py-4">Lot Gagné</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="text-sm divide-y divide-slate-100">
              {filteredWinners.length > 0 ? (
                filteredWinners.map((winner) => {
                  const isSelected = selectedIds.includes(winner.id)
                  const isRedeemed = winner.status === "redeemed" || winner.status === "consumed"
                  const redeemedLabel = formatRedeemDate(winner)

                  return (
                    <tr
                      key={winner.id}
                      className={`transition-colors ${isSelected ? "bg-blue-50/40" : "hover:bg-slate-50/50"}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => toggleSelect(winner.id)}
                          className="text-slate-300 hover:text-blue-600"
                          disabled={isPending}
                          title="Sélectionner"
                        >
                          {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                        </button>
                      </td>

                      <td className="px-4 py-4 text-slate-500 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} />
                          {format(new Date(winner.created_at), "dd MMM HH:mm", { locale: fr })}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-bold text-slate-700">{winner.first_name || "Anonyme"}</div>
                        <div className="text-[10px] text-slate-400">{winner.email}</div>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{
                            backgroundColor: (winner.prizes?.color || "#cbd5e1") + "20",
                            color: winner.prizes?.color || "#64748b",
                          }}
                        >
                          {winner.prizes?.label || winner.prize_label_snapshot || "Lot Archivé"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isRedeemed ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                                Remis
                              </div>
                              {redeemedLabel ? (
                                <div className="text-[10px] text-slate-400">{redeemedLabel}</div>
                              ) : null}
                            </div>
                          ) : (
                            <Button
                              onClick={() => handleQuickValidate(winner.id)}
                              disabled={loadingId === winner.id || isPending}
                              className="bg-green-600 h-7 text-[10px]"
                            >
                              {loadingId === winner.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Valider"}
                            </Button>
                          )}

                          <button
                            onClick={() => handleDeleteOne(winner.id)}
                            disabled={deletingId === winner.id || isPending}
                            className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                            title="Supprimer"
                          >
                            {deletingId === winner.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
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

      {/* Pagination (SSR) — comme CRM */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
        <div className="text-xs text-slate-500">
          Page <span className="font-black">{page}</span> / <span className="font-black">{totalPages}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={!canPrev}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-40 inline-flex items-center gap-2"
          >
            <ChevronLeft size={16} /> Précédent
          </button>

          <button
            onClick={handleNext}
            disabled={!canNext}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-40 inline-flex items-center gap-2"
          >
            Suivant <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}