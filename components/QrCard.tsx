"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface QrCardProps {
  slug?: string
  baseUrl?: string
  url?: string // 🔥 NOUVEAU : On accepte l'URL complète
  logoUrl?: string // Logo du restaurant à placer au centre du QR
}

export default function QrCard({ slug, baseUrl, url, logoUrl }: QrCardProps) {
  // 🔥 LOGIQUE CORRIGÉE :
  // Si on fournit 'url', on l'utilise telle quelle.
  // Sinon, on garde l'ancienne méthode (baseUrl + /play/ + slug) pour la rétrocompatibilité.
  const targetUrl = url
    ? url
    : `${baseUrl}/play/${slug}`

  // On précharge le logo en "data URL" (base64) pour qu'il s'intègre au QR sans
  // problème de sécurité cross-origin au moment du téléchargement PNG.
  const [logoData, setLogoData] = useState<string | null>(null)
  useEffect(() => {
    if (!logoUrl) { setLogoData(null); return }
    let cancelled = false
    fetch(logoUrl)
      .then((r) => r.blob())
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }))
      .then((dataUrl) => { if (!cancelled) setLogoData(dataUrl) })
      .catch(() => { /* logo indisponible -> QR simple, aucun blocage */ })
    return () => { cancelled = true }
  }, [logoUrl])

  // Réglages du logo central (~22% du QR : sûr avec la correction d'erreur niveau H)
  const logoSettings = (size: number) =>
    logoData
      ? { src: logoData, height: Math.round(size * 0.22), width: Math.round(size * 0.22), excavate: true }
      : undefined

  const downloadPng = () => {
    const canvas = document.getElementById("qr-download-canvas") as HTMLCanvasElement | null
    if (!canvas) return
    const link = document.createElement("a")
    link.href = canvas.toDataURL("image/png")
    link.download = `qr-${slug || "fideliz"}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-4 print:p-0 print:bg-white">
      
      {/* ZONE DE CONTRÔLE (Masquée à l'impression) */}
      <div className="mb-8 text-center space-y-4 print:hidden">
        <h1 className="text-2xl font-bold">QR Code : {slug || 'Restaurant'}</h1>
        <p className="text-zinc-500 break-all max-w-md mx-auto">
          Cible : <span className="text-blue-600 font-mono text-xs">{targetUrl}</span>
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button onClick={() => window.print()} className="bg-black text-white hover:bg-zinc-800">
            🖨️ Imprimer (A6)
          </Button>
          <Button onClick={downloadPng} variant="outline">
            ⬇️ Télécharger (PNG HD)
          </Button>
        </div>
      </div>

      {/* Canvas haute résolution caché, servant uniquement au téléchargement PNG */}
      <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden="true">
        <QRCodeCanvas id="qr-download-canvas" value={targetUrl} size={1000} level="H" includeMargin imageSettings={logoSettings(1000)} />
      </div>

      {/* LA CARTE A6 (Zone imprimée) */}
      <Card className="w-[105mm] h-[148mm] bg-white shadow-xl flex flex-col items-center justify-center text-center p-8 border-4 border-black print:border-2 print:shadow-none print:break-inside-avoid">
        
        <h2 className="text-2xl font-black uppercase tracking-widest text-black">
          Jeu Concours
        </h2>
        <div className="w-12 h-1 bg-black mx-auto mt-2"></div>

        <div className="border-2 border-black p-2 rounded-lg my-6">
          {/* QR Code SVG Haute Qualité */}
          <QRCodeSVG
            value={targetUrl}
            size={180}
            level="H"
            includeMargin
            imageSettings={logoSettings(180)}
          />
        </div>

        <p className="font-bold text-xl text-black">SCANNEZ & JOUEZ</p>
        <p className="text-sm font-medium text-zinc-500 bg-zinc-100 inline-block px-3 py-1 rounded-full border border-zinc-200 mt-2">
          🎁 100% GAGNANT
        </p>

        <div className="mt-auto pt-4 text-[10px] text-zinc-400 uppercase tracking-widest">
          Offert par {slug ? `Restaurant ${slug}` : 'la Maison'}
        </div>
      </Card>
    </div>
  )
}