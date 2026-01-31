"use client"

import { useState } from "react"
import { exportWinnersTwilioCsvAction } from "@/app/actions/export-winners-csv"

export default function WinnersExportTwilioButton({
  restaurantSlug,
  optInOnly,
  statusFilter,
  filename,
}: {
  restaurantSlug: string
  optInOnly?: boolean
  statusFilter?: string | null
  filename?: string
}) {
  const [loading, setLoading] = useState(false)

  const download = (text: string, name: string) => {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const onClick = async () => {
    if (loading) return
    setLoading(true)

    const res = await exportWinnersTwilioCsvAction(restaurantSlug, {
      optInOnly: Boolean(optInOnly),
      statusFilter: statusFilter ?? null,
      // tu peux changer le template ici si tu veux :
      // template: "Salut {{firstName}} ..."
    })

    if (!res.success) {
      alert("Erreur export: " + res.message)
      setLoading(false)
      return
    }

    download(res.csv, filename || res.filename || "twilio.csv")
    setLoading(false)
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-50"
    >
      {loading ? "Export..." : optInOnly ? "Exporter Twilio (opt-in)" : "Exporter Twilio"}
    </button>
  )
}