import { createClient } from "@supabase/supabase-js"
import { createClient as createAuthClient } from "@/utils/supabase/server"
import { Card } from "@/components/ui/card"
import { XCircle } from "lucide-react"
import VerifyClient from "./verify-client"

export const dynamic = "force-dynamic"

export default async function VerifyPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ===== STAFF DETECTION =====
  const supabaseAuth = await createAuthClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()

  let isStaff = false

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile) {
      // ✅ AJOUT restaurant
      const authorizedRoles = ['admin','owner','staff','root','restaurant']

      /*
       * L'autorisation vient du RÔLE, jamais d'un identifiant privilégié.
       *
       * Une clause `|| user.id === '<uuid root>'` figurait ici. Mesuré avant
       * retrait : ce compte porte déjà `role = 'root'`, et `'root'` est déjà
       * dans `authorizedRoles`. Elle n'ouvrait donc aucun accès supplémentaire
       * — elle offrait seulement un second chemin, hors du système de rôles,
       * qu'il aurait fallu penser à surveiller.
       */
      if (authorizedRoles.includes(profile.role)) {
        isStaff = true
      }
    }
  }

  // ===== WINNER =====
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

  const validityDays = winner.games?.validity_days || 30
  let isExpired = false
  let expirationDateString = ""

  if (validityDays > 0) {
    const createdDate = new Date(winner.created_at)
    const expirationDate = new Date(createdDate.getTime() + validityDays * 86400000)
    if (new Date() > expirationDate) isExpired = true
    expirationDateString = expirationDate.toLocaleDateString('fr-FR')
  }

  let redeemedDateString = ""
  if (winner.redeemed_at) {
    redeemedDateString = new Date(winner.redeemed_at).toLocaleString('fr-FR')
  }

  const prizeData = Array.isArray(winner.prizes) ? winner.prizes[0] : winner.prizes
  const prizeLabel = prizeData?.label || "Lot Surprise"

  /*
   * Le prénom, réduit pour qui n'est pas identifié.
   *
   * Cette page est ouverte à quiconque possède l'UUID du ticket — et cet
   * UUID est imprimé dans le QR que le client montre, photographie, envoie.
   * Il finit dans des captures d'écran et des historiques de navigation.
   * Y attacher un prénom en clair est une donnée personnelle de plus qui
   * voyage avec, sans que personne en ait besoin.
   *
   * Le personnel authentifié voit le prénom entier : c'est lui qui doit
   * reconnaître le client au comptoir. L'anonyme n'en voit que l'initiale,
   * ce qui suffit largement au porteur pour reconnaître SON ticket.
   *
   * Rien d'autre ne bouge : même URL, même UUID, même statut affiché. Les
   * tickets déjà imprimés continuent d'ouvrir exactement la même page.
   */
  const prenom = (winner.first_name ?? "").toString().trim()
  const prenomAffiche = !prenom
    ? "—"
    : isStaff
      ? prenom
      : `${prenom[0].toUpperCase()}.`

  const minSpendRaw = winner.games?.min_spend
  const minSpend = minSpendRaw ? parseFloat(minSpendRaw.toString()) : 0

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 shadow-2xl bg-white border-t-8 border-blue-600">

        <div className="text-center mb-8">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
            Vérification Staff
          </p>
          <h1 className="text-3xl font-black mt-2 text-slate-800">{prizeLabel}</h1>
          <p className="text-slate-600 font-medium mt-1">
            Gagnant : {prenomAffiche}
          </p>
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
