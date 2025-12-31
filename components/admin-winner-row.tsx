"use client"

import { useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Winner {
  id: string
  created_at: string
  status: "available" | "redeemed"
  prize_title: string
  first_name: string
  phone: string
}

interface RowProps {
  winner: Winner
  onRedeem: () => void
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function AdminWinnerRow({ winner, onRedeem }: RowProps) {
  const [loading, setLoading] = useState(false)

  const handleValidate = async () => {
    // Petit confort : pas de confirm() bloquant, juste un clic direct et fluide
    setLoading(true)
    
    const { error } = await supabase
        .from('winners')
        .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
        .eq('id', winner.id)

    if (!error) {
        onRedeem() 
    } else {
        alert("Erreur validation : " + error.message)
    }
    setLoading(false)
  }

  // Format date court : "31/12 à 10:30"
  const dateStr = new Date(winner.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <Card className="p-3 flex items-center justify-between shadow-sm border-slate-100">
      {/* Partie Gauche : Infos */}
      <div className="flex flex-col">
        {/* Le Cadeau en gros */}
        <span className="font-bold text-slate-900 text-base">
          {winner.prize_title}
        </span>
        
        {/* Le Client et son Tel */}
        <div className="flex items-center text-sm text-slate-600 mt-1">
          <span className="font-medium capitalize">{winner.first_name}</span>
          <span className="mx-2 text-slate-300">•</span>
          <span className="font-mono text-slate-500 text-xs bg-slate-100 px-1 rounded">
            {winner.phone}
          </span>
        </div>

        {/* La Date en tout petit */}
        <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">
          {dateStr}
        </span>
      </div>

      {/* Partie Droite : Bouton */}
      <Button 
        onClick={handleValidate} 
        disabled={loading}
        size="sm" // Bouton plus petit pour garder l'élégance
        className={`font-bold ml-4 transition-all ${
          loading 
            ? 'opacity-50 cursor-not-allowed' 
            : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
        }`}
      >
        {loading ? "..." : "VALIDER"}
      </Button>
    </Card>
  )
}