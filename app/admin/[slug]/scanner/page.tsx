"use client"

import { useState, useRef, useEffect } from "react"
import { validateWinAction } from "@/app/actions/validate-win"
import { getWinnerInfoAction } from "@/app/actions/get-winner-info"
import { ScanLine, CheckCircle2, XCircle, AlertTriangle, Loader2, Camera, Gift } from "lucide-react"

export default function ScannerPage() {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<any>(null) // gain en attente de confirmation
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
      if (scannerRef.current) scannerRef.current.stop?.().catch(() => {})
    }
  }, [])

  // 1. Scan → on LIT le gain (sans valider) et on affiche l'aperçu
  const handleScan = async (decodedText: string) => {
    if (lockRef.current) return
    lockRef.current = true
    await stopCamera()
    setBusy(true)

    const match = decodedText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    const winnerId = match ? match[0] : decodedText.trim()

    try {
      const info: any = await getWinnerInfoAction(winnerId)
      if (!info.success) setResult({ type: "error", msg: info.message || "QR code invalide." })
      else setReview(info)
    } catch {
      setResult({ type: "error", msg: "Erreur lors de la lecture du ticket." })
    } finally {
      setBusy(false)
    }
  }

  // 2. Confirmation → on VALIDE réellement
  const confirmValidate = async () => {
    if (!review) return
    setBusy(true)
    try {
      const res: any = await validateWinAction(review.winnerId)
      if (res.success) setResult({ type: "success", msg: review.prizeLabel ? `Gain validé : ${review.prizeLabel}` : "Gain validé !" })
      else if (res.alreadyUsed) setResult({ type: "used", msg: res.message || "Ce gain a déjà été utilisé." })
      else setResult({ type: "error", msg: res.message || "Validation impossible." })
    } catch {
      setResult({ type: "error", msg: "Erreur lors de la validation." })
    } finally {
      setReview(null)
      setBusy(false)
    }
  }

  const reset = () => {
    setReview(null)
    setResult(null)
    lockRef.current = false
  }

  const startScan = async () => {
    reset()
    setActive(true)
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        const scanner = new Html5Qrcode("reader")
        scannerRef.current = scanner
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, handleScan, () => {})
      } catch {
        setActive(false)
        setResult({ type: "error", msg: "Impossible d'ouvrir la caméra. Autorisez l'accès à la caméra dans votre navigateur." })
      }
    }, 150)
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
        <p className="text-slate-500 font-medium mt-1">Scannez le QR du client, vérifiez le lot, puis validez.</p>
      </div>

      {/* RÉSULTAT FINAL */}
      {result ? (
        <div className={`rounded-2xl border p-8 text-center ${card[result.type].bg} ${card[result.type].border}`}>
          {(() => {
            const I = card[result.type].Icon
            return <I className={`w-16 h-16 mx-auto mb-4 ${card[result.type].text}`} />
          })()}
          <p className={`text-xl font-black ${card[result.type].text}`}>{result.msg}</p>
          <button onClick={reset} className="mt-6 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 active:scale-95 transition-all">
            Scanner un autre client
          </button>
        </div>
      ) : busy ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-600" />
          <p className="mt-4 font-bold text-slate-600">Traitement…</p>
        </div>
      ) : review ? (
        /* ÉTAPE DE CONFIRMATION */
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <Gift className="text-blue-600" size={28} />
          </div>
          <p className="text-slate-500 font-medium">Client : <span className="font-bold text-slate-800">{review.firstName}</span></p>
          <p className="text-2xl font-black text-slate-900 mt-1">{review.prizeLabel}</p>

          {review.status === "redeemed" ? (
            <div className="mt-6 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-4 font-bold flex items-center justify-center gap-2">
              <AlertTriangle size={20} /> Déjà utilisé{review.redeemedAt ? ` le ${new Date(review.redeemedAt).toLocaleString("fr-FR")}` : ""}
            </div>
          ) : (
            <>
              {review.expired && (
                <p className="mt-3 text-sm font-bold text-red-600 flex items-center justify-center gap-1">
                  <AlertTriangle size={16} /> Attention : ce ticket est expiré.
                </p>
              )}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={reset} className="bg-slate-100 text-slate-700 py-4 rounded-xl font-bold hover:bg-slate-200 active:scale-95 transition-all">
                  Annuler
                </button>
                <button onClick={confirmValidate} className="bg-green-600 text-white py-4 rounded-xl font-black hover:bg-green-700 active:scale-95 transition-all shadow-lg shadow-green-100">
                  Valider le gain
                </button>
              </div>
            </>
          )}

          {review.status === "redeemed" && (
            <button onClick={reset} className="mt-6 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 active:scale-95 transition-all">
              Retour
            </button>
          )}
        </div>
      ) : active ? (
        /* CAMÉRA */
        <div className="rounded-2xl border border-slate-200 bg-black overflow-hidden">
          <div id="reader" className="w-full" />
          <button onClick={stopCamera} className="w-full bg-slate-800 text-white py-3 font-bold hover:bg-slate-700 transition-colors">
            Annuler
          </button>
        </div>
      ) : (
        /* DÉMARRAGE */
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Camera className="w-14 h-14 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium mb-6">Appuyez pour ouvrir la caméra et scanner le ticket gagnant du client.</p>
          <button onClick={startScan} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 active:scale-95 transition-all inline-flex items-center gap-2 shadow-lg shadow-blue-100">
            <ScanLine size={20} /> Démarrer le scan
          </button>
        </div>
      )}
    </div>
  )
}
