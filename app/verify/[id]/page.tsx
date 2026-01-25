import { createClient } from "@supabase/supabase-js"
// AJOUT : Import du client pour vérifier l'identité (Session)
import { createClient as createAuthClient } from "@/utils/supabase/server"
import { Card } from "@/components/ui/card"
import { XCircle } from "lucide-react"
import VerifyClient from "./verify-client" 

// Force le rendu dynamique pour avoir les données fraîches à chaque scan
export const dynamic = "force-dynamic"

export default async function VerifyPage({ 
  params 
}: { 
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // 1. CLIENT ADMIN (Inchangé) : Pour lire les données du gain sans restriction
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // =========================================================================
  // 2. AJOUT SÉCURITÉ : DÉTECTION DU STAFF
  // On crée un client Auth pour vérifier qui regarde la page
  // =========================================================================
  const supabaseAuth = await createAuthClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()

  let isStaff = false

  if (user) {
    // Si un user est connecté, on vérifie son rôle via le client Admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    // MODIFICATION CHIRURGICALE : Inclusion de staff, root et ton UID personnel
    if (profile) {
      const authorizedRoles = ['admin', 'owner', 'staff', 'root'];
      if (authorizedRoles.includes(profile.role) || user.id === '04eb7091-6876-41e0-84c6-5891658a5768') {
        isStaff = true
      }
    }
  }
  // =========================================================================

  // 3. RÉCUPÉRATION DES DONNÉES (Code INCHANGÉ)
  const { data: winner, error } = await supabase
    .from('winners')
    .select(`
      *,
      prizes ( label, color ), 
      games ( min_spend, validity_days )
    `)
    .eq('id', id)
    .single()

  if (error || !winner) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="p-8 text-center bg-white shadow-xl border-t-4 border-red-500">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800">QR Code Inconnu</h1>
        </Card>
      </div>
    )
  }

  // 4. CALCULS SERVEUR (Code INCHANGÉ)
  const validityDays = winner.games?.validity_days || 30
  let isExpired = false
  let expirationDateString = ""

  if (validityDays > 0) {
    const createdDate = new Date(winner.created_at)
    const expirationDate = new Date(createdDate.getTime() + validityDays * 24 * 60 * 60 * 1000)
    const now = new Date()
    if (now > expirationDate) isExpired = true
    
    expirationDateString = expirationDate.toLocaleDateString('fr-FR')
  }

  let redeemedDateString = ""
  if (winner.redeemed_at) {
    redeemedDateString = new Date(winner.redeemed_at).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const prizeData = Array.isArray(winner.prizes) ? winner.prizes[0] : winner.prizes
  const prizeLabel = prizeData?.label || "Lot Surprise"
  
  const minSpendRaw = winner.games?.min_spend 
  const minSpend = minSpendRaw ? parseFloat(minSpendRaw.toString()) : 0

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 shadow-2xl bg-white border-t-8 border-blue-600 relative overflow-hidden">
        
        <div className="text-center mb-8 relative z-10">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Vérification Staff</p>
          <h1 className="text-3xl font-black mt-2 text-slate-800">{prizeLabel}</h1>
          <p className="text-slate-600 font-medium mt-1">Gagnant : {winner.first_name}</p>
        </div>

        <VerifyClient 
            winnerId={winner.id}
            initialStatus={winner.status}
            initialRedeemedDate={redeemedDateString} 
            prizeLabel={prizeLabel}
            isExpired={isExpired}
            expirationDateString={expirationDateString}
            minSpend={minSpend}
            isStaff={isStaff} 
        />

      </Card>
    </div>
  )
}