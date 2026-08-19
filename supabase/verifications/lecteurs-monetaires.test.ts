/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  GARDE ANTI-RETOUR — LE DÉFAUT MONÉTAIRE NE DOIT PAS REVENIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un correctif de lecture ne se protège pas tout seul : il suffit qu'un
 * `parseFloat` reparaisse dans un lecteur pour que le minimum redevienne faux,
 * silencieusement, sans qu'aucun test de comportement ne bronche — puisque la
 * base, elle, restera juste.
 *
 * Ce fichier lit les SOURCES et refuse les formes qui ont produit le défaut.
 * Il éprouve aussi la symétrie entre la migration et son retour arrière, par
 * empreinte : chacun doit reconnaître exactement l'état que l'autre produit.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8')

/** Retire les commentaires — une forme interdite CITÉE reste autorisée. */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => {
      const i = l.indexOf('//')
      return i < 0 ? l : l.slice(0, i)
    })
    .join('\n')
}

/*
 * Deux rôles, deux exigences — et c'est la confusion entre les deux qui a
 * laissé le défaut s'installer.
 *
 * Un DÉCIDEUR lit la donnée brute et tranche : il doit passer par le contrat
 * canonique, jamais par une grammaire maison.
 *
 * Un AFFICHEUR reçoit une valeur déjà tranchée et la met à l'écran : il ne
 * doit RIEN recalculer. Le scanner comparait `review.minSpend > 0` — une
 * décision déguisée en affichage, qui écrivait « Aucun » sur un montant que
 * personne n'avait su lire.
 */
const DECIDEURS = [
  'app/actions/get-winner-info.ts',
  'app/verify/[id]/page.tsx',
  'app/admin/[slug]/games/[id]/page.tsx',
  'components/game/public-game-client.tsx',
]

const AFFICHEURS = [
  'app/actions/play-game.ts',
  'app/actions/register-winner.ts',
  'app/verify/[id]/verify-client.tsx',
  'app/admin/[slug]/scanner/page.tsx',
]

const LECTEURS = [...DECIDEURS, ...AFFICHEURS]

describe('aucun lecteur ne réinvente sa propre grammaire du montant', () => {
  for (const chemin of LECTEURS) {
    const code = codeSeul(lire(chemin))

    it(`${chemin} — plus de parseFloat sur un montant`, () => {
      const suspects = code
        .split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => /parse(Float|Int)/.test(l) && /min_?[sS]pend|montant|minimum/i.test(l))
      expect(suspects, `lignes fautives : ${JSON.stringify(suspects)}`).toEqual([])
    })

    it(`${chemin} — plus de test « ^[0-9]+$ » sur un montant`, () => {
      expect(code).not.toMatch(/\^\[0-9\]\+\$/)
    })

    it(`${chemin} — plus de repli « || 0 » sur un montant`, () => {
      const suspects = code
        .split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => /min_?[sS]pend[^\n]*\|\|\s*0/.test(l))
      expect(suspects, `lignes fautives : ${JSON.stringify(suspects)}`).toEqual([])
    })
  }

  it('chaque décideur passe par le module canonique', () => {
    for (const chemin of DECIDEURS) {
      expect(lire(chemin), `${chemin} n'importe pas @/lib/monetaire`).toMatch(/from ["']@\/lib\/monetaire["']/)
    }
  })

  /*
   * Un afficheur qui compare un montant à zéro a repris une décision qui ne
   * lui appartient pas — et il la reprend TOUJOURS de la façon qui rassure :
   * « pas > 0 » devient « aucun ». C'est la forme exacte que prenait le
   * `review.minSpend > 0` du scanner et le `minSpend > 0` de la page de
   * vérification.
   */
  for (const chemin of AFFICHEURS) {
    it(`${chemin} — n'arbitre pas lui-même par une comparaison à zéro`, () => {
      const code = codeSeul(lire(chemin))
      const suspects = code
        .split('\n')
        .map((l, i) => [i + 1, l.trim()] as const)
        .filter(([, l]) => /min_?[sS]pend\w*\s*[><=!]=?\s*0/.test(l))
      expect(suspects, `lignes fautives : ${JSON.stringify(suspects)}`).toEqual([])
    })
  }
})

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LES GARDES SAVENT MORDRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une garde statique verte ne prouve rien tant qu'on n'a pas montré qu'elle
 * refuse ce qu'elle prétend refuser. Les fixtures ci-dessous sont des CHAÎNES
 * — aucun fichier métier n'est dégradé pour éprouver un test.
 */
describe('les gardes savent mordre', () => {
  const aParseFloat = (code: string) =>
    codeSeul(code).split('\n').some((l) => /parse(Float|Int)/.test(l) && /min_?[sS]pend|montant|minimum/i.test(l))
  const aTexteStrict = (code: string) => /\^\[0-9\]\+\$/.test(codeSeul(code))
  const aRepliZero = (code: string) => /min_?[sS]pend[^\n]*\|\|\s*0/.test(codeSeul(code))
  const aComparaisonZero = (code: string) => /min_?[sS]pend\w*\s*[><=!]=?\s*0/.test(codeSeul(code))

  it('repère un parseFloat sur un montant', () => {
    expect(aParseFloat('const minSpend = parseFloat(game.min_spend)')).toBe(true)
    expect(aParseFloat('const jours = parseInt(game.validity_days)')).toBe(false)
  })

  it('repère un retour de « ^[0-9]+$ »', () => {
    expect(aTexteStrict('if (/^[0-9]+$/.test(String(raw)))')).toBe(true)
    expect(aTexteStrict('if (/^[0-9]{1,6}$/.test(v))')).toBe(false)
  })

  it('repère un repli « || 0 »', () => {
    expect(aRepliZero('min_spend: result.min_spend || 0,')).toBe(true)
    expect(aRepliZero('min_spend: result.min_spend ?? null,')).toBe(false)
  })

  it('repère une comparaison à zéro chez un afficheur', () => {
    expect(aComparaisonZero('{minSpend > 0 && (')).toBe(true)
    expect(aComparaisonZero('{review.minSpend > 0 ? `${review.minSpend} €` : "Aucun"}')).toBe(true)
    expect(aComparaisonZero("{minimumEtat === 'montant' && (")).toBe(false)
  })

  it('ne se laisse pas berner par une forme interdite CITÉE en commentaire', () => {
    expect(aTexteStrict('// autrefois : /^[0-9]+$/.test(raw)')).toBe(false)
    expect(aTexteStrict('/* min_spend ~ \'^[0-9]+$\' */')).toBe(false)
    expect(aRepliZero('// `result.min_spend || 0` se trouvait ici')).toBe(false)
  })
})

describe('la grammaire TypeScript est celle du SQL, à la lettre', () => {
  const ts = lire('lib/monetaire.ts')
  const sql = lire('supabase/migrations/20260819060000_contrat_monetaire_centimes.sql')

  it('mêmes bornes de chiffres pour les euros entiers', () => {
    expect(ts).toMatch(/\^\[0-9\]\{1,6\}\$/)
    expect(sql).toMatch(/\^\[0-9\]\{1,6\}\$/)
  })

  it('mêmes bornes pour la forme décimale, virgule ET point', () => {
    expect(ts).toMatch(/\^\[0-9\]\{1,6\}\[\.,\]\[0-9\]\{1,2\}\$/)
    expect(sql).toMatch(/\^\[0-9\]\{1,6\}\[\.,\]\[0-9\]\{1,2\}\$/)
  })

  it('la borne haute est la même des deux côtés', () => {
    expect(ts).toContain('99_999_900')
    expect(sql).toContain('99999900')
  })
})

describe('migration et retour arrière se reconnaissent l’un l’autre', () => {
  const mig = lire('supabase/migrations/20260819100000_lecteurs_monetaires.sql')
  const rb = lire('supabase/rollback/20260819100000_rollback.sql')

  const PLAY_PRE = 'bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2'
  const PLAY_POST = '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d'
  const REG_PRE = '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442'
  const REG_POST = '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd'

  it('les quatre empreintes figurent des deux côtés', () => {
    for (const h of [PLAY_PRE, PLAY_POST, REG_PRE, REG_POST]) {
      expect(mig, `migration : ${h} absente`).toContain(h)
      expect(rb, `rollback : ${h} absente`).toContain(h)
    }
  })

  it('chacun refuse un état qu’il ne connaît pas', () => {
    expect(mig).toMatch(/not in \(c_play_pre, c_play_post\)/)
    expect(mig).toMatch(/not in \(c_reg_pre, c_reg_post\)/)
    expect(rb).toMatch(/not in \(c_play_pre, c_play_post\)/)
    expect(rb).toMatch(/not in \(c_reg_pre, c_reg_post\)/)
  })

  /*
   * LA GARDE QUI COMPTE LE PLUS.
   *
   * Le retour arrière monétaire remet `register_win` dans son état
   * POST-hotfix, pas dans son état baseline. Confondre les deux rouvrirait la
   * faille du lot d'un autre restaurant — un P0 déjà fermé en production le
   * 19/08/2026 — au motif d'annuler un correctif d'affichage.
   */
  it('le retour arrière monétaire NE rouvre PAS la faille lot/jeu', () => {
    expect(rb).toContain('from prizes where id = p_prize_id and game_id = p_game_id;')
    expect(rb).toContain('where id = p_prize_id and game_id = p_game_id and quantity > 0;')
    expect(rb).not.toContain('from prizes where id = p_prize_id;\n')
    expect(rb).toMatch(/isolation lot\/jeu a DISPARU/)
  })

  it('la migration vérifie elle aussi que l’isolation a survécu', () => {
    expect(mig).toMatch(/isolation lot\/jeu a DISPARU/)
  })

  it('la migration exige 20260819060000 avant elle', () => {
    expect(mig).toContain('minimum_effectif_centimes')
    expect(mig).toContain('games.min_spend_cents')
    expect(mig).toContain('winners.min_spend_cents_snapshot')
    expect(mig).toMatch(/20260819060000 doit etre appliquee AVANT/)
  })

  it('les deux corps corrigés écrivent le snapshot et lisent le contrat', () => {
    const corps = mig.split('$fn$')
    expect(corps.length).toBe(5)
    for (const c of [corps[1], corps[3]]) {
      expect(c).toContain('minimum_effectif_centimes(null, v_game.min_spend_cents, v_game.min_spend)')
      expect(c).toContain('min_spend_cents_snapshot')
      expect(c).not.toMatch(/\^\[0-9\]\+\$/)
    }
  })

  it('les deux corps d’origine du rollback portent bien l’ancienne lecture', () => {
    const corps = rb.split('$fn$')
    expect(corps.length).toBe(5)
    for (const c of [corps[1], corps[3]]) {
      expect(c).toMatch(/\^\[0-9\]\+\$/)
      expect(c).not.toContain('min_spend_cents_snapshot')
    }
  })
})

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CHAQUE MESSAGE D'ERREUR DOIT ÊTRE EXÉCUTABLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le retour arrière du hotfix d'isolation contenait `raise exception '… %% …'`
 * avec deux emplacements et trois arguments. `%%` est un POURCENT LITTÉRAL, pas
 * un emplacement : PostgreSQL refusait le bloc À LA COMPILATION. Le fichier ne
 * s'exécutait donc pas du tout, et personne ne l'avait vu — parce que ce
 * message vit dans une branche que le chemin vert n'emprunte jamais.
 *
 * Une exécution, même complète, ne visite pas les branches d'erreur. Seul un
 * audit du TEXTE les couvre toutes. Ces gardes comptent les emplacements et les
 * arguments des deux formes employées ici : `raise … '…', args` et
 * `format('…', args)`.
 */
describe('les branches d’erreur des nouveaux fichiers compileraient', () => {
  const FICHIERS: Array<[string, string]> = [
    ['migration', lire('supabase/migrations/20260819100000_lecteurs_monetaires.sql')],
    ['rollback', lire('supabase/rollback/20260819100000_rollback.sql')],
    ['harnais', lire('supabase/verifications/harnais-lecteurs-monetaires.sql')],
  ]

  /** Compte les arguments de premier niveau d'une liste `, a, b, f(c, d)`. */
  function nbArguments(suite: string): number {
    const t = suite.trim()
    if (!t.startsWith(',')) return 0
    let profondeur = 0
    let n = 1
    let dansChaine = false
    for (let i = 1; i < t.length; i++) {
      const c = t[i]
      if (dansChaine) {
        if (c === "'") dansChaine = t[i + 1] === "'" ? (i++, true) : false
        continue
      }
      if (c === "'") dansChaine = true
      else if (c === '(' || c === '[') profondeur++
      else if (c === ')' || c === ']') profondeur--
      else if (c === ',' && profondeur === 0) n++
    }
    return n
  }

  for (const [nom, contenu] of FICHIERS) {
    it(`${nom} — chaque RAISE a autant d'arguments que d'emplacements`, () => {
      const ecarts: string[] = []
      const motif = /raise\s+(?:exception|notice)\s+'((?:[^']|'')*)'((?:\s*,[^;]*)?);/gi
      for (const m of contenu.matchAll(motif)) {
        const emplacements = (m[1].match(/(?<!%)%(?!%)/g) ?? []).length
        const args = nbArguments(m[2] ?? '')
        if (emplacements !== args) {
          const ligne = contenu.slice(0, m.index).split('\n').length
          ecarts.push(`ligne ${ligne} : ${emplacements} emplacement(s), ${args} argument(s)`)
        }
      }
      expect(ecarts, `${nom} : RAISE mal formé — le bloc ne compilerait pas`).toEqual([])
    })

    it(`${nom} — aucun \`%%\` dans un message de RAISE`, () => {
      const motif = /raise\s+(?:exception|notice)\s+'((?:[^']|'')*)'/gi
      const fautifs = [...contenu.matchAll(motif)].filter((m) => m[1].includes('%%'))
      expect(fautifs.map((m) => m[1].slice(0, 60))).toEqual([])
    })

    it(`${nom} — chaque format() reçoit assez d'arguments`, () => {
      const ecarts: string[] = []
      const motif = /format\('((?:[^']|'')*)'((?:[^;]*?))\)/g
      for (const m of contenu.matchAll(motif)) {
        const emplacements = (m[1].match(/%[sIL]/g) ?? []).length
        const args = nbArguments(m[2] ?? '')
        if (emplacements !== args) {
          const ligne = contenu.slice(0, m.index).split('\n').length
          ecarts.push(`ligne ${ligne} : ${emplacements} %s, ${args} argument(s)`)
        }
      }
      expect(ecarts, `${nom} : format() mal formé — erreur à l'exécution`).toEqual([])
    })
  }

  /*
   * Un motif qui ne trouve rien passe au vert sans rien mesurer. On exige donc
   * que l'audit ait bien VU des messages dans chaque fichier — sinon c'est le
   * motif qui est cassé, pas le fichier qui est propre.
   */
  it('l’audit a bien trouvé des messages à auditer', () => {
    const releve = FICHIERS.map(([nom, contenu]) => [
      nom,
      [...contenu.matchAll(/raise\s+(?:exception|notice)\s+'/gi)].length,
      [...contenu.matchAll(/format\('/g)].length,
    ])
    for (const [nom, raises, formats] of releve) {
      expect(
        (raises as number) + (formats as number),
        `${nom} : l'audit n'a trouvé aucun message — le motif est cassé`
      ).toBeGreaterThan(3)
    }
  })

  it('la garde de comptage sait mordre', () => {
    const fixture = "raise exception 'a % b %% c %', x, y, z;"
    const m = [...fixture.matchAll(/raise\s+(?:exception|notice)\s+'((?:[^']|'')*)'((?:\s*,[^;]*)?);/gi)][0]
    expect((m[1].match(/(?<!%)%(?!%)/g) ?? []).length).toBe(2)
    expect(nbArguments(m[2])).toBe(3)
  })
})

describe('le harnais des lecteurs refuse une cible réelle', () => {
  const harnais = lire('supabase/verifications/harnais-lecteurs-monetaires.sql')

  it('garde de cible synthétique avant toute dégradation', () => {
    expect(harnais).toContain('HARNAIS REFUSE')
    expect(harnais).toContain('from auth.users')
    expect(harnais).toContain('from public.profiles')
    const posGarde = harnais.indexOf('HARNAIS REFUSE')
    const posDegradation = harnais.indexOf('ancienne lecture')
    expect(posGarde).toBeGreaterThan(-1)
    expect(posGarde).toBeLessThan(posDegradation)
  })

  it('vérifie la restauration par empreinte, pas par intention', () => {
    expect(harnais).toMatch(/restauration de %s INCOMPLETE/)
  })

  it('exige que l’ancienne lecture ÉCHOUE, sinon l’oracle ne mesure rien', () => {
    expect(harnais).toMatch(/l''ANCIENNE lecture passe l''oracle/)
    expect(harnais).toContain('5,90 -> 590 centimes')
    expect(harnais).toContain('illisible -> NULL, jamais 0')
  })

  it('détecte une dégradation qui n’aurait pas pris', () => {
    expect(harnais).toMatch(/degradation de %s n''a pas pris/)
  })
})
