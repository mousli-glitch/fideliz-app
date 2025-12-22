"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Typage strict aligné sur la DB
interface Winner {
  id: string
  email: string
  prize: string
  status: 'available' | 'redeemed'
  created_at: string
  redeemed_at: string | null
  restaurants: { name: string }
}

export default function AdminDashboard() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(true)

  // Fonction pour charger la liste
  const fetchWinners = async () => {
    try {
      const res = await fetch('/api/admin/winners')
      if (res.status === 401) {
         // Si le middleware bloque (cas rare ici car page protégée aussi), on recharge
         window.location.reload()
         return
      }
      const data = await res.json()
      if (data.winners) setWinners(data.winners)
    } catch (e) {
      console.error("Erreur chargement:", e)
    } finally {
      setLoading(false)
    }
  }

  // Chargement initial
  useEffect(() => {
    fetchWinners()
  }, [])

  // Action de validation
  const handleRedeem = async (id: string) => {
    if (!confirm("Confirmer la remise du cadeau ?")) return

    // Optimistic UI : on met à jour l'écran tout de suite pour la fluidité
    const backupWinners = [...winners]
    setWinners(prev => prev.map(w => 
      w.id === id ? { ...w, status: 'redeemed', redeemed_at: new Date().toISOString() } : w
    ))

    try {
      const res = await fetch('/api/admin/winners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })

      // Gestion des erreurs spécifiques
      if (!res.ok) {
        if (res.status === 409) {
          alert("❌ Attention : Ce gain a DÉJÀ été validé !")
        } else {
          alert("❌ Erreur technique serveur.")
        }
        // En cas d'erreur, on remet les données réelles
        fetchWinners()
      }
    } catch (e) {
      alert("Erreur réseau.")
      setWinners(backupWinners)
    }
  }

  if (loading) return <div className="p-8 text-center">Chargement des données...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Derniers Gagnants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-zinc-500 uppercase font-medium border-b">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Restaurant</th>
                  <th className="p-4">Client</th>
                  <th className="p-4">Gain</th>
                  <th className="p-4">Statut</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {winners.map((winner) => (
                  <tr key={winner.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-4 text-zinc-500">
                      {new Date(winner.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'
                      })}
                    </td>
                    <td className="p-4 font-medium">{winner.restaurants?.name || 'Inconnu'}</td>
                    <td className="p-4">{winner.email}</td>
                    <td className="p-4 font-bold text-green-700">{winner.prize}</td>
                    
                    {/* Badge de Statut (Traduction EN -> FR) */}
                    <td className="p-4">
                      {winner.status === 'redeemed' ? (
                        <Badge variant="secondary" className="bg-zinc-200 text-zinc-600">
                          Consommé
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          Disponible
                        </Badge>
                      )}
                    </td>

                    {/* Bouton d'action (visible seulement si 'available') */}
                    <td className="p-4 text-right">
                      {winner.status === 'available' && (
                        <Button 
                          size="sm" 
                          onClick={() => handleRedeem(winner.id)}
                          className="bg-black text-white hover:bg-green-600"
                        >
                          Valider
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {winners.length === 0 && (
              <div className="p-8 text-center text-zinc-500">Aucun gagnant pour le moment.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}