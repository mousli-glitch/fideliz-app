"use client"

import { useState, useRef, useEffect } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { ScanLine, CheckCircle2, XCircle, AlertTriangle, Loader2, Camera } from "lucide-react"

export default function ScannerPage() {
  const [active, setActive] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ type: "success" | "used" | "error"; msg: string } | null>(null)
  const scannerRef = useRef<any>(null)
  const lockRef = useRef(false)

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop()
        scannerRef.current.clear?.()
      }
    } catch {
      /* ignore */
    }
    scannerRef.current = null
    setActive(false)
  }

  useEffect(() => {
    return () => {
      // Nettoyage si on quitte la page
      if (scannerRef.current) {
        scannerRef.current.stop?.().catch(() => {})
      }
    }
  }, [])

  const handleScan = async (decodedText: string) => {
    if (lockRef.current) return
    lockRef.current = true
    await stopCamera()
    setProcessing(true)

    // On extrait l'identifiant (UUID) que le QR contienne l'URL complète ou juste l'ID
    const match = decodedText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    const winnerId = match ? match[0] : decodedText.trim()

    try {
      const res: any = await validateWinAction(winnerId)
      if (res.success) {
        setResult({ type: "success", msg: res.prizeLabel ? `Gain validé : ${res.prizeLabel}` : "Gain validé !" })
      } else if (res.alreadyUsed) {
        setResult({ type: "used", msg: res.message || "Ce gain a déjà été utilisé." })
      } else {
        setResult({ type: "error", msg: res.message || "QR code invalide." })
      }
    } catch {
      setResult({ type: "error", msg: "Erreur lors de la validation." })
    } finally {
      setProcessing(false)
    }
  }

  const startScan = async () => {
    setResult(null)
    lockRef.current = false
    setActive(true)
    // On laisse le DOM afficher le conteneur #reader avant de démarrer la caméra
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        const scanner = new Html5Qrcode("reader")
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          handleScan,
          () => {}
        )
      } catch {
        setActive(false)
        setResult({ type: "error", msg: "Impossible d'ouvrir la caméra. Autorisez l'accès à la caméra dans votre navigateur." })
      }
    }, 150)
  }

  const reset = () => {
    setResult(null)
    lockRef.current = false
  }

  const card = {
    success: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", Icon: CheckCircle2 },
    used: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", Icon: AlertTriangle },
    error: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", Icon: XCircle },
  }

  return (
    <div className="max-w-xl mx-auto p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <ScanLine className="text-blue-600" /> Scanner
        </h1>
        <p className="text-slate-500 font-medium mt-1">Scannez le QR code du client pour valider son gain instantanément.</p>
      </div>

      {result ? (
        <div className={`rounded-2xl border p-8 text-center ${card[result.type].bg} ${card[result.type].border}`}>
          {(() => {
            const I = card[result.type].Icon
            return <I className={`w-16 h-16 mx-auto mb-4 ${card[result.type].text}`} />
          })()}
          <p className={`text-xl font-black ${card[result.type].text}`}>{result.msg}</p>
          <button
            onClick={reset}
            className="mt-6 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 active:scale-95 transition-all"
          >
            Scanner un autre client
          </button>
        </div>
      ) : processing ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-600" />
          <p className="mt-4 font-bold text-slate-600">Validation en cours…</p>
        </div>
      ) : active ? (
        <div className="rounded-2xl border border-slate-200 bg-black overflow-hidden">
          <div id="reader" className="w-full" />
          <button
            onClick={stopCamera}
            className="w-full bg-slate-800 text-white py-3 font-bold hover:bg-slate-700 transition-colors"
          >
            Annuler
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Camera className="w-14 h-14 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium mb-6">Appuyez pour ouvrir la caméra et scanner le ticket gagnant du client.</p>
          <button
            onClick={startScan}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 active:scale-95 transition-all inline-flex items-center gap-2 shadow-lg shadow-blue-100"
          >
            <ScanLine size={20} /> Démarrer le scan
          </button>
        </div>
      )}
    </div>
  )
}
