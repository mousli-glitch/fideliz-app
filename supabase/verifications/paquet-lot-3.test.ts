/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE PAQUET NE DOIT PAS DÉRIVER DE CE QU'IL PRÉTEND APPLIQUER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les fichiers 02, 03 et 05 EMBARQUENT le contenu d'une migration ou d'un
 * rollback, pour être des transactions autonomes. Deux copies du même SQL,
 * c'est deux copies qui divergent : on corrige la migration, on oublie le
 * paquet, et le jour de l'application c'est l'ancienne version qui part en
 * production.
 *
 * Ces tests exigent que le contenu embarqué soit le fichier source, caractère
 * pour caractère. Ils vérifient aussi la seule chose que l'assemblage peut
 * casser en silence : une collision de délimiteurs dollar-quote entre
 * l'enveloppe et le contenu embarqué.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8')

const PAQUET = 'deploiement/lot-3-lecteurs-monetaires'

const F = {
  preflight: lire(`${PAQUET}/01-preflight-production.sql`),
  contrat: lire(`${PAQUET}/02-appliquer-contrat-monetaire.sql`),
  lecteurs: lire(`${PAQUET}/03-appliquer-lecteurs.sql`),
  post: lire(`${PAQUET}/04-controles-post.sql`),
  retour: lire(`${PAQUET}/05-retour-arriere-lecteurs.sql`),
}

const SOURCE = {
  contrat: lire('supabase/migrations/20260819060000_contrat_monetaire_centimes.sql'),
  lecteurs: lire('supabase/migrations/20260819100000_lecteurs_monetaires.sql'),
  retour: lire('supabase/rollback/20260819100000_rollback.sql'),
}

/*
 * L'ENVELOPPE AUSSI DOIT ÊTRE ADOSSÉE À QUELQUE CHOSE.
 *
 * Le test de containment ci-dessous couvre le SQL EMBARQUÉ. Il ne dit rien de
 * l'enveloppe — transaction, délais, verrou, empreinte des données, blocs de
 * vérification. Une main qui modifie l'enveloppe d'un seul fichier passerait
 * inaperçue.
 *
 * Le paquet est donc GÉNÉRÉ, et ce test compare les fichiers versionnés à ce
 * que le générateur produit. Toute divergence — fichier retouché à la main, ou
 * générateur modifié sans régénération — échoue ici.
 */
describe('les fichiers versionnés sont exactement ceux que le générateur produit', () => {
  it('aucune dérive entre le générateur et le paquet', async () => {
    const { construire } = await import(`${RACINE}/${PAQUET}/generer.mjs`)
    const attendu = construire() as Record<string, string>

    const ecarts: string[] = []
    for (const [nom, contenu] of Object.entries(attendu)) {
      const surDisque = lire(`${PAQUET}/${nom}`)
      if (surDisque !== contenu) {
        let k = 0
        while (k < Math.min(surDisque.length, contenu.length) && surDisque[k] === contenu[k]) k++
        ecarts.push(`${nom} : premier écart au caractère ${k} (disque ${surDisque.length}, généré ${contenu.length})`)
      }
    }
    expect(ecarts, 'régénérer avec : node deploiement/lot-3-lecteurs-monetaires/generer.mjs').toEqual([])
  })

  /*
   * Sans cette garde, un `construire()` qui rendrait des chaînes vides — ou un
   * objet vide — ferait passer la comparaison au vert sans rien comparer.
   */
  it('le générateur produit bien du contenu, pas des coquilles vides', async () => {
    const { construire } = await import(`${RACINE}/${PAQUET}/generer.mjs`)
    const paquet = construire() as Record<string, string>
    expect(Object.keys(paquet).length).toBe(5)
    for (const [nom, contenu] of Object.entries(paquet)) {
      expect(contenu.length, `${nom} est trop court pour être un fichier du paquet`).toBeGreaterThan(3000)
      expect(contenu, `${nom} ne contient pas de SQL`).toMatch(/select|create|alter|do \$/i)
    }
  })

  it('le générateur couvre bien les cinq fichiers SQL', async () => {
    const { construire } = await import(`${RACINE}/${PAQUET}/generer.mjs`)
    expect(Object.keys(construire() as Record<string, string>).sort()).toEqual([
      '01-preflight-production.sql',
      '02-appliquer-contrat-monetaire.sql',
      '03-appliquer-lecteurs.sql',
      '04-controles-post.sql',
      '05-retour-arriere-lecteurs.sql',
    ])
  })
})

describe('le paquet embarque exactement ses sources', () => {
  it('02 contient la migration 20260819060000, verbatim', () => {
    expect(F.contrat).toContain(SOURCE.contrat)
  })

  it('03 contient la migration 20260819100000, verbatim', () => {
    expect(F.lecteurs).toContain(SOURCE.lecteurs)
  })

  it('05 contient le rollback 20260819100000, verbatim', () => {
    expect(F.retour).toContain(SOURCE.retour)
  })

  it('chaque fichier embarqué est bien plus gros que sa source — l’enveloppe existe', () => {
    expect(F.contrat.length).toBeGreaterThan(SOURCE.contrat.length + 500)
    expect(F.lecteurs.length).toBeGreaterThan(SOURCE.lecteurs.length + 500)
    expect(F.retour.length).toBeGreaterThan(SOURCE.retour.length + 500)
  })
})

/*
 * COLLISION DE DÉLIMITEURS.
 *
 * PostgreSQL termine un bloc `$tag$ … $tag$` au PREMIER `$tag$` rencontré. Si
 * l'enveloppe ouvrait un `$$ … $$` autour d'un contenu qui contient lui-même
 * `$$`, le bloc se fermerait au mauvais endroit et le reste partirait en
 * syntaxe libre — souvent sans erreur immédiate. C'est un défaut d'assemblage,
 * pas de contenu : aucun des deux fichiers pris séparément ne le montre.
 */
describe('aucune collision de délimiteurs dans l’assemblage', () => {
  for (const [nom, contenu] of Object.entries(F)) {
    it(`${nom} — chaque étiquette dollar-quote apparaît un nombre PAIR de fois`, () => {
      const etiquettes = [...contenu.matchAll(/\$([a-z_]*)\$/g)].map((m) => m[1])
      const compte = new Map<string, number>()
      for (const e of etiquettes) compte.set(e, (compte.get(e) ?? 0) + 1)
      const impaires = [...compte.entries()].filter(([, n]) => n % 2 !== 0)
      expect(impaires, `étiquettes non appariées : ${JSON.stringify(impaires)}`).toEqual([])
    })
  }

  it('l’enveloppe n’emploie que des étiquettes nommées, jamais `$$`', () => {
    /*
     * Les migrations embarquées utilisent `$$`. L'enveloppe doit donc employer
     * des étiquettes NOMMÉES — sinon un `$$` de l'enveloppe fermerait un bloc
     * de la migration. On le vérifie sur les lignes de l'enveloppe seule.
     */
    for (const [nom, contenu] of [['02', F.contrat], ['03', F.lecteurs], ['05', F.retour]] as const) {
      const source = nom === '02' ? SOURCE.contrat : nom === '03' ? SOURCE.lecteurs : SOURCE.retour
      const enveloppe = contenu.replace(source, '')
      expect(enveloppe, `${nom} : l'enveloppe emploie \`$$\``).not.toMatch(/\$\$/)
    }
  })

  it('la garde de parité sait mordre', () => {
    const fixture = 'do $x$ begin end $x$; do $y$ begin end;'
    const etiquettes = [...fixture.matchAll(/\$([a-z_]*)\$/g)].map((m) => m[1])
    const compte = new Map<string, number>()
    for (const e of etiquettes) compte.set(e, (compte.get(e) ?? 0) + 1)
    expect([...compte.entries()].filter(([, n]) => n % 2 !== 0)).toEqual([['y', 1]])
  })
})

describe('chaque étape est une transaction autonome', () => {
  for (const [nom, contenu] of [['02', F.contrat], ['03', F.lecteurs], ['05', F.retour]] as const) {
    it(`${nom} — ouvre sa transaction, borne ses délais, prend le verrou, commite`, () => {
      expect(contenu).toMatch(/^\s*begin;/m)
      expect(contenu).toContain("set local lock_timeout = '5s'")
      expect(contenu).toContain("set local statement_timeout = '60s'")
      expect(contenu).toContain("pg_advisory_xact_lock(hashtext('lot-3:lecteurs-monetaires'))")
      expect(contenu.trimEnd().endsWith('commit;')).toBe(true)
    })

    it(`${nom} — prouve par empreinte qu'aucune donnée métier n'a bougé`, () => {
      expect(contenu).toContain('_empreinte_avant')
      expect(contenu).toMatch(/DONNEES MODIFIEES/)
      expect(contenu).toContain('md5(string_agg')
    })
  }

  for (const [nom, contenu] of [['01', F.preflight], ['04', F.post]] as const) {
    it(`${nom} — lecture seule : aucune écriture, aucune transaction`, () => {
      expect(contenu).not.toMatch(/^\s*begin;/m)
      expect(contenu).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|alter\s+table|drop\s+)/i)
      expect(contenu).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
    })
  }
})

describe('le paquet ne rouvre jamais un correctif de sécurité', () => {
  it('le préflight EXIGE l’isolation lot/jeu avant toute application', () => {
    expect(F.preflight).toMatch(/ne porte PAS l''isolation lot\/jeu/)
    expect(F.preflight).toContain('hotfix/isolation-lot-jeu/')
  })

  it('les contrôles post vérifient que l’isolation a survécu', () => {
    expect(F.post).toMatch(/isolation lot\/jeu a DISPARU/)
  })

  it('le retour arrière conserve l’isolation et le dit', () => {
    expect(F.retour).toContain('from prizes where id = p_prize_id and game_id = p_game_id;')
    expect(F.retour).toContain('where id = p_prize_id and game_id = p_game_id and quantity > 0;')
    expect(F.retour).toMatch(/isolation lot\/jeu a DISPARU/)
  })

  it('le retour arrière ne touche AUCUNE colonne', () => {
    const enveloppeEtContenu = F.retour
    expect(enveloppeEtContenu).not.toMatch(/drop\s+column/i)
    expect(enveloppeEtContenu).not.toMatch(/drop\s+constraint/i)
  })
})

describe('les branches d’erreur du paquet compileraient', () => {
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

  for (const [nom, contenu] of Object.entries(F)) {
    it(`${nom} — chaque RAISE a autant d'arguments que d'emplacements`, () => {
      const ecarts: string[] = []
      for (const m of contenu.matchAll(/raise\s+(?:exception|notice)\s+'((?:[^']|'')*)'((?:\s*,[^;]*)?);/gi)) {
        const emplacements = (m[1].match(/(?<!%)%(?!%)/g) ?? []).length
        const args = nbArguments(m[2] ?? '')
        if (emplacements !== args) {
          ecarts.push(`ligne ${contenu.slice(0, m.index).split('\n').length} : ${emplacements} vs ${args}`)
        }
      }
      expect(ecarts).toEqual([])
    })

    it(`${nom} — chaque format() reçoit exactement ses arguments`, () => {
      const ecarts: string[] = []
      for (const m of contenu.matchAll(/format\('((?:[^']|'')*)'((?:[^;]*?))\)/g)) {
        const emplacements = (m[1].match(/%[sIL]/g) ?? []).length
        const args = nbArguments(m[2] ?? '')
        if (emplacements !== args) {
          ecarts.push(`ligne ${contenu.slice(0, m.index).split('\n').length} : ${emplacements} %s vs ${args}`)
        }
      }
      expect(ecarts).toEqual([])
    })

    it(`${nom} — aucun \`%%\` dans un message de RAISE`, () => {
      const fautifs = [...contenu.matchAll(/raise\s+(?:exception|notice)\s+'((?:[^']|'')*)'/gi)]
        .filter((m) => m[1].includes('%%'))
      expect(fautifs.map((m) => m[1].slice(0, 60))).toEqual([])
    })
  }

  it('l’audit a bien trouvé des messages à auditer', () => {
    for (const [nom, contenu] of Object.entries(F)) {
      const n = [...contenu.matchAll(/raise\s+(?:exception|notice)\s+'/gi)].length
        + [...contenu.matchAll(/format\('/g)].length
      expect(n, `${nom} : aucun message trouvé — le motif est cassé`).toBeGreaterThan(3)
    }
  })
})
