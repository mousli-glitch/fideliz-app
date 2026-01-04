"use client"

import { useState } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Loader2, Search, CheckCircle2, Clock, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AdminWinnersTableProps {
  initialWinners: any[]
}

export function AdminWinnersTable({ initialWinners }: AdminWinnersTableProps) {
  // On stocke les gagnants dans un état local pour pouvoir les modifier instantanément
  const [winners, setWinners] = useState(initialWinners)
  const [searchTerm, setSearchTerm] = useState("")
  // Pour gérer le chargement individuel de chaque bouton (éviter de bloquer toute la page)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  // Fonction de validation "INLINE" (sans redirection)
  const handleQuickValidate = async (winnerId: string) => {
    if (!confirm("Confirmer la remise du lot au client ?")) return

    setLoadingId(winnerId) // On active le loader sur CE bouton uniquement

    // On appelle notre action serveur (la même que pour le QR code)
    const result = await validateWinAction(winnerId)

    if (result.success) {
      // ⚡️ MAGIE : On met à jour le tableau localement immédiatement
      setWinners((prevWinners) => 
        prevWinners.map((w) => 
          w.id === winnerId 
            ? { ...w, status: "redeemed", redeemed_at: new Date().toISOString() } 
            : w
        )
      )
    } else {
      alert("Erreur : " + result.message)
    }

    setLoadingId(null)
  }

  // Filtrage pour la recherche
  const filteredWinners = winners.filter((w) => {
    const search = searchTerm.toLowerCase()
    const email = w.email?.toLowerCase() || ""
    const name = w.first_name?.toLowerCase() || ""
    const prize = Array.isArray(w.prizes) ? w.prizes[0]?.label : w.prizes?.label || ""
    return email.includes(search) || name.includes(search) || prize.toLowerCase().includes(search)
  })

  return (
    <div className="p-6">
      {/* Barre de recherche */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Rechercher par nom, email ou lot..."
          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
              <th className="pb-4 font-bold pl-2">Date Gain</th>
              <th className="pb-4 font-bold">Client</th>
              <th className="pb-4 font-bold">Lot Gagné</th>
              <th className="pb-4 font-bold text-right pr-2">Action</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filteredWinners.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400 italic">
                  Aucun résultat trouvé.
                </td>
              </tr>
            ) : (
              filteredWinners.map((winner) => {
                // Gestion sécurisée du Lot (Tableau ou Objet)
                const prizeData = Array.isArray(winner.prizes) ? winner.prizes[0] : winner.prizes
                const isRedeemed = winner.status === "redeemed" || winner.status === "consumed"

                return (
                  <tr key={winner.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    
                    {/* DATE */}
                    <td className="py-4 pl-2 text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-300"/>
                        {format(new Date(winner.created_at), "dd MMM HH:mm", { locale: fr })}
                      </div>
                    </td>

                    {/* CLIENT */}
                    <td className="py-4">
                      <div className="font-bold text-slate-700">{winner.first_name || "Anonyme"}</div>
                      <div className="text-xs text-slate-400">{winner.email}</div>
                    </td>

                    {/* LOT */}
                    <td className="py-4">
                      <span 
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{ 
                          backgroundColor: (prizeData?.color || "#cbd5e1") + "20", // Couleur + 20% transparence
                          color: prizeData?.color || "#64748b"
                        }}
                      >
                        {prizeData?.label || "Lot Mystère"}
                      </span>
                    </td>

                    {/* BOUTON ACTION */}
                    <td className="py-4 text-right pr-2">
                      {isRedeemed ? (
                        // ÉTAT 1 : DÉJÀ VALIDÉ
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                          <CheckCircle2 size={14} />
                          Validé le {winner.redeemed_at ? format(new Date(winner.redeemed_at), "dd/MM", { locale: fr }) : "?"}
                        </div>
                      ) : (
                        // ÉTAT 2 : À VALIDER (Bouton Actif)
                        <Button 
                          onClick={() => handleQuickValidate(winner.id)}
                          disabled={loadingId === winner.id}
                          className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200 h-9 px-4 text-xs font-bold transition-all active:scale-95"
                        >
                          {loadingId === winner.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Valider"
                          )}
                        </Button>
                      )}
                    </td>

                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}