"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient as createAuthClient } from "@/utils/supabase/server"

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
      .select("id, status, redeemed_at, expires_at, first_name, created_at, prize_label_snapshot, game_id, prizes ( label, color )")
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
      .select("restaurant_id, min_spend")
      .eq("id", (win as any).game_id)
      .single()

    if (profile.role !== "root" && (!profile.restaurant_id || profile.restaurant_id !== (game as any)?.restaurant_id)) {
      return { success: false, message: "Ce ticket ne correspond pas à votre restaurant." }
    }

    const prize = Array.isArray((win as any).prizes) ? (win as any).prizes[0] : (win as any).prizes
    const expired = (win as any).expires_at ? new Date((win as any).expires_at) < new Date() : false

    const rawMin = (game as any)?.min_spend
    const minSpend = rawMin && /^[0-9]+$/.test(String(rawMin)) ? parseInt(String(rawMin)) : 0

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
      minSpend,
    }
  } catch {
    return { success: false, message: "Erreur lors de la lecture du ticket." }
  }
}
