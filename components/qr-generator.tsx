"use client"

import { useState, useEffect } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface QrGeneratorProps {
  slug: string
  brandColor?: string
  restaurantName: string
}

export function QrGenerator({ slug, brandColor = "#000000", restaurantName }: QrGeneratorProps) {
  const [url, setUrl] = useState("")
  
  // On calcule l'URL réelle (https://...) une fois chargé dans le navigateur
  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin
      setUrl(`${origin}/play/${slug}`)
    }
  }, [slug])

  const downloadQr = (type: "print" | "branded") => {
    // On sélectionne le bon canvas caché
    const canvasId = type === "print" ? "qr-print" : "qr-branded"
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement
    
    if (canvas) {
      // Conversion en image PNG haute qualité
      const pngUrl = canvas.toDataURL("image/png")
      
      // Création du lien de téléchargement
      const downloadLink = document.createElement("a")
      downloadLink.href = pngUrl
      // Nom du fichier propre : nomresto-type-qr.png
      downloadLink.download = `${restaurantName.replace(/\s+/g, '-').toLowerCase()}-${type}-qr.png`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    }
  }

  if (!url) return null

  return (
    <Card className="p-6 mt-8 bg-white border-slate-200">
      <h3 className="text-lg font-bold text-slate-800 mb-4">🖨️ Kit Marketing QR</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* OPTION 1 : PRINT SAFE (Noir & Blanc) */}
        <div className="flex flex-col items-center p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="mb-4 bg-white p-2 shadow-sm">
            {/* Aperçu basse résolution pour l'écran */}
            <QRCodeCanvas value={url} size={120} level={"H"} />
          </div>
          <div className="text-center mb-4">
            <h4 className="font-bold text-slate-900">Version "Print Safe"</h4>
            <p className="text-xs text-slate-500">Noir sur Blanc • Contraste Max</p>
            <p className="text-xs text-slate-500">Pour affiches, stickers, menus</p>
          </div>
          <Button onClick={() => downloadQr("print")} variant="outline" className="w-full">
            ⬇️ Télécharger (HD)
          </Button>
        </div>

        {/* OPTION 2 : BRANDED (Couleur) */}
        <div className="flex flex-col items-center p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="mb-4 bg-white p-2 shadow-sm">
             {/* Aperçu couleur */}
            <QRCodeCanvas 
              value={url} 
              size={120} 
              level={"H"} 
              fgColor={brandColor} // Couleur du client
            />
          </div>
          <div className="text-center mb-4">
            <h4 className="font-bold text-slate-900">Version "Marque"</h4>
            <p className="text-xs text-slate-500">Couleur : {brandColor}</p>
            <p className="text-xs text-slate-500">Pour réseaux sociaux, web</p>
          </div>
          <Button 
            onClick={() => downloadQr("branded")} 
            className="w-full text-white"
            style={{ backgroundColor: brandColor }}
          >
            ⬇️ Télécharger (Couleur)
          </Button>
        </div>
      </div>

      {/* --- ZONE INVISIBLE (CANVAS HD POUR LE TÉLÉCHARGEMENT) --- */}
      {/* C'est ici qu'on génère la très haute résolution (2000px) pour l'impression */}
      <div className="hidden">
        
        {/* Canvas Print Safe (2000px = ~17cm à 300DPI, large pour du A6) */}
        <QRCodeCanvas 
          id="qr-print"
          value={url} 
          size={2000} // Ultra HD
          level={"H"} // Haute tolérance aux erreurs
          bgColor={"#ffffff"}
          fgColor={"#000000"}
          marginSize={4} // "Quiet Zone" obligatoire
        />

        {/* Canvas Branded */}
        <QRCodeCanvas 
          id="qr-branded"
          value={url} 
          size={2000}
          level={"H"}
          bgColor={"#ffffff"}
          fgColor={brandColor}
          marginSize={4}
        />
      </div>
    </Card>
  )
}