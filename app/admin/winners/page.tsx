"use client"

import { useEffect, useState } from "react"
import { getAdminWinners, redeemWinnerAction } from "../../actions/admin"
import { Loader2, CheckCircle, XCircle, Search, Calendar, Gift } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

export default function AdminWinnersPage() {
  const [winners, setWinners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")

  // 1. CHARGEMENT DES DONNÉES (Sans getUser !)
  const fetchData = async () => {
    setLoading(true)
    const data = await getAdminWinners()
    setWinners(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // 2. ACTION DE VALIDATION
  const handleRedeem = async (id: string) => {
    if (!confirm("Confirmer la validation de ce lot ?")) return

    try {
      await redeemWinnerAction(id)
      // Mise à jour locale pour effet immédiat
      setWinners(prev => prev.map(w => w.id === id ? { ...w, status: 'consumed', consumed_at: new Date().toISOString() } : w))
    } catch (err) {
      alert("Erreur lors de la validation")
    }
  }

  // Filtrage simple
  const filteredWinners = winners.filter(w => 
    w.first_name?.toLowerCase().includes(filter.toLowerCase()) ||
    w.email?.toLowerCase().includes(filter.toLowerCase()) ||
    w.prizes?.label?.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-black text-slate-800">Gagnants & Lots 🏆</h1>
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
            <input 
                type="text" 
                placeholder="Rechercher (Nom, Email, Lot...)" 
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
            />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 w-12 h-12"/></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Client</th>
                  <th className="p-4">Jeu</th>
                  <th className="p-4">Lot Gagné</th>
                  <th className="p-4 text-center">Statut</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredWinners.map((winner) => (
                  <tr key={winner.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-500">
                        <div className="flex items-center gap-2">
                            <Calendar size={14}/>
                            {format(new Date(winner.created_at), "dd MMM HH:mm", { locale: fr })}
                        </div>
                    </td>
                    <td className="p-4 font-medium text-slate-900">
                        <div>{winner.first_name || "Anonyme"}</div>
                        <div className="text-xs text-slate-400">{winner.email}</div>
                    </td>
                    <td className="p-4 text-slate-600">{winner.games?.name}</td>
                    <td className="p-4">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: winner.prizes?.color + '20', color: winner.prizes?.color }}>
                            <Gift size={12}/>
                            {winner.prizes?.label}
                        </span>
                    </td>
                    <td className="p-4 text-center">
                        {winner.status === 'consumed' ? (
                            <span className="text-xs font-bold text-slate-400 flex items-center justify-center gap-1">
                                <CheckCircle size={14}/> Consommé
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-green-600 flex items-center justify-center gap-1">
                                <CheckCircle size={14}/> Disponible
                            </span>
                        )}
                    </td>
                    <td className="p-4 text-right">
                        {winner.status !== 'consumed' && (
                            <button 
                                onClick={() => handleRedeem(winner.id)}
                                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-md transition-all active:scale-95"
                            >
                                Valider
                            </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredWinners.length === 0 && (
             <div className="text-center py-12 text-slate-400">
                Aucun gagnant trouvé.
             </div>
          )}
        </div>
      )}
    </div>
  )
}