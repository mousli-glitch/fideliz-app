"use client"

import { useEffect, useMemo, useState } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { deleteWinnerAction } from "@/app/actions/delete-winner"
import { getWinnersPageAction } from "@/app/actions/get-winners-page"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Loader2, Search, Calendar, Trash2, CheckSquare, Square, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"

interface AdminWinnersTableProps {
  initialWinners: any[]
}

type Cursor = { created_at: string; id: string } | null

export function AdminWinnersTable({ initialWinners }: AdminWinnersTableProps) {
  const params = useParams()
  const slug = params?.slug as string

  const PAGE_LIMIT = 200

  const [winners, setWinners] = useState(initialWinners)
  const [searchTerm, setSearchTerm] = useState("")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ✅ Pagination states
  const [cursor, setCursor] = useState<Cursor>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // État pour la sélection groupée
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // ✅ Init cursor/hasMore based on initial list
  useEffect(() => {
    if (!initialWinners || initialWinners.length === 0) {
      setCursor(null)
      setHasMore(false)
      return
    }
    const last = initialWinners[initialWinners.length - 1]
    if (last?.created_at && last?.id) setCursor({ created_at: last.created_at, id: last.id })
    setHasMore(initialWinners.length === PAGE_LIMIT)
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

  // Logique sélection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredWinners.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredWinners.map((w) => w.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  // ✅ Charger plus (pagination keyset)
  const handleLoadMore = async () => {
    if (!slug || isLoadingMore || !hasMore) return
    setIsLoadingMore(true)

    const res = await getWinnersPageAction(slug, cursor, PAGE_LIMIT)

    if (res.success) {
      const incoming = (res.winners || []).map((winner: any) => ({
        ...winner,
        prizes: winner.prizes || {
          label: winner.prize_label_snapshot || "Lot archivé",
          color: "#64748b",
        },
      }))

      setWinners((prev) => {
        // ✅ anti-doublons (au cas où)
        const existing = new Set(prev.map((x: any) => x.id))
        const merged = [...prev, ...incoming.filter((x: any) => !existing.has(x.id))]
        return merged
      })

      setCursor(res.nextCursor || null)
      setHasMore(Boolean(res.hasMore))
    } else {
      // si erreur, on évite boucle infinie
      setHasMore(false)
      console.error("Load more error:", res.message)
    }

    setIsLoadingMore(false)
  }

  // Suppression groupée
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
                    <button
                      onClick={() => toggleSelect(winner.id)}
                      className="text-slate-300 hover:text-blue-600"
                    >
                      {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                    </button>
                  </td>

                  <td className="py-4 pl-2 text-slate-500 text-xs">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />{" "}
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
                      {deletingId === winner.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ✅ Load More */}
      <div className="mt-6 flex justify-center">
        {hasMore ? (
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="rounded-xl font-bold gap-2"
            variant="outline"
          >
            {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown size={16} />}
            Charger plus
          </Button>
        ) : (
          <div className="text-xs text-slate-400 font-medium">
            Fin de la liste.
          </div>
        )}
      </div>
    </div>
  )
}
