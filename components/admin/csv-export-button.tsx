"use client"

import { Download } from "lucide-react"

interface CsvExportButtonProps {
  data: any[]
  filename?: string
}

export default function CsvExportButton({ data, filename = "clients_crm.csv" }: CsvExportButtonProps) {
  
  const handleExport = () => {
    if (!data || data.length === 0) {
      alert("Aucune donnée à exporter.")
      return
    }

    // 1. On définit les entêtes du CSV
    const headers = ["Prenom", "Email", "Telephone", "Jeu", "Date d'inscription", "Lot Gagné"]
    
    // 2. On transforme les données en format CSV
    const csvContent = [
      headers.join(","), // Ligne d'entête
      ...data.map(client => {
        const row = [
          `"${client.first_name || ''}"`, // On met des guillemets pour gérer les espaces
          `"${client.email || ''}"`,
          `"${client.phone || ''}"`,
          `"${client.game?.active_action || 'Jeu'}"`,
          `"${new Date(client.created_at).toLocaleDateString('fr-FR')}"`,
          `"${client.prize?.label || 'Inconnu'}"`
        ]
        return row.join(",")
      })
    ].join("\n")

    // 3. On crée le fichier et on déclenche le téléchargement
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <button 
      onClick={handleExport}
      className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-100 transition shadow-sm"
    >
      <Download size={18} /> Export CSV
    </button>
  )
}