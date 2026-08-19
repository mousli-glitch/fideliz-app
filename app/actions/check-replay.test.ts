/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  L'ACTION QUI RÉPOND AUX INCONNUS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `checkReplayStatusAction` est l'une des quatre Server Actions joignables
 * **sans compte**, et elle porte la clé de service — celle qui contourne la
 * RLS. Ce qu'elle rend, elle le rend au monde entier.
 *
 * Le 19/08/2026 elle n'avait aucun test. C'est ce qui a permis à `play_count`
 * — le nombre de participations d'une adresse e-mail sur un jeu donné — de
 * ressortir jusqu'au navigateur sans que rien ne s'en aperçoive : l'action
 * faisait `{ ok: true, ...result }`, et relayait donc tout ce que la base
 * décidait de rendre.
 *
 * ─── CE QUE CES TESTS REGARDENT, ET QUI COMPTE PLUS QUE LE RÉSULTAT ───
 *
 * La fausse base ENREGISTRE LES ARGUMENTS reçus par la RPC. Vérifier la
 * réponse ne suffirait pas : on veut savoir qu'une adresse invalide n'atteint
 * jamais la base, et que l'adresse transmise est bien la forme normalisée.
 *
 * Et surtout : la fausse base rend **délibérément `play_count`**, comme le
 * faisait la vraie avant le correctif. Un test qui se contenterait de la base
 * corrigée passerait au vert même si l'action redevenait un `...result`. Ici,
 * la base ment dans le mauvais sens — et l'action doit tenir quand même.
 *
 * Aucune adresse réelle, aucun identifiant réel : tout est en `.invalid`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ───────────────────────────────────────────────── le décor

const JEU = "99999999-0000-4000-8000-000000000009"

const base = {
  /* Ce que la RPC rendra au prochain appel. */
  reponse: null as any,
  erreur: null as { message: string } | null,
  /* Ce que la RPC a réellement reçu — c'est là qu'est la preuve. */
  appels: [] as Array<{ nom: string; args: any }>,
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (nom: string, args: any) => {
      base.appels.push({ nom, args })
      if (base.erreur) return { data: null, error: base.erreur }
      return { data: base.reponse, error: null }
    },
  }),
}))

const { checkReplayStatusAction } = await import("./check-replay")

beforeEach(() => {
  base.reponse = null
  base.erreur = null
  base.appels = []
  vi.spyOn(console, "error").mockImplementation(() => {})
})

// ───────────────────────────────────────────────── ce qui n'atteint pas la base

describe("l'adresse est validée avant que la base soit touchée", () => {
  it("refuse une adresse malformée sans appeler la RPC", async () => {
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "pas-une-adresse" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("invalid_email")
    expect(base.appels).toHaveLength(0)
  })

  it("refuse une adresse jetable sans appeler la RPC", async () => {
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "test@yopmail.com" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("invalid_email")
    expect(base.appels).toHaveLength(0)
  })

  it("transmet l'adresse normalisée, pas la saisie brute", async () => {
    base.reponse = { replay: false }
    await checkReplayStatusAction({ game_id: JEU, email: "  JOUEUR@Exemple.INVALID  " })
    expect(base.appels[0].args.p_email).toBe("joueur@exemple.invalid")
  })

  it("normalise le téléphone et rend null quand il est absent", async () => {
    base.reponse = { replay: false }
    await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid", phone: "+33 6 12 34 56 78" })
    expect(base.appels[0].args.p_phone).toBe("0612345678")

    base.appels = []
    await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(base.appels[0].args.p_phone).toBeNull()

    base.appels = []
    await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid", phone: "" })
    expect(base.appels[0].args.p_phone).toBeNull()
  })
})

// ───────────────────────────────────────────────── le cœur du correctif

describe("le compteur de participations ne ressort pas", () => {
  it("ne relaie pas play_count, même si la base le rend encore", async () => {
    /* La base ment dans le mauvais sens : c'est exactement l'état d'avant
       la migration 20260819120000. L'action doit tenir seule. */
    base.reponse = { replay: true, status: "ok", play_count: 7, action: "GOOGLE_REVIEW", action_url: "https://exemple.invalid/avis" }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })

    expect(res.ok).toBe(true)
    expect("play_count" in res).toBe(false)
    expect(res.play_count).toBeUndefined()
  })

  it("ne relaie AUCUN champ non nommé — la liste des clés rendues est close", async () => {
    base.reponse = {
      replay: true, status: "ok", action: "GOOGLE_REVIEW", action_url: "https://exemple.invalid/avis",
      /* tout ce qui suit est du bruit que la base pourrait ajouter un jour */
      play_count: 12, email: "victime@exemple.invalid", phone: "0612345678",
      winner_ids: ["x"], internal_note: "secret",
    }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })

    expect(Object.keys(res).sort()).toEqual(["action", "action_url", "ok", "replay", "status"])
  })
})

// ───────────────────────────────────────────────── ce que le joueur doit continuer à recevoir

describe("la fonctionnalité survit au correctif", () => {
  it("laisse passer « trop tôt » et son délai restant", async () => {
    base.reponse = { replay: true, status: "too_soon", hours_left: 22 }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(res).toEqual({ ok: true, replay: true, status: "too_soon", hours_left: 22 })
  })

  it("laisse passer l'action du moment et son lien", async () => {
    base.reponse = { replay: true, status: "ok", action: "INSTAGRAM_FOLLOW", action_url: "https://exemple.invalid/insta" }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(res.status).toBe("ok")
    expect(res.action).toBe("INSTAGRAM_FOLLOW")
    expect(res.action_url).toBe("https://exemple.invalid/insta")
  })

  it("laisse passer un jeu sans rejouabilité", async () => {
    base.reponse = { replay: false }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(res).toEqual({ ok: true, replay: false })
  })

  it("omet action et action_url quand la base les rend nuls, sans les inventer", async () => {
    base.reponse = { replay: true, status: "ok", action: null, action_url: null }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(res.action).toBeUndefined()
    expect(res.action_url).toBeUndefined()
    expect(res.status).toBe("ok")
  })
})

// ───────────────────────────────────────────────── les refus

describe("les refus de la base remontent tels quels", () => {
  it("rend game_not_found quand le jeu n'existe pas", async () => {
    base.reponse = { error: "game_not_found" }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(res).toEqual({ ok: false, error: "game_not_found" })
  })

  it("rend l'échec quand la RPC elle-même échoue", async () => {
    base.erreur = { message: "connexion perdue" }
    const res: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("connexion perdue")
  })
})

// ───────────────────────────────────────────────── le runner négatif

/*
 * Un test vert ne vaut que s'il sait rougir. Ce bloc rejoue l'ANCIENNE
 * projection — `{ ok: true, ...result }` — sur les mêmes réponses de base, et
 * vérifie que les assertions ci-dessus l'auraient bien démasquée.
 *
 * Le fichier métier n'est pas touché : c'est la logique d'avant qui est
 * reproduite ici, pas la vraie qui est dégradée. Dégrader un module joignable
 * publiquement pour éprouver son propre test serait exactement la manœuvre
 * qu'on s'interdit.
 */
describe("runner négatif — les assertions distinguent l'ancienne implémentation", () => {
  const ancienneProjection = (result: any) => ({ ok: true, ...result })

  it("l'ancienne aurait relayé play_count ; l'assertion l'aurait vu", async () => {
    const rendu = { replay: true, status: "ok", play_count: 7, action: "GOOGLE_REVIEW", action_url: "https://exemple.invalid/avis" }

    const ancien: any = ancienneProjection(rendu)
    expect("play_count" in ancien).toBe(true)   // l'ancienne fuit
    expect(ancien.play_count).toBe(7)

    base.reponse = rendu
    const actuel: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect("play_count" in actuel).toBe(false)  // l'actuelle non
  })

  it("l'ancienne n'avait pas de liste de clés close ; l'assertion l'aurait vu", async () => {
    const rendu = {
      replay: true, status: "ok", action: "GOOGLE_REVIEW", action_url: "https://exemple.invalid/avis",
      play_count: 12, email: "victime@exemple.invalid", internal_note: "secret",
    }
    const closes = ["action", "action_url", "ok", "replay", "status"]

    expect(Object.keys(ancienneProjection(rendu)).sort()).not.toEqual(closes)

    base.reponse = rendu
    const actuel: any = await checkReplayStatusAction({ game_id: JEU, email: "j@exemple.invalid" })
    expect(Object.keys(actuel).sort()).toEqual(closes)
  })
})
