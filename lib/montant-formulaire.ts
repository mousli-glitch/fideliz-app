/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QU'IL FAUT ÉCRIRE QUAND LE GÉRANT ENREGISTRE SA FICHE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux formulaires écrivent le minimum d'achat — création et édition — et la
 * règle vivait dans UN SEUL des deux, du côté de la page :
 *
 *   création : `min_spend: has_min_spend ? min_spend : 0` au moment de l'appel
 *   édition  : `form` envoyé tel quel, et l'action ignorait `has_min_spend`
 *
 * Conséquence, mesurée sur le code en production : éteindre l'interrupteur
 * « Minimum de commande » sur une fiche existante masquait le champ à l'écran
 * et LAISSAIT LE MONTANT EN BASE. Le restaurateur croyait avoir retiré la
 * condition ; son client se la voyait encore opposée en caisse.
 *
 * C'est le même écart que le défaut monétaire du lot 3 — l'écran dit une chose,
 * la base en applique une autre — simplement dans l'autre sens.
 *
 * La règle vit désormais ici, une fois, du côté qui écrit.
 *
 * ─── POURQUOI CE MODULE N'EST PAS UN FICHIER « use server » ───
 *
 * Dans un fichier `"use server"`, TOUT export devient un point d'entrée
 * d'action, joignable depuis le navigateur. Une règle partagée entre deux
 * actions n'a rien à faire dans l'une d'elles : elle y créerait un endpoint de
 * plus, à auditer pour rien.
 */

/*
 * Normalise un montant saisi : accepte « 5,90 » comme « 5.90 », garde les
 * centimes, rend une chaîne car `games.min_spend` est de type texte.
 *
 * ⚠️ Cette grammaire est PERMISSIVE — « abc » y devient « 0 ». C'est le
 * comportement du code en production, conservé tel quel ici : le durcir est un
 * autre chantier (`centimes_depuis_saisie`, qui REFUSE au lieu de deviner), et
 * le mêler à cette correction reviendrait à changer deux choses à la fois sur
 * une fiche que des restaurateurs enregistrent tous les jours.
 */
export function normaliserMontant(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === "") return "0"
  const n = parseFloat(String(valeur).replace(",", ".").trim())
  if (!isFinite(n) || n < 0) return "0"
  return String(Math.round(n * 100) / 100) // 2 décimales max
}

/**
 * Le montant à écrire, en tenant compte de l'interrupteur du formulaire.
 *
 * ─── POURQUOI `=== false` ET NON UN SIMPLE TEST DE VÉRACITÉ ───
 *
 * `!form.has_min_spend` mettrait aussi le montant à zéro quand le champ est
 * ABSENT — et « absent » n'est pas « le gérant a éteint l'interrupteur ».
 * Transformer une information manquante en décision métier, c'est exactement
 * le `else 0` que le lot 3 vient de fermer côté lecture. On n'agit que sur un
 * refus EXPLICITE ; sans information, on ne touche à rien.
 */
export function montantAEcrire(form: { has_min_spend?: unknown; min_spend?: unknown } | null | undefined): string {
  if (form?.has_min_spend === false) return "0"
  return normaliserMontant(form?.min_spend)
}
