import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUPPRIMER UN RESTAURANT : NI LE MAUVAIS COMPTE, NI UNE OPÉRATION PERDUE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce chemin `service_role` contournait toutes les garanties construites pour
 * les deux autres suppressions — il n'avait aucun test. Quatre défauts
 * vérifiés dans le code avant correction :
 *
 *   1. `ownerId` arrivait de l'appelant, sans qu'on prouve jamais qu'il
 *      appartenait au restaurant supprimé.
 *   2. `(count ?? 0) > 0` : un comptage EN ÉCHEC donnait `null`, donc
 *      « aucun autre restaurant », donc suppression du compte. Une panne de
 *      lecture supprimait un compte.
 *   3. L'erreur de lecture du profil était ignorée.
 *   4. Les erreurs profil/Auth devenaient des warnings, et l'action
 *      répondait `success: true` sur un état partiel.
 *
 * ─── ET LE DÉFAUT SUIVANT, SIGNALÉ LE 19/08/2026 ───
 *
 * Le premier correctif annonçait les issues partielles au lieu de les taire.
 * C'était mieux, et insuffisant : il les annonçait sans les rendre
 * RATTRAPABLES. Le restaurant était déjà supprimé, donc au second appel plus
 * aucune lecture ne retrouvait le propriétaire. « L'appel est rejouable »
 * était faux.
 *
 * D'où les deux tests qui comptent ici : la panne de comptage n'entre plus
 * dans la partie destructive du tout, et l'échec de la suppression de compte
 * laisse une INTENTION que le second appel reprend — sans jamais redemander
 * le propriétaire à l'appelant.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/securite/garde-action", () => ({
  exigerRole: async () => ({ ok: true, appelant: { userId: "root-synthetique" } }),
  tracerAction: async () => {},
}));

let journal: string[] = [];
/* Charges utiles écrites, par clé, pour vérifier CE qui est enregistré. */
let ecritures: { cle: string; payload?: unknown }[] = [];
/* Réponses simulées, par clé `table:verbe`. */
let reponses: Record<string, { data?: unknown; count?: number | null; error?: { message: string } | null }> = {};
/* Résultat simulé de la primitive commune de suppression de compte. */
let resultatPrimitive: { success: boolean; error?: string; idempotent?: boolean } = { success: true };

function clientSimule() {
  return {
    from: (table: string) => {
      const chaine: Record<string, unknown> = {};
      let verbe = "select";
      let payload: unknown;
      chaine.select = () => chaine;
      chaine.delete = () => { verbe = "delete"; return chaine; };
      chaine.update = (v: unknown) => { verbe = "update"; payload = v; return chaine; };
      chaine.upsert = (v: unknown) => { verbe = "upsert"; payload = v; return chaine; };
      chaine.eq = () => chaine;
      chaine.limit = () => chaine;
      chaine.then = (r: (v: unknown) => unknown) => {
        const cle = `${table}:${verbe}`;
        journal.push(cle);
        ecritures.push({ cle, payload });
        const rep = reponses[cle] ?? { data: [], error: null };
        return Promise.resolve({ data: rep.data ?? [], count: rep.count, error: rep.error ?? null }).then(r);
      };
      return chaine;
    },
    auth: { admin: { deleteUser: async () => { journal.push("auth:deleteUser"); return { error: null }; } } },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => clientSimule() }));
vi.mock("@/lib/securite/suppression-compte", () => ({
  supprimerCompteEtReattribuer: async () => {
    journal.push("primitive:suppressionCompte");
    return resultatPrimitive;
  },
}));

const { deleteRestaurantFullAction } = await import("./delete-restaurant-full");

/** Le cas nominal : restaurant lisible, propriétaire restaurateur, seul restaurant. */
function nominal() {
  reponses["suppressions_restaurant:select"] = { data: [], error: null };
  reponses["suppressions_restaurant:upsert"] = { error: null };
  reponses["suppressions_restaurant:update"] = { error: null };
  reponses["restaurants:select"] = {
    data: [{ id: "resto-1", owner_id: "owner-restaurant" }],
    count: 1,                      // ce restaurant est le SEUL du propriétaire
    error: null,
  };
  reponses["profiles:select"] = { data: [{ role: "restaurant" }], error: null };
  reponses["restaurants:delete"] = { error: null };
}

beforeEach(() => {
  journal = [];
  ecritures = [];
  reponses = {};
  resultatPrimitive = { success: true };
  nominal();
});

describe("P0 : l'owner se LIT sur le restaurant, il ne se reçoit pas", () => {
  it("un `ownerId` annoncé qui ne correspond pas fait ÉCHOUER l'action", async () => {
    const r = await deleteRestaurantFullAction("resto-1", "compte-d-une-autre-personne");
    expect(r.success).toBe(false);
    expect(journal, "aucune suppression ne doit avoir eu lieu").not.toContain("restaurants:delete");
    expect(journal).not.toContain("primitive:suppressionCompte");
  });

  it("un `ownerId` annoncé conforme est accepté", async () => {
    expect((await deleteRestaurantFullAction("resto-1", "owner-restaurant")).success).toBe(true);
  });

  it("sans `ownerId` annoncé, l'action fonctionne — l'owner vient de la ligne", async () => {
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(true);
  });

  it("l'intention enregistre l'owner LU, jamais celui reçu", async () => {
    await deleteRestaurantFullAction("resto-1", "owner-restaurant");
    const intention = ecritures.find((e) => e.cle === "suppressions_restaurant:upsert");
    expect(intention?.payload).toMatchObject({ owner_id: "owner-restaurant", owner_role: "restaurant" });
  });
});

describe("P0 : aucune lecture faillible ne survit à l'irréversible", () => {
  it("comptage EN ÉCHEC : l'opération est annulée AVANT toute suppression", async () => {
    /*
     * L'ancienne version supprimait le restaurant puis découvrait qu'elle ne
     * savait pas compter, et laissait un état partiel irrattrapable. Le
     * comptage a désormais lieu avant : sa panne n'a rien à rattraper.
     */
    reponses["restaurants:select"] = {
      data: [{ id: "resto-1", owner_id: "owner-restaurant" }],
      count: null,
      error: null,
    };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal, "rien ne doit avoir été détruit").not.toContain("restaurants:delete");
    expect(journal).not.toContain("primitive:suppressionCompte");
  });

  it("lecture du restaurant EN ÉCHEC : rien n'est supprimé", async () => {
    reponses["restaurants:select"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("restaurants:delete");
  });

  it("restaurant ambigu : refus", async () => {
    reponses["restaurants:select"] = {
      data: [{ id: "resto-1", owner_id: "a" }, { id: "resto-1", owner_id: "b" }],
      error: null,
    };
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(false);
    expect(journal).not.toContain("restaurants:delete");
  });

  it("lecture du profil EN ÉCHEC : rien n'est supprimé", async () => {
    reponses["profiles:select"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("restaurants:delete");
  });

  it("profil propriétaire absent ou ambigu : refus", async () => {
    reponses["profiles:select"] = { data: [], error: null };
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(false);
    reponses["profiles:select"] = { data: [{ role: "restaurant" }, { role: "sales" }], error: null };
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(false);
  });

  it("intention illisible : refus, avant toute destruction", async () => {
    reponses["suppressions_restaurant:select"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).toEqual(["suppressions_restaurant:select"]);
  });

  it("intention IMPOSSIBLE À ÉCRIRE : on n'entre pas dans la partie destructive", async () => {
    // Une opération dont on ne saurait pas retrouver le propriétaire ne doit
    // pas commencer.
    reponses["suppressions_restaurant:upsert"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("restaurants:delete");
  });

  it("l'intention est écrite AVANT la suppression, jamais après", async () => {
    await deleteRestaurantFullAction("resto-1");
    expect(journal.indexOf("suppressions_restaurant:upsert")).toBeLessThan(
      journal.indexOf("restaurants:delete"),
    );
  });
});

describe("la reprise : le restaurant a disparu, l'opération non", () => {
  /** Le monde d'après une suppression interrompue. */
  function apresInterruption(compteASupprimer = true) {
    reponses["restaurants:select"] = { data: [], error: null };   // le restaurant est parti
    reponses["suppressions_restaurant:select"] = {
      data: [{
        restaurant_id: "resto-1",
        owner_id: "owner-restaurant",
        owner_role: "restaurant",
        compte_a_supprimer: compteASupprimer,
        etape: "restaurant_supprime",
      }],
      error: null,
    };
  }

  it("restaurant absent AVEC intention : la reprise aboutit", async () => {
    apresInterruption();
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
    expect((r as { reprise?: boolean }).reprise).toBe(true);
    expect(journal).toContain("primitive:suppressionCompte");
  });

  it("la reprise ne redemande RIEN à l'appelant — même un owner faux est ignoré", async () => {
    apresInterruption();
    const r = await deleteRestaurantFullAction("resto-1", "compte-d-une-autre-personne");
    expect(r.success, "l'owner vient de l'intention, pas du paramètre").toBe(true);
  });

  it("restaurant absent SANS intention : refus, on ne devine pas une opération", async () => {
    reponses["restaurants:select"] = { data: [], error: null };
    reponses["suppressions_restaurant:select"] = { data: [], error: null };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("primitive:suppressionCompte");
  });

  it("une intention à l'étape « intention » se reprend aussi", async () => {
    /*
     * Le cas où la mise à jour de l'étape a échoué après la suppression. En
     * faire une condition de reprise rouvrirait l'impasse qu'on ferme.
     */
    apresInterruption();
    (reponses["suppressions_restaurant:select"]!.data as { etape: string }[])[0].etape = "intention";
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(true);
  });

  it("intention DÉJÀ terminée : succès idempotent, rien n'est retouché", async () => {
    reponses["suppressions_restaurant:select"] = {
      data: [{
        restaurant_id: "resto-1", owner_id: "owner-restaurant", owner_role: "restaurant",
        compte_a_supprimer: true, etape: "termine",
      }],
      error: null,
    };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
    expect((r as { idempotent?: boolean }).idempotent).toBe(true);
    expect(journal).toEqual(["suppressions_restaurant:select"]);
  });

  it("intentions multiples pour un même restaurant : refus", async () => {
    reponses["suppressions_restaurant:select"] = {
      data: [{ restaurant_id: "resto-1" }, { restaurant_id: "resto-1" }],
      error: null,
    };
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(false);
  });

  it("double appel nominal : le second ne détruit rien de plus", async () => {
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(true);

    journal = [];
    reponses["suppressions_restaurant:select"] = {
      data: [{
        restaurant_id: "resto-1", owner_id: "owner-restaurant", owner_role: "restaurant",
        compte_a_supprimer: true, etape: "termine",
      }],
      error: null,
    };
    const second = await deleteRestaurantFullAction("resto-1");
    expect(second.success).toBe(true);
    expect(journal).toEqual(["suppressions_restaurant:select"]);
  });
});

describe("échecs de la primitive : l'opération reste reprenable", () => {
  it("échec avant Auth : issue partielle explicite, et marquée reprenable", async () => {
    resultatPrimitive = { success: false, error: "réattribution échouée" };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect((r as { restaurantSupprime?: boolean }).restaurantSupprime).toBe(true);
    expect((r as { reprenable?: boolean }).reprenable).toBe(true);
    // L'intention n'est PAS clôturée : c'est elle qui permettra la reprise.
    expect(journal.filter((c) => c === "suppressions_restaurant:update")).toHaveLength(1);
  });

  it("issue Auth AMBIGUË : échec, et l'intention reste ouverte", async () => {
    resultatPrimitive = { success: false, error: "issue indéterminée" };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect((r as { reprenable?: boolean }).reprenable).toBe(true);
  });

  it("puis la reprise aboutit une fois la panne passée", async () => {
    resultatPrimitive = { success: false, error: "panne" };
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(false);

    journal = [];
    resultatPrimitive = { success: true };
    reponses["restaurants:select"] = { data: [], error: null };
    reponses["suppressions_restaurant:select"] = {
      data: [{
        restaurant_id: "resto-1", owner_id: "owner-restaurant", owner_role: "restaurant",
        compte_a_supprimer: true, etape: "restaurant_supprime",
      }],
      error: null,
    };
    const second = await deleteRestaurantFullAction("resto-1");
    expect(second.success).toBe(true);
    expect(journal).toContain("primitive:suppressionCompte");
  });

  it("suppression du restaurant EN ÉCHEC : échec franc, intention ouverte", async () => {
    reponses["restaurants:delete"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("primitive:suppressionCompte");
  });

  it("primitive idempotente : succès, mais `accountDeleted` reste faux", async () => {
    // Le compte était déjà parti : ne pas l'annoncer comme supprimé ici.
    resultatPrimitive = { success: true, idempotent: true };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
    expect((r as { accountDeleted?: boolean }).accountDeleted).toBe(false);
  });
});

describe("aucun compte root ou commercial ne peut partir par ce chemin", () => {
  for (const role of ["root", "sales", "admin", "owner"]) {
    it(`un propriétaire de rôle « ${role} » n'est jamais supprimé`, async () => {
      reponses["profiles:select"] = { data: [{ role }], error: null };
      const r = await deleteRestaurantFullAction("resto-1");
      expect(r.success).toBe(true);
      expect(journal, "seul un rôle restaurant est éligible").not.toContain("primitive:suppressionCompte");
      expect((r as { accountDeleted?: boolean }).accountDeleted).toBe(false);
    });
  }

  it("un rôle non-restaurant n'est même pas compté : aucune décision à prendre", async () => {
    reponses["profiles:select"] = { data: [{ role: "sales" }], error: null };
    await deleteRestaurantFullAction("resto-1");
    const intention = ecritures.find((e) => e.cle === "suppressions_restaurant:upsert");
    expect(intention?.payload).toMatchObject({ compte_a_supprimer: false });
  });
});

describe("le compte survit s'il reste un autre restaurant", () => {
  it("le propriétaire en a DEUX : restaurant supprimé, compte conservé", async () => {
    reponses["restaurants:select"] = {
      data: [{ id: "resto-1", owner_id: "owner-restaurant" }],
      count: 2,
      error: null,
    };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
    expect((r as { accountDeleted?: boolean }).accountDeleted).toBe(false);
    expect(journal).not.toContain("primitive:suppressionCompte");
  });

  it("et l'intention l'enregistre : la reprise ne changera pas d'avis", async () => {
    reponses["restaurants:select"] = {
      data: [{ id: "resto-1", owner_id: "owner-restaurant" }],
      count: 2,
      error: null,
    };
    await deleteRestaurantFullAction("resto-1");
    const intention = ecritures.find((e) => e.cle === "suppressions_restaurant:upsert");
    expect(intention?.payload).toMatchObject({ compte_a_supprimer: false });
  });
});

describe("l'ordre des opérations", () => {
  it("le rôle est lu AVANT la suppression du restaurant", async () => {
    await deleteRestaurantFullAction("resto-1");
    expect(journal.indexOf("profiles:select")).toBeLessThan(journal.indexOf("restaurants:delete"));
  });

  it("la primitive commune est utilisée — `deleteUser` n'est pas dupliqué ici", async () => {
    await deleteRestaurantFullAction("resto-1");
    expect(journal).toContain("primitive:suppressionCompte");
    expect(journal, "dupliquer deleteUser rouvrirait tous les défauts corrigés").not.toContain("auth:deleteUser");
  });

  it("l'intention est clôturée en fin d'opération réussie", async () => {
    await deleteRestaurantFullAction("resto-1");
    const cloture = ecritures.filter((e) => e.cle === "suppressions_restaurant:update").pop();
    expect(cloture?.payload).toMatchObject({ etape: "termine" });
  });
});
