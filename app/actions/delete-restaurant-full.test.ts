import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUPPRIMER UN RESTAURANT NE DOIT JAMAIS SUPPRIMER LE MAUVAIS COMPTE
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
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/securite/garde-action", () => ({
  exigerRole: async () => ({ ok: true, appelant: "root-synthetique" }),
  tracerAction: async () => {},
}));

let journal: string[] = [];
/* Réponses simulées, par clé `table:verbe`. */
let reponses: Record<string, { data?: unknown; count?: number | null; error?: { message: string } | null }> = {};
/* Résultat simulé de la primitive commune de suppression de compte. */
let resultatPrimitive: { success: boolean; error?: string } = { success: true };

function clientSimule() {
  return {
    from: (table: string) => {
      const chaine: Record<string, unknown> = {};
      let verbe = "select";
      chaine.select = () => chaine;
      chaine.delete = () => { verbe = "delete"; return chaine; };
      chaine.update = () => { verbe = "update"; return chaine; };
      chaine.eq = () => chaine;
      chaine.limit = () => chaine;
      chaine.then = (r: (v: unknown) => unknown) => {
        const cle = `${table}:${verbe}`;
        journal.push(cle);
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

/* Un restaurant lisible, appartenant à `owner-restaurant`. */
function restaurantLisible() {
  reponses["restaurants:select"] = { data: [{ id: "resto-1", owner_id: "owner-restaurant" }], error: null };
  reponses["profiles:select"] = { data: [{ role: "restaurant" }], error: null };
  reponses["restaurants:delete"] = { error: null };
}

beforeEach(() => {
  journal = [];
  reponses = {};
  resultatPrimitive = { success: true };
  restaurantLisible();
  // Par défaut : le propriétaire ne gère plus aucun autre restaurant.
  reponses["restaurants:select"] = { data: [{ id: "resto-1", owner_id: "owner-restaurant" }], count: 0, error: null };
});

describe("P0 : l'owner se LIT sur le restaurant, il ne se reçoit pas", () => {
  it("un `ownerId` annoncé qui ne correspond pas fait ÉCHOUER l'action", async () => {
    // Le défaut d'origine : l'action supprimait le compte annoncé, sans
    // jamais prouver qu'il appartenait au restaurant.
    const r = await deleteRestaurantFullAction("resto-1", "compte-d-une-autre-personne");
    expect(r.success).toBe(false);
    expect(journal, "aucune suppression ne doit avoir eu lieu").not.toContain("restaurants:delete");
    expect(journal).not.toContain("primitive:suppressionCompte");
  });

  it("un `ownerId` annoncé conforme est accepté", async () => {
    const r = await deleteRestaurantFullAction("resto-1", "owner-restaurant");
    expect(r.success).toBe(true);
  });

  it("sans `ownerId` annoncé, l'action fonctionne quand même — l'owner vient de la ligne", async () => {
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
  });
});

describe("P0 : une panne de lecture ne supprime plus personne", () => {
  it("comptage EN ÉCHEC : le compte est CONSERVÉ, avec un avertissement explicite", async () => {
    // `(count ?? 0) > 0` transformait cette panne en « aucun autre
    // restaurant », donc en suppression de compte.
    reponses["restaurants:select"] = {
      data: [{ id: "resto-1", owner_id: "owner-restaurant" }],
      count: null,
      error: null,
    };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
    expect(journal, "une panne de comptage ne doit jamais supprimer un compte").not.toContain(
      "primitive:suppressionCompte",
    );
    expect(r.avertissement, "l'issue partielle doit être dite").toBeTruthy();
  });

  it("lecture du restaurant EN ÉCHEC : rien n'est supprimé", async () => {
    reponses["restaurants:select"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("restaurants:delete");
  });

  it("restaurant introuvable ou ambigu : refus", async () => {
    reponses["restaurants:select"] = { data: [], error: null };
    expect((await deleteRestaurantFullAction("resto-1")).success).toBe(false);
    journal = [];
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
});

describe("aucun compte root ou commercial ne peut partir par ce chemin", () => {
  for (const role of ["root", "sales", "admin", "owner"]) {
    it(`un propriétaire de rôle « ${role} » n'est jamais supprimé`, async () => {
      reponses["profiles:select"] = { data: [{ role }], error: null };
      const r = await deleteRestaurantFullAction("resto-1");
      expect(r.success).toBe(true);
      expect(journal, "seul un rôle restaurant est éligible").not.toContain("primitive:suppressionCompte");
      expect(r.accountDeleted).toBe(false);
    });
  }
});

describe("le compte survit s'il reste un autre restaurant", () => {
  it("comptage à 1 : restaurant supprimé, compte conservé", async () => {
    reponses["restaurants:select"] = {
      data: [{ id: "resto-1", owner_id: "owner-restaurant" }],
      count: 1,
      error: null,
    };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(true);
    expect(r.accountDeleted).toBe(false);
    expect(journal).not.toContain("primitive:suppressionCompte");
  });
});

describe("issues partielles : jamais un succès silencieux", () => {
  it("suppression du restaurant EN ÉCHEC : échec franc", async () => {
    reponses["restaurants:delete"] = { error: { message: "panne" } };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
  });

  it("suppression du compte EN ÉCHEC : échec explicite, pas un warning", async () => {
    // L'ancienne version répondait `success: true` après un console.warn.
    resultatPrimitive = { success: false, error: "panne Auth" };
    const r = await deleteRestaurantFullAction("resto-1");
    expect(r.success).toBe(false);
    expect((r as { restaurantSupprime?: boolean }).restaurantSupprime, "l'état partiel doit être dit").toBe(true);
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
});
