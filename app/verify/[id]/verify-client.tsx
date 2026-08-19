"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
// AJOUT : Import de l'icône Lock
import { CheckCircle, XCircle, AlertTriangle, Clock, PartyPopper, Loader2, Lock } from "lucide-react"
import Link from "next/link"
import { validateWinAction } from "@/app/actions/validate-win"

interface VerifyClientProps {
  winnerId: string
  initialStatus: string
  initialRedeemedDate: string 
  prizeLabel: string
  isExpired: boolean
  expirationDateString: string
  /*
   * Le montant arrive DÉJÀ formaté, et son état arrive à part.
   *
   * Auparavant cette page recevait un nombre et écrivait `{minSpend}€`. Deux
   * défauts en une ligne : « 5.9€ » au lieu de « 5,90 € », et surtout la
   * condition qui disparaissait quand le nombre valait 0 — y compris lorsque
   * ce 0 venait d'un `parseFloat` qui n'avait pas su lire.
   */
  minimumEtat: 'aucun' | 'montant' | 'illisible'
  minSpendAffichage: string | null
  // AJOUT : Nouvelle prop
  isStaff: boolean
}

export default function VerifyClient({ 
  winnerId,
  initialStatus,
  initialRedeemedDate,
  isExpired,
  expirationDateString,
  minimumEtat,
  minSpendAffichage,
  // AJOUT : Récupération de la prop
  isStaff
}: VerifyClientProps) {

  const [isLoading, setIsLoading] = useState(false)
  
  // VOTRE ETAT EXISTANT (INCHANGÉ)
  const [status, setStatus] = useState<'initial' | 'success' | 'already_used' | 'error'>(
    initialStatus === 'redeemed' ? 'already_used' : 'initial'
  )
  
  const [errorMessage, setErrorMessage] = useState<string>("")

  const handleValidate = async () => {
    // SÉCURITÉ EXTRA : On empêche l'action si pas staff
    if (!isStaff) return;

    setIsLoading(true)
    const result = await validateWinAction(winnerId)
    setIsLoading(false)

    if (result.success) {
      setStatus('success')
    } else if (result.alreadyUsed) {
      setStatus('already_used')
      if (result.message) setErrorMessage(result.message)
    } else {
      setStatus('error')
      // Si on a un message précis (ex: Accès refusé), on l'affiche
      if (result.message) setErrorMessage(result.message)
    }
  }

  // --- 1. SUCCÈS (Code INCHANGÉ) ---
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

  // --- 2. DÉJÀ UTILISÉ (Code INCHANGÉ) ---
  if (status === 'already_used') {
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

  // --- 3. EXPIRÉ (Code INCHANGÉ) ---
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
  
  // --- 3. BIS : ERREUR (Si le RLS bloque) ---
  if (status === 'error') {
     return (
      <div className="bg-red-50 p-6 rounded-xl text-center border-2 border-red-100">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-red-700">ERREUR</h2>
        <p className="text-red-600 text-sm mt-1">{errorMessage || "Une erreur est survenue."}</p>
        <Button onClick={() => setStatus('initial')} variant="outline" className="mt-4">Réessayer</Button>
      </div>
    )
  }

  // --- 4. AFFICHAGE PRINCIPAL ---
  return (
    <div>
        {/* VOS CONDITIONS D'AFFICHAGE (Code INCHANGÉ) */}
        {minimumEtat === 'montant' && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-lg shadow-sm">
            <div className="flex items-center mb-1">
              <AlertTriangle className="text-amber-600 w-5 h-5 mr-2" />
              <span className="font-bold text-amber-800 uppercase text-sm">Condition Requise</span>
            </div>
            <p className="text-amber-900 text-sm pl-7">
              Minimum d&apos;achat : <strong className="text-lg text-amber-950">{minSpendAffichage}</strong>
            </p>
          </div>
        )}

        {/* Une condition existe, mais elle est illisible : le dire, plutôt que
            de laisser croire qu'il n'y en a pas. */}
        {minimumEtat === 'illisible' && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-r-lg shadow-sm">
            <div className="flex items-center mb-1">
              <AlertTriangle className="text-red-600 w-5 h-5 mr-2" />
              <span className="font-bold text-red-800 uppercase text-sm">Condition à vérifier</span>
            </div>
            <p className="text-red-900 text-sm pl-7">
              Le minimum d&apos;achat de ce jeu est illisible. Vérifiez la fiche du jeu
              avant de valider.
            </p>
          </div>
        )}
        
        <div className="text-center text-xs text-slate-400 mb-6 flex items-center justify-center gap-1">
            <Clock size={12}/>
            {expirationDateString 
                ? `Valable jusqu'au ${expirationDateString}` 
                : "Durée illimitée"}
        </div>

        {/* ==================================================================== */}
        {/* LOGIQUE D'AFFICHAGE CONDITIONNEL (C'est ici qu'on sécurise l'UI)     */}
        {/* ==================================================================== */}
        
        {!isStaff ? (
            // CAS 1 : C'est un client (ou pas connecté) => On affiche le cadenas
            <div className="bg-slate-100 border-2 border-slate-200 p-6 rounded-xl text-center animate-in fade-in">
                <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-slate-700">Validation Réservée</h3>
                <p className="text-sm text-slate-500 mt-1">
                Veuillez présenter ce code à un membre du personnel pour récupérer votre gain.
                </p>
            </div>
        ) : (
            // CAS 2 : C'est le Staff => On affiche VOS boutons habituels
            <>
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
            </>
        )}
    </div>
  )
}