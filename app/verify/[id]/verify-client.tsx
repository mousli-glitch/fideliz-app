"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, AlertTriangle, Clock, PartyPopper, Loader2 } from "lucide-react"
import Link from "next/link"
import { validateWinAction } from "@/app/actions/validate-win"

interface VerifyClientProps {
  winnerId: string
  initialStatus: string
  initialRedeemedDate: string // C'est maintenant une string, plus de calcul !
  prizeLabel: string
  isExpired: boolean
  expirationDateString: string
  minSpend: number
}

export default function VerifyClient({ 
  winnerId,
  initialStatus,
  initialRedeemedDate,
  isExpired, 
  expirationDateString, 
  minSpend 
}: VerifyClientProps) {

  const [isLoading, setIsLoading] = useState(false)
  
  // On initialise le statut en fonction de ce qui vient de la base
  const [status, setStatus] = useState<'initial' | 'success' | 'already_used' | 'error'>(
    initialStatus === 'redeemed' ? 'already_used' : 'initial'
  )
  
  // Pour stocker le message d'erreur dynamique si on scanne en direct
  const [errorMessage, setErrorMessage] = useState<string>("")

  const handleValidate = async () => {
    setIsLoading(true)
    const result = await validateWinAction(winnerId)
    setIsLoading(false)

    if (result.success) {
      setStatus('success')
    } else if (result.alreadyUsed) {
      setStatus('already_used')
      // Si l'action renvoie un message précis (ex: "Déjà utilisé le..."), on l'utilise
      if (result.message) setErrorMessage(result.message)
    } else {
      setStatus('error')
    }
  }

  // --- 1. SUCCÈS ---
  if (status === 'success') {
    return (
      <div className="text-center py-8 animate-in zoom-in duration-300">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
          <PartyPopper className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-black text-green-700 mb-2">BON VALIDÉ ! 🎉</h2>
        <p className="text-slate-500">Le cadeau a été remis au client.</p>
        <Link href="/admin">
          <Button className="mt-8 w-full bg-slate-900 text-white">Retour au Dashboard</Button>
        </Link>
      </div>
    )
  }

  // --- 2. DÉJÀ UTILISÉ ---
  if (status === 'already_used') {
    // Si on a un message d'erreur qui vient du clic (errorMessage), on l'affiche.
    // Sinon, on affiche la date formatée par le serveur (initialRedeemedDate).
    const displayMessage = errorMessage 
        ? errorMessage 
        : `Validé le ${initialRedeemedDate || "date inconnue"}`

    return (
      <div className="bg-red-50 p-6 rounded-xl text-center border-2 border-red-100 animate-in shake">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-red-700">DÉJÀ UTILISÉ !</h2>
        <p className="text-red-600 text-sm mt-1">
            {displayMessage}
        </p>
        <Link href="/admin" className="block mt-6">
            <Button variant="outline" className="w-full">Retour Dashboard</Button>
        </Link>
      </div>
    )
  }

  // --- 3. EXPIRÉ ---
  if (isExpired) {
    return (
      <div className="bg-orange-50 p-6 rounded-xl text-center border-2 border-orange-100">
        <Clock className="w-12 h-12 text-orange-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-orange-700">DÉLAI DÉPASSÉ ⏳</h2>
        <p className="text-orange-800 text-sm mt-1">
           Valable jusqu'au <strong>{expirationDateString}</strong>.
        </p>
        <Link href="/admin" className="block mt-6">
            <Button variant="outline" className="w-full border-orange-200 text-orange-700">Retour</Button>
        </Link>
      </div>
    )
  }

  // --- 4. PRÊT À VALIDER ---
  return (
    <div>
        {minSpend > 0 && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-lg shadow-sm">
            <div className="flex items-center mb-1">
              <AlertTriangle className="text-amber-600 w-5 h-5 mr-2" />
              <span className="font-bold text-amber-800 uppercase text-sm">Condition Requise</span>
            </div>
            <p className="text-amber-900 text-sm pl-7">
              Minimum d'achat : <strong className="text-lg text-amber-950">{minSpend}€</strong>
            </p>
          </div>
        )}
        
        <div className="text-center text-xs text-slate-400 mb-6 flex items-center justify-center gap-1">
            <Clock size={12}/>
            {expirationDateString 
                ? `Valable jusqu'au ${expirationDateString}` 
                : "Durée illimitée"}
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-4 ring-4 ring-blue-50/50">
            <CheckCircle className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Prêt à valider ✅</h2>
          <p className="text-slate-500 text-sm">Vérifiez les conditions ci-dessus.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <Link href="/admin" className="w-full">
                <Button variant="outline" className="w-full py-6 text-slate-600 font-bold">
                    REFUSER
                </Button>
            </Link>

            <Button 
                onClick={handleValidate} 
                disabled={isLoading}
                className="w-full py-6 text-white bg-green-600 hover:bg-green-700 font-bold shadow-lg shadow-green-200 transition-all active:scale-95"
            >
                {isLoading ? <Loader2 className="animate-spin mr-2" /> : "VALIDER LE DON"}
            </Button>
        </div>
    </div>
  )
}