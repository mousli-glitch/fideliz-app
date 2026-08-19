/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ÉTEINDRE L'INTERRUPTEUR RETIRE LA CONDITION — ET NE FAIT QUE ÇA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le défaut : sur la fiche d'ÉDITION, éteindre « Minimum de commande » masquait
 * le champ à l'écran et laissait le montant en base. Le restaurateur croyait
 * avoir retiré la condition ; son client se la voyait encore opposée en caisse.
 *
 * Ces tests ne se contentent pas de vérifier le cas nominal : ils fixent aussi
 * les deux cas où il ne faut RIEN décider — champ absent, et forme inattendue.
 */

import { describe, expect, it } from 'vitest'
import { montantAEcrire, normaliserMontant } from './montant-formulaire'

describe('montantAEcrire — l’interrupteur est respecté', () => {
  it('éteint : le montant est retiré, quelle que soit la valeur saisie', () => {
    expect(montantAEcrire({ has_min_spend: false, min_spend: '5,90' })).toBe('0')
    expect(montantAEcrire({ has_min_spend: false, min_spend: 5.9 })).toBe('0')
    expect(montantAEcrire({ has_min_spend: false, min_spend: '10' })).toBe('0')
  })

  it('allumé : le montant saisi est conservé', () => {
    expect(montantAEcrire({ has_min_spend: true, min_spend: '5,90' })).toBe('5.9')
    expect(montantAEcrire({ has_min_spend: true, min_spend: '10' })).toBe('10')
  })

  /*
   * C'EST LE CŒUR DE LA CORRECTION.
   *
   * `!form.has_min_spend` aurait mis le montant à zéro dès que le champ est
   * absent. Or « absent » n'est pas « le gérant a éteint l'interrupteur » :
   * transformer une information manquante en décision métier, c'est le `else 0`
   * que le lot 3 vient de fermer côté lecture. Un appelant qui n'envoie pas le
   * champ ne doit RIEN perdre.
   */
  it('champ absent : on ne décide rien, le montant est conservé', () => {
    expect(montantAEcrire({ min_spend: '5,90' })).toBe('5.9')
    expect(montantAEcrire({ has_min_spend: undefined, min_spend: '5,90' })).toBe('5.9')
  })

  it('une forme inattendue ne vaut pas un refus explicite', () => {
    // Seul le booléen `false` retire la condition. Ni 0, ni "", ni null.
    expect(montantAEcrire({ has_min_spend: 0, min_spend: '5,90' })).toBe('5.9')
    expect(montantAEcrire({ has_min_spend: '', min_spend: '5,90' })).toBe('5.9')
    expect(montantAEcrire({ has_min_spend: null, min_spend: '5,90' })).toBe('5.9')
  })

  it('ne casse pas sur un formulaire manquant', () => {
    expect(montantAEcrire(null)).toBe('0')
    expect(montantAEcrire(undefined)).toBe('0')
    expect(montantAEcrire({})).toBe('0')
  })

  /*
   * L'ALLER-RETOUR : ce que la fiche pré-remplit doit pouvoir être réenregistré
   * sans dérive. Le lot 3 pré-remplit désormais le champ en TEXTE français
   * (« 5,90 ») là où il mettait un nombre — ce test fige la compatibilité.
   */
  it('aller-retour depuis le pré-remplissage français de la fiche', () => {
    for (const [saisie, attendu] of [
      ['5,90', '5.9'],
      ['0,05', '0.05'],
      ['10', '10'],
      ['0', '0'],
    ] as const) {
      expect(montantAEcrire({ has_min_spend: true, min_spend: saisie })).toBe(attendu)
    }
  })
})

describe('normaliserMontant — la grammaire de production, conservée telle quelle', () => {
  /*
   * Cette grammaire est PERMISSIVE et le reste : « abc » y devient « 0 ». La
   * durcir est un autre chantier — le mêler à cette correction reviendrait à
   * changer deux choses à la fois sur une fiche que des restaurateurs
   * enregistrent tous les jours. Ces tests figent l'existant pour qu'un
   * durcissement futur soit un choix, pas un accident.
   */
  it('accepte la virgule comme le point', () => {
    expect(normaliserMontant('5,90')).toBe('5.9')
    expect(normaliserMontant('5.90')).toBe('5.9')
  })

  it('vide, null et undefined valent zéro', () => {
    expect(normaliserMontant('')).toBe('0')
    expect(normaliserMontant(null)).toBe('0')
    expect(normaliserMontant(undefined)).toBe('0')
  })

  it('illisible et négatif deviennent zéro — comportement actuel, non durci ici', () => {
    expect(normaliserMontant('abc')).toBe('0')
    expect(normaliserMontant('-3')).toBe('0')
  })

  it('borne à deux décimales', () => {
    expect(normaliserMontant('5,999')).toBe('6')
    expect(normaliserMontant('5,994')).toBe('5.99')
  })
})
