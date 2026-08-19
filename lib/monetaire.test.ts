/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PARITÉ ÉCRAN ↔ BASE — LA MÊME TABLE DE CAS DES DEUX CÔTÉS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux implémentations « équivalentes » de la même règle divergent en quelques
 * mois — c'est exactement ce qui a produit le défaut monétaire : `^[0-9]+$` en
 * SQL, `parseFloat` sur la page publique, `parseInt` dans le scanner.
 *
 * Ce fichier ne réécrit donc PAS sa propre table de cas. Il LIT celle de
 * l'oracle SQL (`harnais-contrat-monetaire.sql`) et éprouve l'implémentation
 * TypeScript dessus. Ajouter un cas en SQL l'ajoute ici automatiquement ;
 * retirer un cas du SQL fait échouer les gardes de volumétrie ci-dessous.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CENTIMES_MAX,
  MontantInvalide,
  centimesDepuisSaisie,
  formaterEuros,
  libelleMinimum,
  lireMinimum,
  minimumEffectifCentimes,
  saisieDepuisCentimes,
} from './monetaire'

const ORACLE = join(__dirname, '..', 'supabase', 'verifications', 'harnais-contrat-monetaire.sql')

/** Extrait un tableau SQL `nom … := array[ … ];` du fichier oracle. */
function blocTableau(source: string, nom: string): string {
  const debut = source.indexOf(`${nom} text`)
  if (debut < 0) throw new Error(`Tableau « ${nom} » introuvable dans l'oracle SQL`)
  const ouvrant = source.indexOf('array[', debut)
  const fermant = source.indexOf('];', ouvrant)
  if (ouvrant < 0 || fermant < 0) throw new Error(`Tableau « ${nom} » mal formé dans l'oracle SQL`)
  return source.slice(ouvrant + 'array['.length, fermant)
}

/** `'a'` ou `'a''b'` → la chaîne, guillemets SQL doublés rendus simples. */
function litteraux(bloc: string): string[] {
  const trouves = bloc.match(/'(?:[^']|'')*'/g) ?? []
  return trouves.map((t) => t.slice(1, -1).replace(/''/g, "'"))
}

const source = readFileSync(ORACLE, 'utf8')

const casValides: Array<[string, string]> = (() => {
  const plats = litteraux(blocTableau(source, 'valides'))
  const paires: Array<[string, string]> = []
  for (let i = 0; i < plats.length; i += 2) paires.push([plats[i], plats[i + 1]])
  return paires
})()

const casInvalides = litteraux(blocTableau(source, 'invalides'))

describe('la table de cas vient bien de l’oracle SQL', () => {
  /*
   * Sans ces deux gardes, une extraction qui casse rendrait des tableaux vides
   * et TOUS les tests de grammaire passeraient — zéro cas, zéro échec. Un test
   * qui ne teste rien est pire qu'un test absent : il rassure.
   */
  it('lit au moins dix formes valides', () => {
    expect(casValides.length).toBeGreaterThanOrEqual(10)
    expect(casValides.every(([s, a]) => typeof s === 'string' && typeof a === 'string')).toBe(true)
  })

  it('lit au moins quinze formes invalides', () => {
    expect(casInvalides.length).toBeGreaterThanOrEqual(15)
  })

  it('couvre les formes qui portent le défaut de production', () => {
    const saisies = casValides.map(([s]) => s)
    expect(saisies).toContain('5,90')
    expect(saisies).toContain('5.9')
    expect(casInvalides).toContain('abc')
    expect(casInvalides).toContain('-3')
  })
})

describe('centimesDepuisSaisie — la grammaire, cas par cas depuis le SQL', () => {
  for (const [saisie, attendu] of casValides) {
    it(`« ${saisie} » → ${attendu}`, () => {
      const obtenu = centimesDepuisSaisie(saisie)
      expect(obtenu === null ? 'NULL' : String(obtenu)).toBe(attendu)
    })
  }

  for (const saisie of casInvalides) {
    it(`« ${saisie} » est refusé, jamais converti`, () => {
      expect(() => centimesDepuisSaisie(saisie)).toThrow(MontantInvalide)
    })
  }
})

describe('centimesDepuisSaisie — les pièges qui ne sont pas dans la table', () => {
  it('null et undefined valent « rien saisi »', () => {
    expect(centimesDepuisSaisie(null)).toBeNull()
    expect(centimesDepuisSaisie(undefined)).toBeNull()
  })

  it('rogne les espaces, comme btrim', () => {
    expect(centimesDepuisSaisie('  5,90  ')).toBe(590)
  })

  /*
   * PARITÉ FINE : `btrim(x)` en SQL ne retire QUE des espaces. `trim()` en
   * JavaScript retire aussi tabulation, retour ligne et espace insécable. Sans
   * ce test, « \t5 » lèverait côté base et vaudrait 500 côté écran — une
   * divergence invisible jusqu'au jour où elle décide d'un montant.
   */
  it('ne rogne PAS la tabulation, le retour ligne ni l’espace insécable', () => {
    expect(() => centimesDepuisSaisie('\t5')).toThrow(MontantInvalide)
    expect(() => centimesDepuisSaisie('5\n')).toThrow(MontantInvalide)
    // Espace insécable, écrite en échappement : invisible dans un éditeur,
    // elle ferait douter du test au lieu de le rendre lisible.
    expect(() => centimesDepuisSaisie('\u00a05')).toThrow(MontantInvalide)
    expect(centimesDepuisSaisie('  5 ')).toBe(500)
  })

  it('complète la décimale à DROITE : « 5,9 » vaut 5,90 €, pas 0,59 €', () => {
    expect(centimesDepuisSaisie('5,9')).toBe(590)
    expect(centimesDepuisSaisie('5,09')).toBe(509)
  })

  it('ne passe jamais par un flottant', () => {
    // 0,07 € puis 0,01 € : en flottant, 0.07 + 0.01 ne vaut pas exactement 0.08.
    expect(centimesDepuisSaisie('0,07')! + centimesDepuisSaisie('0,01')!).toBe(8)
    expect(centimesDepuisSaisie('0,29')).toBe(29)
    expect(centimesDepuisSaisie('1,15')).toBe(115)
  })

  it('accepte la borne haute de la grammaire', () => {
    expect(centimesDepuisSaisie('999999')).toBe(99_999_900)
    expect(centimesDepuisSaisie('999999')).toBe(CENTIMES_MAX)
  })

  /*
   * POINT OUVERT, VOLONTAIREMENT FIGÉ ICI.
   *
   * La grammaire accepte « 999999,99 » → 99 999 999 centimes, alors que la
   * contrainte `games_min_spend_cents_borne` s'arrête à 99 999 900. Une telle
   * saisie passe donc le parseur et se fait rejeter par la base, avec une
   * erreur de contrainte opaque au lieu du message P0120.
   *
   * Ce n'est pas une corruption : rien n'est écrit. C'est un message d'erreur
   * illisible sur une saisie absurde. Le test fige le comportement ACTUEL pour
   * qu'une correction future soit un choix, pas un accident.
   */
  it('accepte encore un montant au-dessus de la borne SQL (point ouvert)', () => {
    expect(centimesDepuisSaisie('999999,99')).toBe(99_999_999)
    expect(centimesDepuisSaisie('999999,99')!).toBeGreaterThan(CENTIMES_MAX)
  })
})

describe('minimumEffectifCentimes — l’ordre de lecture canonique', () => {
  it('le snapshot prime sur tout', () => {
    expect(minimumEffectifCentimes(590, 1200, '99')).toBe(590)
  })

  it('puis le champ canonique du jeu', () => {
    expect(minimumEffectifCentimes(null, 1200, '99')).toBe(1200)
  })

  it('puis le texte historique, lu strictement', () => {
    expect(minimumEffectifCentimes(null, null, '5,90')).toBe(590)
  })

  it('un snapshot à zéro reste zéro — il ne retombe pas sur le jeu', () => {
    expect(minimumEffectifCentimes(0, 1200, '99')).toBe(0)
  })

  it('un champ canonique à zéro reste zéro', () => {
    expect(minimumEffectifCentimes(null, 0, '99')).toBe(0)
  })

  /* Le cœur du défaut : illisible ne devient JAMAIS zéro. */
  it('illisible rend null, jamais zéro', () => {
    expect(minimumEffectifCentimes(null, null, 'abc')).toBeNull()
    expect(minimumEffectifCentimes(null, null, '-3')).toBeNull()
    expect(minimumEffectifCentimes(null, null, '5abc')).toBeNull()
    expect(minimumEffectifCentimes(null, null, 'abc')).not.toBe(0)
  })

  it('rien saisi rend null', () => {
    expect(minimumEffectifCentimes(null, null, '')).toBeNull()
    expect(minimumEffectifCentimes(null, null, null)).toBeNull()
  })
})

describe('formaterEuros — le format français', () => {
  const table: Array<[number | null, string | null]> = [
    [590, '5,90 €'],
    [1000, '10 €'],
    [5, '0,05 €'],
    [0, '0 €'],
    [99_999_900, '999999 €'],
    [509, '5,09 €'],
    [null, null],
  ]

  for (const [centimes, attendu] of table) {
    it(`${centimes} → ${attendu}`, () => {
      expect(formaterEuros(centimes)).toBe(attendu)
    })
  }

  it('ne rend jamais un « NaN € » à l’écran', () => {
    expect(formaterEuros(Number.NaN)).toBeNull()
    expect(formaterEuros(Number.POSITIVE_INFINITY)).toBeNull()
    expect(formaterEuros(undefined)).toBeNull()
  })
})

describe('saisieDepuisCentimes — ce qui sort du champ doit pouvoir y rentrer', () => {
  it('produit une saisie que la grammaire accepte', () => {
    expect(saisieDepuisCentimes(590)).toBe('5,90')
    expect(saisieDepuisCentimes(1000)).toBe('10')
    expect(saisieDepuisCentimes(5)).toBe('0,05')
    expect(saisieDepuisCentimes(0)).toBe('0')
    expect(saisieDepuisCentimes(null)).toBe('')
  })

  /*
   * L'ALLER-RETOUR est le vrai test : ouvrir une fiche puis l'enregistrer sans
   * y toucher ne doit pas modifier le montant. C'est précisément ce que le
   * `parseFloat(...) || 0` du formulaire d'édition cassait.
   */
  it('aller-retour exact sur toute la table de cas valides', () => {
    for (const [saisie] of casValides) {
      const centimes = centimesDepuisSaisie(saisie)
      if (centimes == null) continue
      expect(centimesDepuisSaisie(saisieDepuisCentimes(centimes))).toBe(centimes)
    }
  })

  it('aller-retour exact sur les centimes qui piègent l’arrondi', () => {
    for (const centimes of [1, 5, 9, 10, 99, 100, 101, 590, 999, 1000, 99_999_900]) {
      expect(centimesDepuisSaisie(saisieDepuisCentimes(centimes))).toBe(centimes)
    }
  })
})

describe('lireMinimum — trois états, parce que l’écran en a besoin de trois', () => {
  it('rien saisi : aucun minimum', () => {
    expect(lireMinimum(null, null, '')).toEqual({ etat: 'aucun', centimes: 0 })
    expect(lireMinimum(null, null, '   ')).toEqual({ etat: 'aucun', centimes: 0 })
    expect(lireMinimum(null, null, null)).toEqual({ etat: 'aucun', centimes: 0 })
  })

  it('zéro saisi : aucun minimum', () => {
    expect(lireMinimum(null, null, '0')).toEqual({ etat: 'aucun', centimes: 0 })
    expect(lireMinimum(0, null, '99')).toEqual({ etat: 'aucun', centimes: 0 })
  })

  it('montant lisible : le montant', () => {
    expect(lireMinimum(null, null, '5,90')).toEqual({ etat: 'montant', centimes: 590 })
    expect(lireMinimum(590, 1200, 'abc')).toEqual({ etat: 'montant', centimes: 590 })
    expect(lireMinimum(null, 750, '99')).toEqual({ etat: 'montant', centimes: 750 })
  })

  /*
   * La distinction qui n'existait nulle part : le scanner écrivait « Aucun »
   * sur une valeur illisible. Le staff en concluait qu'il pouvait servir sans
   * condition — la même faute que le `else 0`, déplacée dans l'interface.
   */
  it('valeur illisible : un état À PART, jamais « aucun »', () => {
    const m = lireMinimum(null, null, 'abc')
    expect(m.etat).toBe('illisible')
    expect(m.centimes).toBeNull()
    expect(m).not.toEqual({ etat: 'aucun', centimes: 0 })
  })

  it('le libellé ne rassure pas à tort', () => {
    expect(libelleMinimum(lireMinimum(null, null, ''))).toBe('Aucun')
    expect(libelleMinimum(lireMinimum(null, null, '5,90'))).toBe('5,90 €')
    expect(libelleMinimum(lireMinimum(null, null, '10'))).toBe('10 €')
    expect(libelleMinimum(lireMinimum(null, null, 'abc'))).not.toBe('Aucun')
    expect(libelleMinimum(lireMinimum(null, null, 'abc'))).toContain('Illisible')
  })
})
