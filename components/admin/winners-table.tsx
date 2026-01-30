"use client"

import { useEffect, useMemo, useState } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { deleteWinnerAction } from "@/app/actions/delete-winner"
import { getWinnersPageAction } from "@/app/actions/get-winners-page"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"

type Cursor = { created_at: string; id: string } | null

interface AdminWinnersTableProps {
  initialWinners: any[]
  hasMoreInitial?: boolean
}

export function AdminWinnersTable({ initialWinners, hasMoreInitial = false }: AdminWinnersTableProps) {
  const params = useParams()
  const slug = params?.slug as string

  // ✅ Pages de 30
  const PAGE_SIZE = 30

  const [winners, setWinners] = useState<any[]>(initialWinners || [])
  const [searchTerm, setSearchTerm] = useState("")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ✅ Pagination “pages” (keyset)
  const [page, setPage] = useState(1)
  const [cursorByPage, setCursorByPage] = useState<Record<number, Cursor>>({ 1: null })
  const [hasMoreByPage, setHasMoreByPage] = useState<Record<number, boolean>>({ 1: hasMoreInitial })
  const [isPaging, setIsPaging] = useState(false)

  // ✅ Sélection groupée
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // ✅ Au montage : on prépare le cursor de la page 2 à partir de la fin de la page 1
  useEffect(() => {
    const list = initialWinners || []
    const last = list[list.length - 1]

    const page2Cursor: Cursor =
      last?.created_at && last?.id ? { created_at: last.created_at, id: last.id } : null

    setCursorByPage({ 1: null, 2: page2Cursor })
    setHasMoreByPage({ 1: hasMoreInitial })
    setPage(1)
    setWinners(list)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredWinners = useMemo(() => {
    const search = searchTerm.toLowerCase()
    return winners.filter((w) => {
      const email = w.email?.toLowerCase() || ""
      const name = w.first_name?.toLowerCase() || ""
      const prizeLabel = (w.prizes?.label || w.prize_label_snapshot || "").toLowerCase()
      return email.includes(search) || name.includes(search) || prizeLabel.includes(search)
    })
  }, [winners, searchTerm])

  // ✅ Sélection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredWinners.length) setSelectedIds([])
    else setSelectedIds(filteredWinners.map((w) => w.id))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  // ✅ Charger une page (keyset)
  const loadPage = async (targetPage: number) => {
    if (!slug) return
    if (isPaging) return

    setIsPaging(true)

    const cursor = cursorByPage[targetPage] ?? null
    const res = await getWinnersPageAction(slug, cursor, PAGE_SIZE)

    if (res.success) {
      const incoming = (res.winners || []).map((winner: any) => ({
        ...winner,
        prizes: winner.prizes || {
          label: winner.prize_label_snapshot || "Lot archivé",
          color: "#64748b",
        },
      }))

      // ✅ Vraie pagination : remplace la liste par la page
      setWinners(incoming)

      const nextCursor = (res.nextCursor || null) as Cursor

      // ✅ IMPORTANT : clé dynamique correcte
      setHasMoreByPage((prev) => ({ ...prev, [targetPage]: Boolean(res.hasMore) }))

      // ✅ On stocke le cursor pour la page suivante
      setCursorByPage((prev) => {
        const next = { ...prev }
        next[targetPage + 1] = nextCursor
        return next
      })

      setPage(targetPage)
      setSelectedIds([])

      // ✅ Scroll en haut à chaque changement de page
      window.scrollTo({ top: 0, behavior: "smooth" })
    } else {
      console.error("Pagination error:", res.message)
      setHasMoreByPage((prev) => ({ ...prev, [targetPage]: false }))
    }

    setIsPaging(false)
  }

  const canPrev = page > 1
  const canNext = Boolean(hasMoreByPage[page]) && !isPaging

  const handlePrev = async () => {
    if (!canPrev) return
    await loadPage(page - 1)
  }

  const handleNext = async () => {
    if (!canNext) return
    await loadPage(page + 1)
  }

  // ✅ Suppression groupée
  const handleBulkDelete = async () => {
    if (!confirm(`Supprimer définitivement les ${selectedIds.length} gagnants ?`)) return
    setIsBulkDeleting(true)
    const result = await deleteWinnerAction(selectedIds, slug)
    if (result.success) {
      setWinners((prev) => prev.filter((w) => !selectedIds.includes(w.id)))
      setSelectedIds([])
    }
    setIsBulkDeleting(false)
  }

  const handleDeleteOne = async (winnerId: string) => {
    if (!confirm("Supprimer ce gagnant ?")) return
    setDeletingId(winnerId)
    const result = await deleteWinnerAction([winnerId], slug)
    if (result.success) {
      setWinners((prev) => prev.filter((w) => w.id !== winnerId))
      setSelectedIds((prev) => prev.filter((s) => s !== winnerId))
    }
    setDeletingId(null)
  }

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
    }
    setLoadingId(null)
  }

  // ✅ Petites “annotations” 1/2/3 (on affiche page-1, page, page+1)
  const pageButtons = Array.from(new Set([Math.max(1, page - 1), page, page + 1]))

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher par nom, email ou lot..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="rounded-xl font-bold gap-2 shadow-lg animate-in fade-in zoom-in"
          >
            {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
            Supprimer {selectedIds.length}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
              <th className="pb-4 w-10 text-center">
                <button onClick={toggleSelectAll}>
                  {selectedIds.length === filteredWinners.length && filteredWinners.length > 0 ? (
                    <CheckSquare size={18} className="text-blue-600" />
                  ) : (
                    <Square size={18} />
                  )}
                </button>
              </th>
              <th className="pb-4 font-bold pl-2">Date Gain</th>
              <th className="pb-4 font-bold">Client</th>
              <th className="pb-4 font-bold">Lot Gagné</th>
              <th className="pb-4 font-bold text-right pr-2">Actions</th>
            </tr>
          </thead>

          <tbody className="text-sm">
            {filteredWinners.map((winner) => {
              const isSelected = selectedIds.includes(winner.id)
              const isRedeemed = winner.status === "redeemed" || winner.status === "consumed"
              return (
                <tr
                  key={winner.id}
                  className={`border-b border-slate-50 transition-colors ${
                    isSelected ? "bg-blue-50/40" : "hover:bg-slate-50/50"
                  }`}
                >
                  <td className="py-4 text-center">
                    <button onClick={() => toggleSelect(winner.id)} className="text-slate-300 hover:text-blue-600">
                      {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                    </button>
                  </td>

                  <td className="py-4 pl-2 text-slate-500 text-xs">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />
                      {format(new Date(winner.created_at), "dd MMM HH:mm", { locale: fr })}
                    </div>
                  </td>

                  <td className="py-4">
                    <div className="font-bold text-slate-700">{winner.first_name || "Anonyme"}</div>
                    <div className="text-[10px] text-slate-400">{winner.email}</div>
                  </td>

                  <td className="py-4">
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

                  <td className="py-4 text-right pr-2 flex items-center justify-end gap-2">
                    {isRedeemed ? (
                      <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                        Validé
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleQuickValidate(winner.id)}
                        disabled={loadingId === winner.id}
                        className="bg-green-600 h-7 text-[10px]"
                      >
                        {loadingId === winner.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Valider"}
                      </Button>
                    )}

                    <button
                      onClick={() => handleDeleteOne(winner.id)}
                      disabled={deletingId === winner.id}
                      className="p-2 text-slate-300 hover:text-red-600"
                    >
                      {deletingId === winner.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ✅ Pagination “Pages” + numéros */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Page <span className="font-bold">{page}</span> — {winners.length} résultat(s)
          {isPaging ? <span className="ml-2 italic">chargement…</span> : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl gap-2" onClick={handlePrev} disabled={!canPrev || isPaging}>
            <ChevronLeft size={16} /> Précédent
          </Button>

          <div className="flex items-center gap-1">
            {pageButtons.map((p) => (
              <button
                key={p}
                onClick={() => loadPage(p)}
                disabled={isPaging || (p > page && !hasMoreByPage[page])}
                className={`min-w-9 h-9 px-3 rounded-xl text-sm font-black border transition
                  ${p === page ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}
                  ${isPaging ? "opacity-60" : ""}
                `}
                title={`Page ${p}`}
              >
                {p}
              </button>
            ))}
          </div>

          <Button variant="outline" className="rounded-xl gap-2" onClick={handleNext} disabled={!canNext}>
            Suivant <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}