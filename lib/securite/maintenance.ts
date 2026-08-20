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
 * `public.maintenance` est fermée à TOUS les rôles applicatifs — `anon`,
 * `authenticated` et `service_role` — depuis la correction du 19/08/2026 :
 * la clé de service pouvait sinon lever le gel elle-même. RLS activée, aucune
 * policy de lecture. La RPC ne rend qu'un booléen et un message.
 *
 * (Ce commentaire mentionnait « l'empreinte du jeton migrateur ». Ce jeton a
 * été retiré le 19/08 — ce dépôt ne gouverne que la SOURCE, où le migrateur
 * n'écrit jamais, donc où aucun laissez-passer n'a de raison d'exister.)
 */
export const RPC_ETAT = "en_maintenance";

/** Code SQLSTATE levé par `refuser_pendant_maintenance()`. */
export const CODE_MAINTENANCE = "P0100";

/**
 * Le code que les Server Actions rendent à l'interface.
 *
 * Les branches d'erreur du client comparent des chaînes (`already_played`,
 * `stock_empty`, …) et retombent sur un cas générique quand rien ne
 * correspond. Sans une valeur À ELLES dans ce vocabulaire, le gel tombait
 * dans ce générique — mesuré sur banc le 20/08/2026 : la roue disait
 * « réessayez » pendant toute la fenêtre de bascule, et l'inscription rendait
 * un écran TICKET portant le code « ERREUR-CONTACT-STAFF ». Un faux ticket,
 * que l'employé n'aurait rien pu scanner.
 */
export const ERREUR_MAINTENANCE = "maintenance";

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
