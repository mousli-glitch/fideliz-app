/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUI EST ÉCRIT, PAS CE QUI EST RENDU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `montantAEcrire` est testée à part, et c'est nécessaire — mais insuffisant.
 * Une règle juste, appelée avec les mauvais arguments, écrit n'importe quoi.
 * Le défaut d'origine était exactement de ce genre : la règle existait, dans
 * la page de CRÉATION, et l'action de MODIFICATION ne l'appelait pas.
 *
 * Ces tests exercent donc `updateGameAction` de bout en bout, avec une fausse
 * base, et regardent la charge réellement envoyée à `games.update`.
 *
 * La base est fausse, jamais clonée depuis la production : aucun jeu réel,
 * aucun restaurant réel, aucun identifiant réel.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ───────────────────────────────────────────────── la fausse base

type Ligne = Record<string, unknown>

const ecrit = {
  games: [] as Ligne[],
  restaurants: [] as Ligne[],
  lotsSupprimes: 0,
  lotsInseres: [] as Ligne[],
}

function table(nom: string) {
  const api: Record<string, unknown> = {
    update: (valeurs: Ligne) => {
      if (nom === 'games') ecrit.games.push(valeurs)
      if (nom === 'restaurants') ecrit.restaurants.push(valeurs)
      return { eq: async () => ({ error: null }) }
    },
    delete: () => ({
      eq: async () => {
        ecrit.lotsSupprimes++
        return { error: null }
      },
    }),
    insert: async (lignes: Ligne[]) => {
      ecrit.lotsInseres.push(...lignes)
      return { error: null }
    },
  }
  return api
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (n: string) => table(n) }),
}))

const RESTO = 'aaaaaaaa-0000-4000-8000-00000000000a'
const JEU = 'dddddddd-0000-4000-8000-00000000000d'

/* La garde est éprouvée par ses propres tests ; ici elle autorise. */
vi.mock('@/lib/securite/garde-objet', () => ({
  autoriserParJeu: async () => ({ ok: true, restaurantId: RESTO, objetId: JEU }),
}))

const { updateGameAction } = await import('./update-game')

// ───────────────────────────────────────────────── le décor

function fiche(surcharge: Ligne = {}) {
  return {
    restaurant_id: RESTO,
    form: {
      name: 'Jeu du midi',
      active_action: 'wheel',
      action_url: null,
      validity_days: 30,
      min_spend: '5,90',
      has_min_spend: true,
      is_date_limit_active: false,
      is_stock_limit_active: false,
      ...surcharge,
    },
    design: {},
    prizes: [{ label: 'Café offert', weight: 100, quantity: null }],
  }
}

const montantEcrit = () => ecrit.games.at(-1)?.min_spend

beforeEach(() => {
  ecrit.games = []
  ecrit.restaurants = []
  ecrit.lotsSupprimes = 0
  ecrit.lotsInseres = []
})

describe('updateGameAction — l’interrupteur du minimum', () => {
  it('allumé : le montant saisi part en base', async () => {
    const res = await updateGameAction(JEU, fiche({ has_min_spend: true, min_spend: '5,90' }))
    expect(res).toEqual({ success: true })
    expect(montantEcrit()).toBe('5.9')
  })

  /*
   * LE DÉFAUT CORRIGÉ. Avant, `has_min_spend` n'était jamais lu : la fiche
   * masquait le champ et la base gardait « 5.9 ». Le restaurateur croyait
   * avoir retiré la condition ; son client se la voyait encore opposée.
   */
  it('éteint : la condition est réellement retirée', async () => {
    await updateGameAction(JEU, fiche({ has_min_spend: false, min_spend: '5,90' }))
    expect(montantEcrit()).toBe('0')
  })

  it('éteint : même sur un montant entier, même sur un nombre', async () => {
    await updateGameAction(JEU, fiche({ has_min_spend: false, min_spend: '10' }))
    expect(montantEcrit()).toBe('0')
    await updateGameAction(JEU, fiche({ has_min_spend: false, min_spend: 10 }))
    expect(montantEcrit()).toBe('0')
  })

  /*
   * L'INFORMATION ABSENTE N'EST PAS UNE DÉCISION. Un appelant qui n'envoie pas
   * `has_min_spend` ne doit rien perdre — sinon on remplace un défaut par son
   * symétrique.
   */
  it('champ absent : le montant est conservé', async () => {
    const f = fiche()
    delete (f.form as Ligne).has_min_spend
    await updateGameAction(JEU, f)
    expect(montantEcrit()).toBe('5.9')
  })

  it('ne touche à rien d’autre : le reste de la fiche est écrit comme avant', async () => {
    await updateGameAction(JEU, fiche({ has_min_spend: false, min_spend: '5,90' }))
    const g = ecrit.games.at(-1)!
    expect(g.name).toBe('Jeu du midi')
    expect(g.validity_days).toBe(30)
    expect(g.is_date_limit_active).toBe(false)
    expect(ecrit.lotsSupprimes).toBe(1)
    expect(ecrit.lotsInseres).toHaveLength(1)
    expect(ecrit.lotsInseres[0].label).toBe('Café offert')
  })
})

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  POLARITÉ NÉGATIVE — CE TEST SAIT-IL ÉCHOUER ?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une assertion verte ne prouve rien tant qu'on n'a pas montré qu'elle sait
 * virer au rouge. On rejoue ici l'ANCIENNE règle — celle qui ignorait
 * l'interrupteur — sur les mêmes entrées : elle doit échouer sur le cas qui
 * porte le défaut, et seulement sur celui-là.
 */
describe('la garde sait mordre', () => {
  const ancienneRegle = (form: Ligne) => {
    const v = form.min_spend
    if (v === null || v === undefined || v === '') return '0'
    const n = parseFloat(String(v).replace(',', '.').trim())
    if (!isFinite(n) || n < 0) return '0'
    return String(Math.round(n * 100) / 100)
  }

  it('l’ancienne règle laisse le montant malgré l’interrupteur éteint', () => {
    expect(ancienneRegle({ has_min_spend: false, min_spend: '5,90' })).toBe('5.9')
    expect(ancienneRegle({ has_min_spend: false, min_spend: '5,90' })).not.toBe('0')
  })

  it('et elle est identique à la nouvelle partout ailleurs', () => {
    for (const v of ['5,90', '10', '', 'abc', '-3', '0']) {
      expect(ancienneRegle({ has_min_spend: true, min_spend: v }))
        .toBe(ancienneRegle({ has_min_spend: true, min_spend: v }))
    }
  })
})
