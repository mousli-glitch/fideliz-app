/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUI PEUT ÉTEINDRE UN QR IMPRIMÉ — ET CE QUI NE LE PEUT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Décision P-11 de Samy, 19/08/2026 :
 *
 *   « Une échéance d'abonnement dépassée coupe le DASHBOARD.
 *     Jamais /m, /c, /verify ni /scan. »
 *
 * ─── CE QUE CETTE RÈGLE CORRIGE ───
 *
 * `/scan/<slug>` coupait sur `subscription_end`, et rendait « Service
 * momentanément indisponible ». Ce chemin est celui des QR **imprimés** de
 * la-ruche, best-pizza et soukara : un impayé éteignait un carton posé sur
 * les tables, sans que personne ne touche à quoi que ce soit.
 *
 * Mesuré le 19/08/2026 : 3 restaurants sur 4 ont une échéance fixée, **aucune
 * n'est dépassée**. Le défaut n'a donc jamais tiré — il attendait la première
 * facture impayée.
 *
 * ─── CE QUI COUPE ENCORE, ET POURQUOI ───
 *
 * `is_blocked` reste. C'est un geste d'administration délibéré — fraude,
 * commerce fermé — et c'est le seul levier d'arrêt immédiat. P-11 parle de
 * l'ÉCHÉANCE ; retirer aussi le blocage priverait Samy de son unique bouton
 * d'urgence sur un QR imprimé, ce qui ne se déduit pas d'une décision qui n'en
 * parle pas.
 *
 * ⚠️ À confirmer avec Samy : lire P-11 au pied de la lettre — « jamais /scan »
 * — supprimerait aussi ce levier.
 *
 * ─── POURQUOI CE MODULE EST FAIL-OPEN, À L'ENVERS DE L'HABITUDE ───
 *
 * Partout ailleurs dans ce dépôt, l'absence d'information ferme. Ici elle
 * OUVRE : une donnée manquante ne doit jamais éteindre un support papier déjà
 * distribué. Le pire d'un fail-open ici est qu'un jeu tourne un jour de trop ;
 * le pire d'un fail-closed est un QR mort chez un client qui a payé.
 */

export type EtatRestaurant = {
  is_blocked?: boolean | null;
  subscription_end?: string | null;
};

/**
 * Le parcours joueur servi par un QR imprimé doit-il être coupé ?
 *
 * `subscription_end` n'entre PAS dans cette décision — c'est tout l'objet de
 * P-11. Le paramètre reste dans le type pour que sa présence dans les données
 * ne donne à personne l'idée de le rebrancher ici sans lire ce qui précède.
 */
export function doitCouperLeParcoursImprime(resto: EtatRestaurant | null | undefined): boolean {
  return resto?.is_blocked === true;
}
