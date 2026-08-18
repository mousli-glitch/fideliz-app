"use server"

import { createClient } from "@supabase/supabase-js"
import { exigerRole } from "@/lib/securite/garde-action"

const NIVEAUX = ["info", "warning", "error"] as const
type Niveau = (typeof NIVEAUX)[number]

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  JOURNAL SYSTÈME — écrire, sans pouvoir écrire n'importe quoi
 *
 *  Sans garde, cette action est une primitive d'écriture anonyme : n'importe
 *  qui remplit `system_logs` du texte de son choix. Une session ne suffit
 *  pourtant pas : un restaurateur authentifié pouvait encore déposer une
 *  ligne sous le slug d'un confrère — un journal falsifiable ne vaut rien le
 *  jour où on le relit pour comprendre un incident.
 *
 *  Trois décisions :
 *    — le tenant n'est pas déclaré, il est déduit ; seul root peut viser un
 *      autre restaurant que le sien ;
 *    — l'acteur réel est enregistré à côté du message, donc une ligne est
 *      toujours attribuable ;
 *    — le niveau est contraint et les tailles bornées.
 *
 *  Appelants vivants : les écrans root de gestion des commerciaux (sans slug)
 *  et `delete-winner.ts`, qui autorise déjà son slug par
 *  `exigerRestaurantParSlug` avant d'arriver ici. Aucun des deux ne change de
 *  comportement.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function logSystemError(params: {
  message: string,
  level?: Niveau,
  restaurant_slug?: string,
  details?: any
}) {
  const garde = await exigerRole(["root", "restaurant", "sales"], "journal.ecriture")
  if (!garde.ok) return

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { userId, role, restaurantId } = garde.appelant

  /* Le slug demandé n'est retenu que pour root ; sinon on repart du
   * rattachement réel de la session, quoi qu'ait envoyé l'appelant. */
  let slug: string | null = null
  if (role === "root") {
    slug = typeof params.restaurant_slug === "string" ? params.restaurant_slug.slice(0, 120) : null
  } else if (restaurantId) {
    const { data } = await supabase
      .from("restaurants").select("slug").eq("id", restaurantId).maybeSingle()
    slug = (data as { slug: string } | null)?.slug ?? null
  }

  const niveau: Niveau = NIVEAUX.includes(params.level as Niveau) ? params.level as Niveau : "error"

  /* `details` vient de l'appelant : on le borne avant de le stocker, sinon un
   * seul appel peut gonfler la table autant qu'il veut. */
  let details: unknown = null
  try {
    const brut = JSON.stringify(params.details ?? null)
    details = brut && brut.length <= 4000 ? JSON.parse(brut) : { tronque: true, taille: brut?.length ?? 0 }
  } catch {
    details = { illisible: true }
  }

  await supabase.from('system_logs').insert([{
    message: String(params.message ?? '').slice(0, 2000),
    level: niveau,
    restaurant_slug: slug,
    details: { ...(details && typeof details === "object" ? details : { valeur: details }),
               acteur: { userId, role } },
  }])
}
