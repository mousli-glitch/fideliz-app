import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Journal des actions sensibles.
 *
 * Une création de compte et une consommation de ticket sont des actes qu'on
 * doit pouvoir reconstituer après coup : qui, quand, sur quel restaurant, et
 * accepté ou refusé. Les refus comptent autant que les succès — une rafale de
 * 403 sur des tickets d'un autre restaurant est précisément ce qu'on veut
 * pouvoir retrouver.
 *
 * Le journal ne bloque jamais l'action. Si l'écriture échoue, la route
 * continue : perdre une ligne de journal est ennuyeux, refuser une validation
 * en caisse parce que le journal est indisponible ne l'est pas — c'est un
 * client qui repart sans son cadeau.
 */
export async function journaliser(
  admin: SupabaseClient,
  entree: {
    action: string;
    accepte: boolean;
    message: string;
    userId?: string | null;
    userEmail?: string | null;
    restaurantId?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await admin.from("system_logs").insert({
      level: entree.accepte ? "info" : "warn",
      action_type: entree.action,
      message: entree.message,
      user_id: entree.userId ?? null,
      user_email: entree.userEmail ?? null,
      restaurant_id: entree.restaurantId ?? null,
      details: entree.details ?? {},
      metadata: { accepte: entree.accepte, source: "api" },
    });
  } catch {
    /* Volontairement muet : voir l'en-tête. */
  }
}
