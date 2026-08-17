"use server"

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/utils/supabase/server'
import { deciderValidationTicket } from '@/lib/securite/garde-admin'
import { journaliser } from '@/lib/securite/journal'

import { revalidatePath } from 'next/cache'

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LA VALIDATION RÉELLE — c'est ICI que passe la caisse
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Trois écrans appellent cette action, et aucun ne passe par l'API :
 *   · le scanner du comptoir      (app/admin/[slug]/scanner/page.tsx)
 *   · le bouton de /verify        (app/verify/[id]/verify-client.tsx)
 *   · le tableau des gagnants     (components/admin/winners-table.tsx)
 *
 * `PATCH /api/admin/winners`, durci le 17/08, n'a qu'un seul appelant —
 * un composant qui n'est monté nulle part. Sécuriser un endpoint mort ne
 * sécurise pas le produit : le chemin réellement exécuté est celui-ci.
 *
 * ─── CE QUI CHANGE LE 18/08/2026 ───
 *
 * 1. LA DÉCISION EST PARTAGÉE. Les mêmes règles étaient écrites deux fois,
 *    ici et dans la route. Deux copies dérivent toujours — l'une gagne un
 *    contrôle que l'autre n'a pas, et personne ne s'en aperçoit avant
 *    l'incident. `deciderValidationTicket` est désormais la seule autorité.
 *
 * 2. L'IDENTITÉ PASSE EN PREMIER. La branche « déjà utilisé » répondait
 *    AVANT toute vérification de session : un appelant sans compte pouvait
 *    apprendre qu'un UUID existait et quand il avait été consommé. Aucun
 *    parcours légitime n'en dépendait — les trois écrans sont authentifiés.
 *
 * 3. L'OPÉRATION EST JOURNALISÉE. Notamment le « Valider quand même » sur
 *    un ticket périmé : c'est un geste commercial voulu, et c'est
 *    exactement pour ça qu'il doit laisser une trace nominative.
 *
 * ─── CE QUI NE CHANGE PAS ───
 *
 * Les messages rendus aux trois écrans, au caractère près. Le ticket périmé
 * reste validable par un restaurateur autorisé, sur SON restaurant. Et
 * l'unicité reste garantie par l'écriture conditionnelle, pas par la
 * décision : deux caisses simultanées reçoivent toutes deux un feu vert, et
 * c'est Postgres qui n'en laisse passer qu'une.
 */

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function validateWinAction(winnerId: string) {
  try {
    // ═══ 1. QUI APPELLE ? — avant de lire quoi que ce soit ═══
    const supabaseAuth = await createAuthClient()
    const { data: userData } = await supabaseAuth.auth.getUser()
    const user = userData?.user ?? null

    const { data: profile } = user
      ? await supabaseAdmin
          .from("profiles")
          .select("id, role, restaurant_id, is_active")
          .eq("id", user.id)
          .single()
      : { data: null }

    const p = profile as { role?: string; restaurant_id?: string; is_active?: boolean } | null

    // ═══ 2. LE TICKET ET SON JEU — seulement pour une identité recevable ═══
    const identiteRecevable =
      !!user && !!p && p.is_active !== false && ['restaurant', 'root'].includes(p.role ?? '')

    type Ticket = {
      id: string
      status: string | null
      redeemed_at: string | null
      game_id: string | null
      created_at: string | null
      prizes: { label: string; color: string } | { label: string; color: string }[] | null
    }

    type Jeu = { id: string; restaurant_id: string | null; validity_days: number | null }

    let win: Ticket | null = null
    let game: Jeu | null = null

    if (identiteRecevable) {
      const { data } = await supabaseAdmin
        .from("winners")
        .select(`id, status, redeemed_at, game_id, created_at, prizes ( label, color )`)
        .eq("id", winnerId)
        .maybeSingle()
      win = (data as Ticket | null) ?? null

      if (win?.game_id) {
        const { data: g } = await supabaseAdmin
          .from("games")
          .select("id, restaurant_id, validity_days")
          .eq("id", win.game_id)
          .maybeSingle()
        game = (g as Jeu | null) ?? null
      }
    }

    const prizeData = Array.isArray(win?.prizes) ? win?.prizes[0] : win?.prizes

    // ═══ 3. LE VERDICT ═══
    const verdict = deciderValidationTicket({
      authentifie: !!user,
      profil: p,
      identifiantDemande: winnerId,
      ticket: win,
      jeu: game,
      maintenant: new Date(),
    })

    if (!verdict.ok) {
      if (user) {
        await journaliser(supabaseAdmin, {
          action: 'winner.validation_refus',
          accepte: false,
          message: `Validation refusée : ${verdict.motif}`,
          userId: user.id,
          userEmail: user.email,
          restaurantId: game?.restaurant_id ?? null,
          details: { motif: verdict.motif, ticket: winnerId, canal: 'action' },
        })
      }

      /* Les messages rendus aux trois écrans, inchangés au caractère près. */
      switch (verdict.motif) {
        case 'NON_AUTHENTIFIE':
          return { success: false, message: "⛔ Connexion au dashboard du restaurant requise." }
        case 'PROFIL_INTROUVABLE':
          return { success: false, message: "Impossible de charger le profil utilisateur." }
        case 'COMPTE_DESACTIVE':
          return { success: false, message: "⛔ Compte désactivé. Contactez l’administrateur." }
        case 'ROLE_NON_AUTORISE':
          return { success: false, message: "⛔ Accès refusé : connexion restaurant requise." }
        case 'TICKET_INTROUVABLE':
        case 'IDENTIFIANT_INVALIDE':
          return { success: false, message: "Ce QR Code est invalide ou introuvable." }
        case 'JEU_INTROUVABLE':
          return { success: false, message: "Erreur : jeu introuvable pour ce ticket." }
        case 'AUTRE_RESTAURANT':
          return {
            success: false,
            message: "⛔ Accès refusé : ce ticket ne correspond pas à votre restaurant.",
          }
        case 'DEJA_CONSOMME': {
          const dateUtilisation = win?.redeemed_at
            ? new Date(win.redeemed_at).toLocaleString('fr-FR')
            : "une date inconnue"
          return {
            success: false,
            alreadyUsed: true,
            message: `❌ DÉJÀ UTILISÉ le ${dateUtilisation}`,
            prize: prizeData,
          }
        }
        default:
          return {
            success: false,
            message: "⛔ Aucune ligne validée (déjà utilisé, ID invalide, ou état du ticket incompatible).",
          }
      }
    }

    // ═══ 4. L'ÉCRITURE, conditionnelle — c'est elle qui garantit l'unicité ═══
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("winners")
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq("id", winnerId)
      .eq("status", "available")
      .select("id,status,redeemed_at")

    if (updateError) {
      console.error("❌ Erreur lors de la validation :", updateError)
      return { success: false, message: "Erreur technique lors de la validation." }
    }

    if (!updated || updated.length === 0) {
      /* Deux caisses ont scanné le même ticket en même temps. Les deux ont
         reçu un feu vert ; celle-ci a perdu la course. */
      await journaliser(supabaseAdmin, {
        action: 'winner.validation_refus',
        accepte: false,
        message: 'Validation refusée : COURSE_PERDUE',
        userId: user!.id,
        userEmail: user!.email,
        restaurantId: game?.restaurant_id ?? null,
        details: { motif: 'COURSE_PERDUE', ticket: winnerId, canal: 'action' },
      })
      return {
        success: false,
        message: "⛔ Aucune ligne validée (déjà utilisé, ID invalide, ou état du ticket incompatible).",
      }
    }

    await journaliser(supabaseAdmin, {
      action: 'winner.validation',
      accepte: true,
      message: verdict.perime ? 'Ticket périmé validé quand même' : 'Ticket validé en caisse',
      userId: user!.id,
      userEmail: user!.email,
      restaurantId: game?.restaurant_id ?? null,
      details: { ticket: winnerId, perime: !!verdict.perime, canal: 'action', lot: prizeData?.label ?? null },
    })

    revalidatePath("/", "layout")

    return {
      success: true,
      message: "✅ GAIN VALIDÉ !",
      prizeLabel: prizeData?.label || "Lot mystère",
      prizeColor: prizeData?.color,
    }
  } catch (error: unknown) {
    console.error("🚨 Erreur critique validateWinAction:", error)
    return { success: false, message: "Erreur serveur critique." }
  }
}
