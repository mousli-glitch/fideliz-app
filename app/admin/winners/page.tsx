"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, CheckCircle, Clock, Gift, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

// Type manuel pour éviter les conflits
type Winner = {
  id: string
  first_name: string
  phone: string
  email: string | null
  status: 'available' | 'redeemed'
  created_at: string
  qr_code: string
  prizes: {
    label: string
    color: string
  }
  games: {
    active_action: string
  }
}

export default function WinnersPage() {
  const supabase = createClient()
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  const fetchWinners = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. Récupérer l'ID Resto
    const { data: resto } = await (supabase.from("restaurants") as any)
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (resto) {
      // 2. Récupérer les gagnants liés aux jeux de ce resto
      // On utilise une requête imbriquée (nested query) pour récupérer les infos liées
      const { data } = await (supabase.from("winners") as any)
        .select(`
          *,
          prizes (label, color),
          games!inner (restaurant_id, active_action)
        `)
        .eq("games.restaurant_id", resto.id) // Filtre magique via la relation
        .order("created_at", { ascending: false })

      if (data) setWinners(data as any)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchWinners()
  }, [])

  // Action : Valider le lot (Le client est en caisse)
  const handleRedeem = async (winnerId: string) => {
    if (!confirm("Confirmer la remise du lot ? Cette action est irréversible.")) return

    const { error } = await (supabase.from("winners") as any)
      .update({ 
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq("id", winnerId)

    if (error) {
      alert("Erreur: " + error.message)
    } else {
      // Mise à jour locale pour éviter de recharger toute la page
      setWinners(winners.map(w => w.id === winnerId ? { ...w, status: 'redeemed' } : w))
    }
  }

  // Filtrage simple (Nom ou Tel ou QR)
  const filteredWinners = winners.filter(w => 
    (w.first_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.phone || "").includes(searchTerm) ||
    (w.qr_code || "").includes(searchTerm)
  )

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Gagnants & Leads</h2>
        <p className="text-slate-500">Suivez les lots distribués et validez les passages en caisse.</p>
      </div>

      {/* Barre de recherche */}
      <div className="flex gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input 
            placeholder="Rechercher (Nom, Tél, Code)..." 
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm text-left">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 bg-slate-50/50">
                <th className="h-12 px-4 align-middle font-medium text-slate-500">Client</th>
                <th className="h-12 px-4 align-middle font-medium text-slate-500">Lot Gagné</th>
                <th className="h-12 px-4 align-middle font-medium text-slate-500">Source</th>
                <th className="h-12 px-4 align-middle font-medium text-slate-500">Date</th>
                <th className="h-12 px-4 align-middle font-medium text-slate-500">Code</th>
                <th className="h-12 px-4 align-middle font-medium text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filteredWinners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="h-32 text-center text-slate-500">
                    Aucun gagnant pour le moment.
                  </td>
                </tr>
              ) : (
                filteredWinners.map((winner) => (
                  <tr key={winner.id} className="border-b transition-colors hover:bg-slate-50/50">
                    <td className="p-4 align-middle font-medium">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">{winner.first_name}</span>
                        <span className="text-xs text-slate-400 font-normal">{winner.phone}</span>
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-white shadow-sm" style={{ borderColor: winner.prizes?.color || '#e2e8f0' }}>
                        <Gift size={12} style={{ color: winner.prizes?.color }} />
                        {winner.prizes?.label || "Lot inconnu"}
                      </span>
                    </td>
                    <td className="p-4 align-middle text-slate-500 text-xs">
                      {winner.games?.active_action === 'GOOGLE_REVIEW' ? 'Avis Google' : 'Instagram'}
                    </td>
                    <td className="p-4 align-middle text-slate-500 text-xs">
                      {format(new Date(winner.created_at), 'dd MMM à HH:mm', { locale: fr })}
                    </td>
                    <td className="p-4 align-middle font-mono text-xs text-slate-400">
                      {winner.qr_code.slice(0, 6)}...
                    </td>
                    <td className="p-4 align-middle text-right">
                      {winner.status === 'redeemed' ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-bold bg-green-50 px-2 py-1 rounded border border-green-100">
                          <CheckCircle size={14} /> RÉCUPÉRÉ
                        </span>
                      ) : (
                        <Button 
                          size="sm" 
                          onClick={() => handleRedeem(winner.id)}
                          className="bg-slate-900 hover:bg-slate-800 text-white h-8 text-xs gap-1 shadow-sm"
                        >
                          <Clock size={14} /> Valider
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}