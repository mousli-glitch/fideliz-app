"use client"

import { useEffect, useState } from "react"
import { WinnerRow } from "./admin-winner-row"

export default function AdminDashboard({ slug }: { slug: string }) {
  const [winners, setWinners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWinners = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/winners?slug=${slug}`)
      const data = await res.json()
      if (data.winners) {
        setWinners(data.winners)
      }
    } catch (e) {
      console.error("Erreur fetch", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWinners()
    const interval = setInterval(fetchWinners, 10000) // Auto-refresh 10s
    return () => clearInterval(interval)
  }, [slug])

  return (
    <div className="max-w-md mx-auto mt-6">
      <div className="flex justify-between items-center mb-6 px-2">
        <h2 className="text-xl font-bold text-slate-800">À servir ({winners.length})</h2>
        <button 
          onClick={fetchWinners}
          className="text-sm text-blue-600 font-medium hover:underline"
        >
          Actualiser ↻
        </button>
      </div>

      {loading && winners.length === 0 ? (
        <div className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-slate-500">Chargement...</p>
        </div>
      ) : winners.length === 0 ? (
        <div className="text-center p-8 bg-slate-100 rounded-xl border border-slate-200 text-slate-500">
          <div className="text-4xl mb-2">💤</div>
          Aucun gagnant en attente.
        </div>
      ) : (
        <div className="space-y-3">
          {winners.map((winner) => (
            <WinnerRow 
              key={winner.id} 
              winner={winner} 
              onRedeemed={fetchWinners} 
            />
          ))}
        </div>
      )}
    </div>
  )
}