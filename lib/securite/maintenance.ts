/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LE GEL, VU DE L'APPLICATION
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Le gel est imposé par des triggers en base : aucun chemin applicatif ne
 * les contourne, et c'est voulu. Ce module ne le fait donc PAS respecter —
 * il le traduit.
 *
 * Sans lui, un client qui joue pendant la fenêtre de bascule verrait
 * « Erreur serveur critique ». Avec lui, il lit qu'on revient dans quelques
 * minutes. La différence ne change rien à la sécurité et tout à ce qu'on
 * laisse d'une plateforme un dimanche matin à 6 h.
 *
 * On ne demande jamais « sommes-nous en maintenance ? » AVANT d'écrire :
 * entre la question et l'écriture, l'état peut changer, et cette fenêtre-là
 * est précisément ce qu'on cherche à fermer. On écrit, et on lit l'erreur.
 */

/**
 * L'état public se lit par la RPC `en_maintenance()`, jamais par la table.
 *
 * `public.maintenance` porte l'empreinte du jeton migrateur : elle est fermée
 * à `anon` comme à `authenticated`, RLS activée sans aucune policy de
 * lecture. La RPC ne rend qu'un booléen et un message.
 */
export const RPC_ETAT = "en_maintenance";

/** Code SQLSTATE levé par `refuser_pendant_maintenance()`. */
export const CODE_MAINTENANCE = "P0100";

export type ErreurPossible = { code?: string; message?: string; hint?: string } | null | undefined;

/** Cette erreur vient-elle du gel de bascule, et non d'un vrai incident ? */
export function estGelDeBascule(erreur: ErreurPossible): boolean {
  if (!erreur) return false;
  return erreur.code === CODE_MAINTENANCE || erreur.hint === "bascule_en_cours";
}

/**
 * Le message à montrer. Celui de la base d'abord — il est modifiable pendant
 * la bascule sans redéployer, ce qui compte quand une fenêtre de deux heures
 * se prolonge et qu'il faut le dire.
 */
export function messageMaintenance(erreur: ErreurPossible): string {
  const m = erreur?.message?.trim();
  return m && m.length > 0 && !/^permission denied/i.test(m)
    ? m
    : "Service momentanément suspendu pour une mise à jour. Merci de réessayer dans quelques minutes.";
}

/**
 * Enveloppe une écriture : si le gel la refuse, rend une réponse propre au
 * lieu d'une erreur technique. Toute autre erreur remonte telle quelle — on
 * ne veut pas qu'un vrai incident se déguise en maintenance.
 */
export async function siGelee<T>(
  ecriture: () => Promise<T>
): Promise<{ gelee: true; message: string } | { gelee: false; resultat: T }> {
  try {
    return { gelee: false, resultat: await ecriture() };
  } catch (e) {
    const err = e as ErreurPossible;
    if (estGelDeBascule(err)) return { gelee: true, message: messageMaintenance(err) };
    throw e;
  }
}
