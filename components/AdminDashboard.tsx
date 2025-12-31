"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Card } from "@/components/ui/card"
import { AdminWinnerRow } from "@/components/admin-winner-row"

// 👇 AJOUT DE 'phone' DANS LA DÉFINITION
interface Winner {
  id: string
  created_at: string
  status: "available" | "redeemed"
  prize_title: string
  first_name: string
  phone: string      // Nouveau champ
  email?: string
}

interface AdminDashboardProps {
  slug: string
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminDashboard({ slug }: AdminDashboardProps) {
  const [winners, setWinners] = useState<Winner[]>([])

  const fetchWinners = async () => {
    // On récupère tout (*) donc le téléphone viendra avec
    const { data } = await supabase
      .from("winners")
      .select("*")
      .eq("game_id", slug)
      .eq("status", "available")
      .order("created_at", { ascending: false })

    if (data) setWinners(data)
  }

  useEffect(() => {
    fetchWinners()
    // Abonnement temps réel
    const channel = supabase
      .channel("realtime winners")
      .on("postgres_changes", { event: "*", schema: "public", table: "winners" }, () => {
        fetchWinners()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [slug])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800">
          À servir ({winners.length})
        </h2>
        <button 
          onClick={fetchWinners} 
          className="text-xs text-blue-600 hover:underline"
        >
          Actualiser ↻
        </button>
      </div>

      <div className="space-y-3">
        {winners.length === 0 && (
          <p className="text-center text-slate-400 py-8 italic">Aucun gagnant en attente</p>
        )}
        
        {winners.map((winner) => (
          <AdminWinnerRow 
            key={winner.id} 
            winner={winner} 
            onRedeem={fetchWinners} // On rafraîchit après validation
          />
        ))}
      </div>
    </div>
  )
}