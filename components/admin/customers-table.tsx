"use client"

import { useState } from "react"
import { Search, Mail, MessageSquare, Calendar, UserCheck } from "lucide-react"

// On reprend tes types pour que tout corresponde
type Customer = {
  id: string
  first_name: string
  email: string | null
  phone: string
  created_at: string
  game: { active_action: string } | null
  prize: { label: string } | null
}

interface CustomersTableProps {
  initialCustomers: Customer[]
}

export function CustomersTable({ initialCustomers }: CustomersTableProps) {
  // C'est ici que la magie opère : l'état de la recherche
  const [searchTerm, setSearchTerm] = useState("")

  // La logique de filtre : on regarde si le terme est dans le nom, l'email, le tel ou le lot
  const filteredCustomers = initialCustomers.filter((client) => {
    const term = searchTerm.toLowerCase()
    return (
      (client.first_name || "").toLowerCase().includes(term) ||
      (client.email || "").toLowerCase().includes(term) ||
      (client.phone || "").includes(term) ||
      (client.prize?.label || "").toLowerCase().includes(term)
    )
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* BARRE DE RECHERCHE (Maintenant active !) */}
      <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
         <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
            <input 
                type="text" 
                placeholder="Rechercher un client (Nom, Email, Tel...)" 
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 transition bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         {searchTerm && (
             <div className="flex items-center text-sm text-blue-600 font-bold animate-in fade-in">
                 {filteredCustomers.length} résultat(s)
             </div>
         )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
            <tr>
              <th className="px-6 py-4">Client</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Jeu & Gain</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((client) => (
                <tr key={client.id} className="hover:bg-blue-50/50 transition">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {client.first_name || "Anonyme"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2"><Mail size={14} className={client.email ? "text-slate-400" : "text-slate-300"}/> {client.email || "-"}</span>
                        <span className="flex items-center gap-2"><MessageSquare size={14} className="text-slate-400"/> {client.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded w-fit text-xs mb-1">{client.prize?.label || "Lot inconnu"}</span>
                        <span className="text-xs text-slate-400">Via {client.game?.active_action || "Jeu"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400"/> 
                        {new Date(client.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold border border-green-200">
                        <UserCheck size={12}/> Opt-in
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="bg-slate-100 p-4 rounded-full"><UserCheck size={32} className="text-slate-300"/></div>
                    <p>Aucun client trouvé.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}