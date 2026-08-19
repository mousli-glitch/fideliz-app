"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient as createAuthClient } from "@/utils/supabase/server"
import { formaterEuros, libelleMinimum, lireMinimum } from "@/lib/monetaire"

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lecture seule : récupère les infos d'un gain pour que le staff CONFIRME avant de valider.
// Ne modifie RIEN. Vérifie la session + l'étanchéité par restaurant.
export async function getWinnerInfoAction(winnerId: string) {
  try {
    const { data: win, error } = await supabaseAdmin
      .from("winners")
      .select("id, status, redeemed_at, expires_at, first_name, created_at, prize_label_snapshot, min_spend_cents_snapshot, game_id, prizes ( label, color )")
      .eq("id", winnerId)
      .single()

    if (error || !win) return { success: false, message: "QR code invalide ou introuvable." }

    // Session staff requise
    const supabaseAuth = await createAuthClient()
    const { data: userData } = await supabaseAuth.auth.getUser()
    if (!userData?.user) return { success: false, message: "Connexion requise." }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, restaurant_id, is_active")
      .eq("id", userData.user.id)
      .single()

    if (!profile || profile.is_active === false) return { success: false, message: "Compte non autorisé." }
    if (!["restaurant", "root"].includes(profile.role)) return { success: false, message: "Accès refusé." }

    // Étanchéité : le ticket doit appartenir au restaurant du staff (sauf root)
    const { data: game } = await supabaseAdmin
      .from("games")
      .select("restaurant_id, min_spend, min_spend_cents")
      .eq("id", (win as any).game_id)
      .single()

    if (profile.role !== "root" && (!profile.restaurant_id || profile.restaurant_id !== (game as any)?.restaurant_id)) {
      return { success: false, message: "Ce ticket ne correspond pas à votre restaurant." }
    }

    const prize = Array.isArray((win as any).prizes) ? (win as any).prizes[0] : (win as any).prizes
    const expired = (win as any).expires_at ? new Date((win as any).expires_at) < new Date() : false

    /*
     * ═══════════════════════════════════════════════════════════════════════
     *  LE MINIMUM, LU COMME PARTOUT AILLEURS
     * ═══════════════════════════════════════════════════════════════════════
     *
     * Ici se trouvait `/^[0-9]+$/ … : 0`. Un jeu réglé à 5,90 € ne satisfait
     * pas cette expression : le scanner affichait donc « Minimum de commande :
     * Aucun » au restaurateur au moment exact où il devait le vérifier, alors
     * que le client avait bien lu la condition sur la roue.
     *
     * La lecture passe désormais par l'ordre canonique — snapshot du ticket,
     * champ en centimes du jeu, puis texte historique lu strictement — le même
     * que celui de `play_game`, `register_win` et de la page de vérification.
     *
     * Le snapshot en premier : il porte la condition telle qu'elle était AU
     * MOMENT DU GAIN. Modifier le jeu ensuite ne change plus ce qu'on exige
     * d'un client dont le ticket est déjà imprimé.
     */
    const minimum = lireMinimum(
      (win as any).min_spend_cents_snapshot,
      (game as any)?.min_spend_cents,
      (game as any)?.min_spend
    )

    return {
      success: true,
      winnerId: (win as any).id,
      firstName: (win as any).first_name || "Client",
      prizeLabel: (win as any).prize_label_snapshot || prize?.label || "Lot",
      status: (win as any).status as string,
      redeemedAt: (win as any).redeemed_at as string | null,
      expiresAt: (win as any).expires_at as string | null,
      wonAt: (win as any).created_at as string | null,
      expired,
      /*
       * Trois champs plutôt qu'un, parce que l'écran doit distinguer trois
       * situations : un montant, aucune condition, et « la valeur est
       * illisible » — qui ne doit surtout pas s'afficher « Aucun ».
       */
      minimumEtat: minimum.etat,
      minSpendCents: minimum.centimes,
      minSpendLibelle: libelleMinimum(minimum),
      /*
       * Conservé pour compatibilité, dans la MÊME unité qu'avant : des euros.
       * Il cesse simplement d'être faux — 5,90 € valait 0, il vaut 5,9.
       */
      minSpend: minimum.centimes == null ? 0 : minimum.centimes / 100,
      minSpendAffichage: formaterEuros(minimum.centimes),
    }
  } catch {
    return { success: false, message: "Erreur lors de la lecture du ticket." }
  }
}
