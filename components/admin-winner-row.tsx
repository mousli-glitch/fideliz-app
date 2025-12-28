"use client"

import { useState } from "react"
import { redeemWinner } from "@/app/actions/redeem-winner"

interface Props {
  winner: any
  restaurantSlug: string
}

export default function AdminWinnerRow({ winner, restaurantSlug }: Props) {
  const [isLoading, setIsLoading] = useState(false)

  const handleRedeem = async () => {
    if (!confirm(`Valider le cadeau "${winner.prize_title}" pour ce client ?`)) return

    setIsLoading(true)
    await redeemWinner(winner.id, restaurantSlug)
    setIsLoading(false)
  }

  const isRedeemed = winner.status === 'redeemed'

  // On formate la date en Français explicitement pour éviter les erreurs serveur/client
  const date = new Date(winner.created_at)
  const dateStr = date.toLocaleDateString('fr-FR')
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <tr className={`transition-colors ${isRedeemed ? 'bg-slate-50 opacity-75' : 'hover:bg-blue-50'}`}>
      <td className="p-4 text-sm text-slate-500">
        {dateStr} <br/>
        <span className="text-xs opacity-50">{timeStr}</span>
      </td>
      <td className="p-4">
        <div className="font-medium text-slate-900">{winner.first_name || "Inconnu"}</div>
        <div className="text-xs text-slate-500">{winner.email}</div>
      </td>
      <td className="p-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          🎁 {winner.prize_title}
        </span>
      </td>
      <td className="p-4">
        {isRedeemed ? (
          <span className="text-xs font-bold px-2 py-1 rounded bg-green-100 text-green-700 border border-green-200">
            ✅ RÉCUPÉRÉ
          </span>
        ) : (
          <button 
            onClick={handleRedeem}
            disabled={isLoading}
            // MODIFICATION ICI : bg-black pour être sûr que ce soit visible
            className="text-xs font-bold px-4 py-2 rounded bg-black text-white hover:bg-slate-800 shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isLoading ? "..." : "VALIDER LE GAIN"}
          </button>
        )}
      </td>
    </tr>
  )
}