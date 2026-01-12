"use client"

import { useState } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { deleteWinnerAction } from "@/app/actions/delete-winner" // 🔥 Import de la nouvelle action
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Loader2, Search, CheckCircle2, Calendar, Trash2 } from "lucide-react" // 🔥 Ajout de Trash2
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation" // 🔥 Pour récupérer le slug du restaurant

interface AdminWinnersTableProps {
  initialWinners: any[]
}

export function AdminWinnersTable({ initialWinners }: AdminWinnersTableProps) {
  const params = useParams()
  const slug = params?.slug as string
  
  // On stocke les gagnants dans un état local pour pouvoir les modifier instantanément
  const [winners, setWinners] = useState(initialWinners)
  const [searchTerm, setSearchTerm] = useState("")
  // Pour gérer le chargement individuel de chaque bouton (éviter de bloquer toute la page)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null) // 🔥 Loader spécifique suppression

  // Fonction de validation "INLINE"
  const handleQuickValidate = async (winnerId: string) => {
    if (!confirm("Confirmer la remise du lot au client ?")) return

    setLoadingId(winnerId)

    const result = await validateWinAction(winnerId)

    if (result.success) {
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

  // 🔥 NOUVELLE FONCTION : Suppression manuelle
  const handleDelete = async (winnerId: string) => {
    if (!confirm("Supprimer définitivement ce gagnant de la liste ? Cette action est irréversible.")) return

    setDeletingId(winnerId)

    try {
      const result = await deleteWinnerAction(winnerId, slug)
      if (result.success) {
        // On retire le gagnant de la liste locale immédiatement
        setWinners((prev) => prev.filter((w) => w.id !== winnerId))
      } else {
        alert("Erreur lors de la suppression : " + result.error)
      }
    } catch (err) {
      alert("Une erreur est survenue.")
    } finally {
      setDeletingId(null)
    }
  }

  // Filtrage pour la recherche
  const filteredWinners = winners.filter((w) => {
    const search = searchTerm.toLowerCase()
    const email = w.email?.toLowerCase() || ""
    const name = w.first_name?.toLowerCase() || ""
    // Gestion du snapshot ou du lot lié
    const prizeLabel = w.prizes?.label || w.prize_label_snapshot || ""
    return email.includes(search) || name.includes(search) || prizeLabel.toLowerCase().includes(search)
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
              <th className="pb-4 font-bold text-right pr-2">Actions</th>
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
                const prizeData = winner.prizes
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
                          backgroundColor: (prizeData?.color || "#cbd5e1") + "20",
                          color: prizeData?.color || "#64748b"
                        }}
                      >
                        {prizeData?.label || "Lot Archivé"}
                      </span>
                    </td>

                    {/* ACTIONS : VALIDATION + SUPPRESSION */}
                    <td className="py-4 text-right pr-2">
                      <div className="flex items-center justify-end gap-2">
                        {isRedeemed ? (
                          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                            <CheckCircle2 size={12} />
                            Validé le {winner.redeemed_at ? format(new Date(winner.redeemed_at), "dd/MM", { locale: fr }) : "?"}
                          </div>
                        ) : (
                          <Button 
                            onClick={() => handleQuickValidate(winner.id)}
                            disabled={loadingId === winner.id}
                            className="bg-green-600 hover:bg-green-700 text-white shadow-md h-8 px-3 text-[10px] font-bold transition-all active:scale-95"
                          >
                            {loadingId === winner.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Valider"}
                          </Button>
                        )}

                        {/* BOUTON SUPPRIMER */}
                        <button
                          onClick={() => handleDelete(winner.id)}
                          disabled={deletingId === winner.id}
                          className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer définitivement"
                        >
                          {deletingId === winner.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
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