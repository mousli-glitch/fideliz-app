"use client"

import { useState } from "react"
import { exportWinnersCsvAction, exportWinnersCampaignCsvAction } from "@/app/actions/export-winners-csv"

export default function WinnersExportButton({
  restaurantSlug,
  filename,
  mode,
}: {
  restaurantSlug: string
  filename?: string
  mode: "all" | "campaign"
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

    const res =
      mode === "campaign"
        ? await exportWinnersCampaignCsvAction(restaurantSlug)
        : await exportWinnersCsvAction(restaurantSlug)

    if (!res.success) {
      alert("Erreur export: " + res.message)
      setLoading(false)
      return
    }

    download(res.csv, filename || res.filename || "export.csv")
    setLoading(false)
  }

  const label = mode === "campaign" ? "Exporter gagnants (opt-in)" : "Exporter gagnants (complet)"

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-50"
    >
      {loading ? "Export..." : label}
    </button>
  )
}