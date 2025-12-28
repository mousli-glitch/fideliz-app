"use client"

import { useState, useEffect } from "react"
import QRCode from "react-qr-code"

interface Props {
  slug: string
}

export default function AdminQrCard({ slug }: Props) {
  const [baseUrl, setBaseUrl] = useState("")
  
  // On détecte l'adresse actuelle (localhost ou IP) pour que le QR marche tout de suite
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  // L'URL du jeu pour le client
  const playUrl = `${baseUrl}/play/${slug}`

  if (!baseUrl) return null

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row items-center gap-8">
      
      {/* LE QR CODE (Cadre blanc) */}
      <div className="bg-white p-4 rounded-lg border-2 border-slate-900 shadow-lg">
        <QRCode 
          value={playUrl} 
          size={150} 
          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          viewBox={`0 0 256 256`}
        />
      </div>

      {/* LES INFOS */}
      <div className="flex-1 space-y-4 text-center md:text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-900">QR Code du Jeu</h2>
          <p className="text-sm text-slate-500">Imprimez ou scannez ce code pour tester le parcours client.</p>
        </div>

        {/* URL affichée pour vérification */}
        <div className="p-3 bg-slate-50 rounded border border-slate-200 font-mono text-xs text-slate-600 break-all select-all">
          {playUrl}
        </div>

        <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-100 text-left">
            ℹ️ <strong>Pour tester avec ton mobile :</strong><br/>
            Si le scan ne marche pas (site inaccessible), remplace "localhost" par l'adresse IP de ton Mac dans la barre d'adresse du téléphone (ex: 192.168.1.X).
        </div>
      </div>
    </div>
  )
}