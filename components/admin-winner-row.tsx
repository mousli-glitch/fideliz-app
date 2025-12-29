"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { redeemWinner } from "@/app/actions/redeem-winner"

interface WinnerRowProps {
  winner: any
  onRedeemed: () => void
}

export function WinnerRow({ winner, onRedeemed }: WinnerRowProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    if (!confirm("Confirmer la remise du gain ?")) return

    setIsLoading(true)
    
    try {
      const result = await redeemWinner(winner.id)

      if (result.success) {
        onRedeemed() // Rafraîchir la liste
      } else {
        alert("Erreur lors de la validation")
      }
    } catch (err) {
      console.error(err)
      alert("Erreur de connexion")
    } finally {
      // ✅ ROBUSTESSE : On débloque le bouton quoi qu'il arrive
      setIsLoading(false)
    }
  }

  const time = new Date(winner.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  
  // Formatage propre de la date (ex: 29/12)
  const date = new Date(winner.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit'
  })

  return (
    <div className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm mb-3">
      <div>
        <div className="font-bold text-lg text-slate-900">
          {winner.prize_title}
        </div>
        <div className="text-sm text-slate-500">
          {winner.first_name} • {date} à {time}
        </div>
      </div>

      <Button 
        onClick={handleClick} 
        disabled={isLoading}
        className={`${isLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"} text-white font-bold shadow-md transition-all active:scale-95`}
      >
        {isLoading ? "..." : "VALIDER"}
      </Button>
    </div>
  )
}