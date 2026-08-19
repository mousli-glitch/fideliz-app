/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LES 1 513 AVIS — QUI PEUT LES LIRE, ET LESQUELS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `avis` porte RLS **sans aucune policy** : personne n'y accède hors
 * `service_role`. C'est correct — et c'est précisément pourquoi rien ne
 * vérifiait que la lecture APPLICATIVE continue de fonctionner. La table est
 * fermée, la clé de service ouvre tout, et entre les deux il n'y a qu'une
 * garde. Si la fusion la contourne, personne ne s'en aperçoit : les avis
 * s'affichent, simplement pas les bons.
 *
 * Ces tests exercent `getStoredReviews` **de bout en bout** — la vraie garde,
 * la vraie résolution de tenant, la vraie requête — avec une fausse base.
 * Rien n'est remplacé par un mannequin sauf le transport.
 *
 * ─── CE QU'ILS REGARDENT, ET QUI COMPTE PLUS QUE LE RÉSULTAT ───
 *
 * La fausse base ENREGISTRE LES FILTRES appliqués. Un test qui se contente de
 * compter les avis rendus passerait au vert si la borne de tenant disparaissait
 * un jour où le jeu de données ne contient qu'un restaurant. On vérifie donc
 * que `restaurant_id` est bel et bien filtré, à chaque lecture.
 *
 * La base est fausse, jamais clonée depuis la production : aucun avis réel,
 * aucun auteur réel, aucun identifiant réel.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ───────────────────────────────────────────────── le décor

const RESTO_A = "aaaaaaaa-0000-4000-8000-00000000000a"
const RESTO_B = "bbbbbbbb-0000-4000-8000-00000000000b"

const GERANT_A = { id: "1111aaaa-0000-4000-8000-000000000001", email: "gerant-a@exemple.invalid" }
const GERANT_B = { id: "2222bbbb-0000-4000-8000-000000000002", email: "gerant-b@exemple.invalid" }
const ROOT = { id: "3333cccc-0000-4000-8000-000000000003", email: "root@exemple.invalid" }
const SANS_RATTACHEMENT = { id: "4444dddd-0000-4000-8000-000000000004", email: "seul@exemple.invalid" }

type Ligne = Record<string, unknown>

const base = {
  session: null as { id: string; email: string } | null,

  profils: new Map<string, Ligne>([
    [GERANT_A.id, { role: "restaurant", restaurant_id: RESTO_A, is_active: true }],
    [GERANT_B.id, { role: "restaurant", restaurant_id: RESTO_B, is_active: true }],
    [ROOT.id, { role: "root", restaurant_id: null, is_active: true }],
    [SANS_RATTACHEMENT.id, { role: "restaurant", restaurant_id: null, is_active: true }],
  ]),

  restaurants: new Map<string, Ligne>([
    [RESTO_A, { id: RESTO_A, slug: "resto-a", google_reviews_avg: 4.5, google_reviews_total: 2, google_reviews_synced_at: "2026-08-19T00:00:00Z" }],
    [RESTO_B, { id: RESTO_B, slug: "resto-b", google_reviews_avg: 3.1, google_reviews_total: 1, google_reviews_synced_at: null }],
  ]),

  avis: [
    { restaurant_id: RESTO_A, review_id: "a-1", author: "Client A1", rating: 5, comment: "Excellent",  review_created_at: "2026-08-02", google_reply: null, ai_draft: null, photo: null },
    { restaurant_id: RESTO_A, review_id: "a-2", author: "Client A2", rating: 4, comment: "Très bien",  review_created_at: "2026-08-01", google_reply: null, ai_draft: "brouillon", photo: null },
    { restaurant_id: RESTO_B, review_id: "b-1", author: "Client B1", rating: 3, comment: "Correct",    review_created_at: "2026-08-03", google_reply: null, ai_draft: null, photo: null },
  ] as Ligne[],

  /* Ce que la fausse base a VU passer : la borne de tenant se prouve ici. */
  filtres: [] as Array<{ table: string; colonne: string; valeur: unknown }>,
  journal: [] as Ligne[],
}

function table(nom: string) {
  const conditions: Ligne = {}
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    insert: async (l: Ligne) => { if (nom === "system_logs" || nom === "activity_logs") base.journal.push(l); return { error: null } },
    eq: (colonne: string, valeur: unknown) => {
      conditions[colonne] = valeur
      base.filtres.push({ table: nom, colonne, valeur })
      return api
    },
    maybeSingle: async () => ({ data: resoudreUn(nom, conditions), error: null }),
    single: async () => ({ data: resoudreUn(nom, conditions), error: null }),
    then: (resoudre: (v: unknown) => unknown) =>
      Promise.resolve({ data: resoudrePlusieurs(nom, conditions), error: null }).then(resoudre),
  }
  return api
}

function resoudreUn(nom: string, c: Ligne): Ligne | null {
  if (nom === "profiles") return base.profils.get(String(c.id)) ?? null
  if (nom === "restaurants") {
    if (c.id) return base.restaurants.get(String(c.id)) ?? null
    if (c.slug) return [...base.restaurants.values()].find((r) => r.slug === c.slug) ?? null
  }
  return null
}

function resoudrePlusieurs(nom: string, c: Ligne): Ligne[] {
  if (nom === "avis") {
    return base.avis.filter((a) =>
      Object.entries(c).every(([colonne, valeur]) => a[colonne] === valeur))
  }
  return []
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (n: string) => table(n) }),
}))

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: base.session } }) },
    from: (n: string) => table(n),
  }),
}))

const { getStoredReviews } = await import("./google-business")

beforeEach(() => {
  base.session = GERANT_A
  base.filtres = []
  base.journal = []
  vi.stubEnv("CRON_SECRET", "secret-de-test-suffisamment-long")
})

const identifiants = (r: any) => (r.reviews ?? []).map((a: any) => a.id).sort()
const filtreTenant = () => base.filtres.filter((f) => f.table === "avis" && f.colonne === "restaurant_id")

// ═══════════════════════════════════════════════════════════════════════════

describe("chacun lit ses avis, et seulement les siens", () => {
  it("le gérant de A obtient les avis de A", async () => {
    const r: any = await getStoredReviews(RESTO_A)
    expect(r.success).toBe(true)
    expect(identifiants(r)).toEqual(["a-1", "a-2"])
  })

  /*
   * LA BORNE, PAS SEULEMENT LE RÉSULTAT. Compter deux avis ne prouve rien :
   * un jeu de données à un seul restaurant donnerait le même compte sans
   * aucun filtre. On exige que `restaurant_id` ait été filtré, sur la valeur
   * du tenant autorisé.
   */
  it("la lecture est bornée au tenant, et on le vérifie sur le filtre appliqué", async () => {
    await getStoredReviews(RESTO_A)
    expect(filtreTenant()).toEqual([{ table: "avis", colonne: "restaurant_id", valeur: RESTO_A }])
  })

  it("le gérant de A n'obtient RIEN de B, et l'action refuse", async () => {
    const r: any = await getStoredReviews(RESTO_B)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/n'est pas le vôtre/i)
    expect(r.reviews).toBeUndefined()
  })

  /* Le refus doit tomber AVANT toute lecture : rien ne doit être interrogé. */
  it("un refus ne lit aucun avis du tout", async () => {
    await getStoredReviews(RESTO_B)
    expect(filtreTenant()).toEqual([])
  })

  it("le gérant de B obtient les avis de B", async () => {
    base.session = GERANT_B
    const r: any = await getStoredReviews(RESTO_B)
    expect(r.success).toBe(true)
    expect(identifiants(r)).toEqual(["b-1"])
  })

  it("root lit les avis de n'importe quel restaurant", async () => {
    base.session = ROOT
    const a: any = await getStoredReviews(RESTO_A)
    const b: any = await getStoredReviews(RESTO_B)
    expect(identifiants(a)).toEqual(["a-1", "a-2"])
    expect(identifiants(b)).toEqual(["b-1"])
  })

  it("un compte sans rattachement n'obtient rien", async () => {
    base.session = SANS_RATTACHEMENT
    const r: any = await getStoredReviews(RESTO_A)
    expect(r.success).toBe(false)
  })

  it("sans session, c'est non", async () => {
    base.session = null
    const r: any = await getStoredReviews(RESTO_A)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/connexion/i)
  })
})

describe("le chemin cron se prouve par un secret, jamais par l'absence de session", () => {
  it("le bon secret ouvre la lecture, sans aucune session", async () => {
    base.session = null
    const r: any = await getStoredReviews(RESTO_B, { cron: "secret-de-test-suffisamment-long" })
    expect(r.success).toBe(true)
    expect(identifiants(r)).toEqual(["b-1"])
  })

  /*
   * `appel` est un PARAMÈTRE d'une Server Action : il vient du navigateur.
   * Un visiteur peut donc se déclarer « cron ». Sans le secret, c'est non —
   * et c'est bien le secret qui décide, pas l'absence de session.
   */
  it("un mauvais secret est refusé, même en se déclarant cron", async () => {
    base.session = null
    const r: any = await getStoredReviews(RESTO_B, { cron: "pas-le-bon-secret-du-tout" })
    expect(r.success).toBe(false)
    expect(filtreTenant()).toEqual([])
  })

  it("un secret vide ne passe pas non plus", async () => {
    base.session = null
    for (const tentative of ["", " ", "secret-de-test-suffisamment-lon"]) {
      base.filtres = []
      const r: any = await getStoredReviews(RESTO_B, { cron: tentative })
      expect(r.success, `« ${tentative} » a été accepté`).toBe(false)
    }
  })

  it("sans CRON_SECRET configuré, le chemin cron est fermé", async () => {
    vi.stubEnv("CRON_SECRET", "")
    base.session = null
    const r: any = await getStoredReviews(RESTO_B, { cron: "n'importe quoi" })
    expect(r.success).toBe(false)
  })

  /*
   * UN UTILISATEUR CONNECTÉ NE SE FAIT PAS PASSER POUR LE CRON. Le gérant de
   * A, parfaitement authentifié, se déclare cron pour lire B : il lui manque
   * le secret, donc non. Sans cette séparation, une session valide deviendrait
   * un passe-partout inter-tenant.
   */
  it("un gérant connecté ne peut pas emprunter le chemin cron", async () => {
    base.session = GERANT_A
    const r: any = await getStoredReviews(RESTO_B, { cron: "tentative" })
    expect(r.success).toBe(false)
    expect(filtreTenant()).toEqual([])
  })
})

describe("les gardes savent mordre", () => {
  /*
   * Une suite verte ne prouve rien tant qu'on n'a pas montré qu'elle sait
   * refuser. Ici on ne dégrade pas le code : on montre que le jeu de données
   * DISTINGUE bien les deux tenants — sans quoi toutes les assertions
   * ci-dessus passeraient même sans borne.
   */
  it("le jeu de données distingue réellement les deux tenants", () => {
    const deA = base.avis.filter((a) => a.restaurant_id === RESTO_A)
    const deB = base.avis.filter((a) => a.restaurant_id === RESTO_B)
    expect(deA.length).toBeGreaterThan(0)
    expect(deB.length).toBeGreaterThan(0)
    expect(deA.map((a) => a.review_id)).not.toEqual(deB.map((a) => a.review_id))
  })

  it("sans borne de tenant, la lecture rendrait les avis des deux", () => {
    const sansBorne = base.avis.map((a) => a.review_id).sort()
    expect(sansBorne).toEqual(["a-1", "a-2", "b-1"])
    expect(sansBorne).not.toEqual(["a-1", "a-2"])
  })
})

describe("ce que la lecture rend au-delà des avis", () => {
  it("la moyenne et le total viennent du restaurant, pas d'un comptage", async () => {
    const r: any = await getStoredReviews(RESTO_A)
    expect(r.avg).toBe(4.5)
    expect(r.total).toBe(2)
    expect(r.syncedAt).toBe("2026-08-19T00:00:00Z")
  })

  it("un avis sans texte reste lisible", async () => {
    base.avis.push({ restaurant_id: RESTO_A, review_id: "a-3", author: null, rating: 0, comment: null, review_created_at: "2026-07-30", google_reply: null, ai_draft: null, photo: null })
    const r: any = await getStoredReviews(RESTO_A)
    const sansTexte = r.reviews.find((a: any) => a.id === "a-3")
    expect(sansTexte.comment).toBe("(Avis sans texte)")
    expect(sansTexte.author).toBe("Client Google")
    base.avis = base.avis.filter((a) => a.review_id !== "a-3")
  })
})
