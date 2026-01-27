"use client"

import { useEffect, useState } from "react"
import { getWinnersPage, type Cursor } from "@/app/actions/get-winners-page"

export default function WinnersPaginatedList({ gameId }: { gameId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [cursor, setCursor] = useState<Cursor>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const loadMore = async () => {
    if (loading || done) return
    setLoading(true)

    const res = await getWinnersPage(gameId, 50, cursor)

    if (!res.success) {
      setLoading(false)
      return
    }

    setRows((prev) => [...prev, ...res.winners])
    setCursor(res.nextCursor)

    if (!res.hasMore || res.winners.length === 0) setDone(true)

    setLoading(false)
  }

  useEffect(() => {
    setRows([])
    setCursor(null)
    setDone(false)
    loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        Affiché : {rows.length}
        {done ? " (fin)" : ""}
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 flex justify-between">
            <div>
              <div className="font-bold">{r.first_name ?? "Client"}</div>
              <div className="text-xs text-slate-500">
                {new Date(r.created_at).toLocaleString("fr-FR")}
              </div>
            </div>
            <div className="text-xs font-mono">{r.status}</div>
          </div>
        ))}
      </div>

      {!done && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full bg-slate-900 text-white rounded-xl py-3 font-bold disabled:opacity-50"
        >
          {loading ? "Chargement..." : "Charger plus"}
        </button>
      )}
    </div>
  )
}
