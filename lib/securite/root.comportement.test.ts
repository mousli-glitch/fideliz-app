import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Tests de COMPORTEMENT, par opposition au scanner lexical qui vérifie
 * seulement qu'aucun UUID ne réapparaît. Un scanner ne dit rien de ce qui
 * arrive quand la base répond mal — et c'est précisément là que se logent les
 * décisions dangereuses.
 */

vi.mock("server-only", () => ({}));

let reponse: { data: unknown; error: unknown } = { data: [], error: null };
const appels: string[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => {
      appels.push(t);
      const chaine: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) {
        chaine[m] = () => chaine;
      }
      // La chaîne est « thenable » : await la résout sur la réponse simulée.
      chaine.then = (r: (v: unknown) => unknown) => Promise.resolve(reponse).then(r);
      return chaine;
    },
  }),
}));

const { resoudreRootHeritier, cibleEstProtegee } = await import("./root");

beforeEach(() => { appels.length = 0; reponse = { data: [], error: null }; });

describe("resoudreRootHeritier", () => {
  it("rend le root quand la lecture réussit", async () => {
    reponse = { data: [{ id: "r-1" }], error: null };
    expect(await resoudreRootHeritier()).toEqual({ ok: true, rootId: "r-1" });
  });

  it("aucun root : refuse avec la cause « aucun_root »", async () => {
    reponse = { data: [], error: null };
    expect(await resoudreRootHeritier()).toEqual({ ok: false, cause: "aucun_root" });
  });

  it("erreur de base : refuse, et NE la confond PAS avec « aucun root »", async () => {
    reponse = { data: null, error: { message: "connexion perdue" } };

    const r = await resoudreRootHeritier();

    expect(r).toEqual({ ok: false, cause: "erreur_lecture" });
    // La distinction est le cœur du test : confondre les deux ferait attribuer
    // des restaurants au hasard le jour où la base hoquette.
    expect(r).not.toEqual({ ok: false, cause: "aucun_root" });
  });

  it("plusieurs roots : le choix est déterministe et borné à un seul", async () => {
    reponse = { data: [{ id: "r-ancien" }], error: null };
    expect(await resoudreRootHeritier()).toEqual({ ok: true, rootId: "r-ancien" });
  });
});

describe("cibleEstProtegee", () => {
  it("la cible EST root : protégée", async () => {
    reponse = { data: [{ role: "root" }], error: null };
    expect(await cibleEstProtegee("u-1")).toBe(true);
  });

  it("la cible est un commercial : non protégée", async () => {
    reponse = { data: [{ role: "sales" }], error: null };
    expect(await cibleEstProtegee("u-1")).toBe(false);
  });

  it("profil introuvable : protégée — on ne supprime pas ce qu'on ne sait pas lire", async () => {
    reponse = { data: [], error: null };
    expect(await cibleEstProtegee("u-1")).toBe(true);
  });

  it("profil ambigu (plusieurs lignes) : protégée", async () => {
    reponse = { data: [{ role: "sales" }, { role: "root" }], error: null };
    expect(await cibleEstProtegee("u-1")).toBe(true);
  });

  it("erreur de lecture : protégée", async () => {
    reponse = { data: null, error: { message: "timeout" } };
    expect(await cibleEstProtegee("u-1")).toBe(true);
  });

  it("identifiant vide : protégée, sans interroger la base", async () => {
    expect(await cibleEstProtegee("")).toBe(true);
    expect(appels).toEqual([]);
  });

  it("la décision se prend AVANT toute écriture : seule `profiles` est lue", async () => {
    reponse = { data: [{ role: "sales" }], error: null };
    await cibleEstProtegee("u-1");
    expect(appels).toEqual(["profiles"]);
  });
});
