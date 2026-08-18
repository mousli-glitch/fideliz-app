import "server-only";
import { createClient } from "@supabase/supabase-js";
import { exigerRestaurantParSlug } from "@/lib/securite/garde-action";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  AUTORISER SUR L'OBJET, PAS SUR CE QUE LE CLIENT EN DIT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ─── Le piège que ce module existe pour fermer ───
 *
 * `updateGameAction(gameId, data)` reçoit DEUX identifiants du client : le
 * jeu à modifier, et le restaurant censé le porter. Une garde qui vérifie le
 * second ne protège pas le premier.
 *
 * L'attaque tient en une ligne : passer le `gameId` du voisin et son PROPRE
 * `restaurant_id`. La garde dit oui — c'est bien son restaurant — puis le code
 * met à jour le jeu de l'autre, et supprime ses lots.
 *
 * C'est le défaut de la garde écrite sur la branche de fusion, qui appelle
 * `exigerRestaurantParSlug(data?.restaurant_id, …)`. Elle a l'air juste. Elle
 * valide la mauvaise moitié.
 *
 * ─── La règle ───
 *
 * On ne demande jamais au client à qui appartient l'objet. On RÉSOUT l'objet
 * côté serveur, on lit son propriétaire réel, et on autorise sur celui-là.
 * L'identifiant rendu est le seul qui doit ensuite servir aux écritures.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccesObjet =
  | { ok: true; restaurantId: string; objetId: string }
  | { ok: false; error: string };

/**
 * Autorise l'appelant sur le restaurant qui porte RÉELLEMENT ce jeu.
 *
 * Le `restaurant_id` éventuellement transmis par le client n'est jamais lu :
 * il est résolu depuis le jeu lui-même.
 */
export async function autoriserParJeu(
  gameId: unknown,
  roles: readonly string[],
  action: string,
): Promise<AccesObjet> {
  if (typeof gameId !== "string" || !UUID.test(gameId)) {
    return { ok: false, error: "Jeu introuvable." };
  }

  const { data } = await admin()
    .from("games")
    .select("id, restaurant_id")
    .eq("id", gameId)
    .maybeSingle();

  const jeu = data as { id: string; restaurant_id: string } | null;

  /*
   * Même message qu'un refus d'autorisation : un « introuvable » distinct
   * dirait à un curieux quels identifiants existent.
   */
  if (!jeu) return { ok: false, error: "Jeu introuvable." };

  const garde = await exigerRestaurantParSlug(jeu.restaurant_id, roles, action);
  if (!garde.ok) return { ok: false, error: "Jeu introuvable." };

  return { ok: true, restaurantId: jeu.restaurant_id, objetId: jeu.id };
}
