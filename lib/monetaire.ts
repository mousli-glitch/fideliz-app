/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE MONTANT, LU DE LA MÊME FAÇON À L'ÉCRAN ET DANS LA BASE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce module est le MIROIR EXACT de trois fonctions SQL :
 *
 *     centimesDepuisSaisie      ↔  public.centimes_depuis_saisie(text)
 *     minimumEffectifCentimes   ↔  public.minimum_effectif_centimes(int,int,text)
 *
 * Le défaut mesuré en production venait précisément de l'absence d'un tel
 * miroir : trois lecteurs, trois grammaires. `play_game` acceptait `^[0-9]+$`,
 * la page de vérification faisait `parseFloat`, le scanner faisait `parseInt`.
 * Un minimum de 5,90 € était donc appliqué comme 0 € par les uns et affiché
 * correctement par les autres.
 *
 * Une seule grammaire, écrite deux fois — une fois en SQL, une fois ici — et
 * un test qui rejoue LA MÊME table de cas des deux côtés. Sans ce test, deux
 * implémentations « équivalentes » divergent en quelques mois.
 *
 * ─── LES PIÈGES DE PARITÉ, ET COMMENT ILS SONT ÉVITÉS ───
 *
 * 1. `btrim(x)` en SQL ne retire QUE des espaces. `String.prototype.trim()` en
 *    JavaScript retire aussi tabulations, retours ligne et espaces insécables.
 *    Une saisie « \t5 » lèverait donc côté base et vaudrait 500 côté écran.
 *    On rogne ici les seuls espaces, comme le fait Postgres.
 *
 * 2. Aucun flottant. `parseFloat('0.1') + parseFloat('0.2')` ne vaut pas 0.3,
 *    et un montant n'est pas une quantité continue. Le calcul est entier de
 *    bout en bout, comme en SQL.
 *
 * 3. `NULL` n'est pas `0`. Zéro veut dire « aucun minimum ». `null` veut dire
 *    « rien à afficher » — soit parce que rien n'a été saisi, soit parce que
 *    la valeur est illisible. Dans les deux cas on n'invente rien. Ce qui est
 *    interdit, c'est de rendre `0` sur une valeur illisible : c'était le bug.
 */

/** 999 999 € — la borne posée par `games_min_spend_cents_borne` en base. */
export const CENTIMES_MAX = 99_999_900

/**
 * Une saisie que la grammaire refuse. Elle LÈVE au lieu de retomber sur une
 * valeur métier plausible — c'est tout l'objet du correctif.
 *
 * Miroir du code d'erreur SQL `P0120`.
 */
export class MontantInvalide extends Error {
  readonly code = 'montant_invalide'
  readonly saisie: string

  constructor(saisie: string) {
    super(
      `Montant invalide : « ${saisie} ». Attendu un nombre d'euros, ` +
      `avec au plus deux décimales (exemples : 0, 5, 5,90).`
    )
    this.name = 'MontantInvalide'
    this.saisie = saisie
  }
}

/** `btrim(x)` de Postgres : rogne les ESPACES, et rien d'autre. */
function rognerEspaces(v: string): string {
  return v.replace(/^ +/, '').replace(/ +$/, '')
}

const EUROS_ENTIERS = /^[0-9]{1,6}$/
const EUROS_DECIMAUX = /^[0-9]{1,6}[.,][0-9]{1,2}$/

/**
 * Convertit une saisie monétaire en centimes entiers.
 *
 * - vide (ou uniquement des espaces) → `null` : aucun minimum ;
 * - `« 5 »` → 500 ; `« 5,9 »` → 590 ; `« 5.90 »` → 590 ; `« 0,05 »` → 5 ;
 * - tout le reste LÈVE `MontantInvalide` — lettres, négatif, exponentiel,
 *   suffixe (`5abc`), plus de deux décimales, dépassement.
 *
 * `« 5,9 »` vaut 5,90 € donc 590 centimes, pas 59 : la décimale manquante est
 * complétée à droite, comme le fait `rpad` en SQL.
 */
export function centimesDepuisSaisie(saisie: string | null | undefined): number | null {
  const v = rognerEspaces(saisie == null ? '' : String(saisie))

  if (v === '') return null

  if (EUROS_ENTIERS.test(v)) {
    return Number.parseInt(v, 10) * 100
  }

  if (EUROS_DECIMAUX.test(v)) {
    const normalise = v.replace(',', '.')
    const euros = normalise.slice(0, normalise.indexOf('.'))
    const centimes = normalise.slice(normalise.indexOf('.') + 1).padEnd(2, '0')
    return Number.parseInt(euros, 10) * 100 + Number.parseInt(centimes, 10)
  }

  throw new MontantInvalide(v)
}

/**
 * Le minimum applicable, en centimes, dans l'ORDRE CANONIQUE — le même pour
 * tous les lecteurs, écran comme base :
 *
 *   1. le snapshot du ticket   — la condition telle qu'elle était au gain ;
 *   2. le champ canonique du jeu ;
 *   3. le texte historique, lu STRICTEMENT.
 *
 * Une valeur historique illisible rend `null` — « on ne sait pas » — et jamais
 * `0` — « aucun minimum ». On rend `null` plutôt que de lever : une lecture qui
 * échoue casserait la page d'un client pour une donnée qui, mesurée, n'existe
 * pas en production. L'anomalie reste visible sans être bloquante.
 */
export function minimumEffectifCentimes(
  snapshot: number | null | undefined,
  jeuCentimes: number | null | undefined,
  texteHistorique: string | null | undefined
): number | null {
  if (snapshot != null) return snapshot
  if (jeuCentimes != null) return jeuCentimes

  try {
    return centimesDepuisSaisie(texteHistorique)
  } catch {
    return null
  }
}

/**
 * Le montant, au format français : `590 → « 5,90 € »`, `1000 → « 10 € »`.
 *
 * Rend `null` pour un montant indéterminé — à l'appelant de décider ce qu'il
 * affiche alors, et « Aucun » n'est PAS la bonne réponse : « aucun minimum »
 * et « minimum inconnu » ne se disent pas pareil au comptoir.
 */
export function formaterEuros(centimes: number | null | undefined): string | null {
  if (centimes == null || !Number.isFinite(centimes)) return null

  const entier = Math.trunc(centimes)
  const euros = Math.trunc(entier / 100)
  const reste = Math.abs(entier % 100)

  return reste === 0
    ? `${euros} €`
    : `${euros},${String(reste).padStart(2, '0')} €`
}

/**
 * L'inverse de `centimesDepuisSaisie` : des centimes vers une saisie que la
 * grammaire accepte en retour. `590 → « 5,90 »`, `1000 → « 10 »`.
 *
 * Sert à REMPLIR le champ du formulaire d'édition. Ce qui en ressort doit
 * pouvoir y rentrer : sans cet aller-retour, ouvrir une fiche puis
 * l'enregistrer sans y toucher modifierait le montant.
 */
export function saisieDepuisCentimes(centimes: number | null | undefined): string {
  if (centimes == null || !Number.isFinite(centimes)) return ''

  const entier = Math.trunc(centimes)
  const euros = Math.trunc(entier / 100)
  const reste = Math.abs(entier % 100)

  return reste === 0 ? String(euros) : `${euros},${String(reste).padStart(2, '0')}`
}

/*
 * ─── TROIS ÉTATS, PAS DEUX ───
 *
 * `minimumEffectifCentimes` rend `null` dans DEUX situations que la base ne
 * distingue pas : rien n'a été saisi, ou la valeur est illisible. Pour un
 * calcul c'est équivalent — il n'y a rien à appliquer. Pour un ÉCRAN, non :
 *
 *   « Aucun »                le restaurateur sert, il n'y a pas de condition ;
 *   « Illisible »            il y a une condition, mais personne ne sait
 *                            laquelle — le staff ne doit pas conclure « aucun ».
 *
 * Le scanner écrivait « Aucun » dans les deux cas. C'est la même faute que le
 * `else 0` en SQL, déplacée dans l'interface : transformer « je ne sais pas »
 * en une réponse rassurante. Les lecteurs disposent du texte brut, ils peuvent
 * donc trancher — cette fonction le fait pour eux.
 */
export type Minimum =
  | { etat: 'aucun'; centimes: 0 }
  | { etat: 'montant'; centimes: number }
  | { etat: 'illisible'; centimes: null; saisie: string }

export function lireMinimum(
  snapshot: number | null | undefined,
  jeuCentimes: number | null | undefined,
  texteHistorique: string | null | undefined
): Minimum {
  const connu = snapshot ?? jeuCentimes
  if (connu != null) {
    return connu === 0 ? { etat: 'aucun', centimes: 0 } : { etat: 'montant', centimes: connu }
  }

  const brut = rognerEspaces(texteHistorique == null ? '' : String(texteHistorique))
  if (brut === '') return { etat: 'aucun', centimes: 0 }

  try {
    const centimes = centimesDepuisSaisie(brut)
    if (centimes == null || centimes === 0) return { etat: 'aucun', centimes: 0 }
    return { etat: 'montant', centimes }
  } catch {
    return { etat: 'illisible', centimes: null, saisie: brut }
  }
}

/** Ce qu'un écran écrit pour un minimum d'achat, sans jamais rassurer à tort. */
export function libelleMinimum(m: Minimum): string {
  switch (m.etat) {
    case 'aucun':    return 'Aucun'
    case 'montant':  return formaterEuros(m.centimes) as string
    case 'illisible': return 'Illisible — vérifier la fiche du jeu'
  }
}
