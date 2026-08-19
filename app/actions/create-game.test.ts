import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRÉER UN JEU — UN SEUL ACTE, ET AUCUNE COERCITION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `createGameAction` n'avait AUCUN test. Elle faisait cinq requêtes séparées à
 * la clé de service, plusieurs erreurs non lues, et re-résolvait le restaurant
 * depuis `data.slug` — une valeur du NAVIGATEUR — alors que la garde l'avait
 * déjà résolu ET autorisé.
 *
 * Un échec tardif laissait donc les anciens jeux TERMINÉS sans qu'un nouveau
 * soit créé : un restaurant sans jeu, et son QR imprimé qui ne mène nulle
 * part.
 *
 * Ces tests portent sur ce que le TypeScript peut garantir. L'atomicité, la
 * validation et l'isolation sont prouvées par
 * `supabase/verifications/harnais-creation-jeu.sql`, joué sur base réelle :
 * un test unitaire ne peut pas prouver une transaction.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let garde: unknown = {
  ok: true,
  appelant: { userId: "root-synthetique" },
  restaurant: { id: "resto-autorise", slug: "resto-autorise" },
};
let journal: { cle: string; payload?: unknown }[] = [];
let echecs: Record<string, { message: string }> = {};

vi.mock("@/lib/securite/garde-action", () => ({
  exigerRestaurantParSlug: async () => garde,
  tracerAction: async () => {},
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (nom: string, params: unknown) => {
      journal.push({ cle: `rpc:${nom}`, payload: params });
      return { data: { game_id: "jeu-cree" }, error: echecs[`rpc:${nom}`] ?? null };
    },
    from: (t: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "insert", "update", "delete", "eq", "single"]) c[m] = () => c;
      c.then = (r: (v: unknown) => unknown) => {
        journal.push({ cle: `${t}:direct` });
        return Promise.resolve({ data: null, error: null }).then(r);
      };
      return c;
    },
  }),
}));

const { createGameAction } = await import("./create-game");

const CHARGE = {
  slug: "resto-autorise",
  form: { name: "Mon jeu", active_action: "wheel", action_url: "https://exemple.invalid", validity_days: 7 },
  design: { primary_color: "#000000" },
  prizes: [{ label: "L1", weight: 60, quantity: null }, { label: "L2", weight: 40, quantity: null }],
};

beforeEach(() => {
  journal = [];
  echecs = {};
  garde = { ok: true, appelant: { userId: "root-synthetique" }, restaurant: { id: "resto-autorise", slug: "resto-autorise" } };
});

const appel = () => journal.find((o) => o.cle === "rpc:creer_jeu_et_lots")?.payload as
  | { p_restaurant_id: string; p_jeu: Record<string, unknown>; p_lots: unknown[]; p_restaurant: Record<string, unknown> }
  | undefined;

describe("le tenant vient de la garde, jamais du navigateur", () => {
  it("le restaurant transmis est celui RÉSOLU par la garde", async () => {
    await createGameAction({ ...CHARGE, slug: "slug-annonce-par-le-navigateur" });
    expect(appel()?.p_restaurant_id).toBe("resto-autorise");
  });

  it("le restaurant n'est PAS re-résolu depuis le slug", async () => {
    await createGameAction(CHARGE);
    expect(journal.map((o) => o.cle), "aucune lecture directe de restaurants")
      .not.toContain("restaurants:direct");
  });

  it("garde refusée : rien n'est tenté", async () => {
    garde = { ok: false, error: "Ce restaurant n'est pas le vôtre." };
    expect((await createGameAction(CHARGE)).success).toBe(false);
    expect(journal).toEqual([]);
  });

  it("restaurant non résolu : refus, pas de création à l'aveugle", async () => {
    garde = { ok: true, appelant: { userId: "root" } };
    expect((await createGameAction(CHARGE)).success).toBe(false);
    expect(journal).toEqual([]);
  });
});

describe("un seul acte", () => {
  it("tout part dans UN appel : design, jeu, lots", async () => {
    await createGameAction(CHARGE);
    expect(journal.filter((o) => o.cle.startsWith("rpc:"))).toHaveLength(1);
    expect(appel()?.p_lots).toHaveLength(2);
    expect(appel()?.p_restaurant).toBeTruthy();
  });

  it("aucune écriture directe hors de la transaction", async () => {
    await createGameAction(CHARGE);
    expect(journal.map((o) => o.cle).filter((c) => c.endsWith(":direct"))).toEqual([]);
  });

  it("refus : échec franc, jamais un succès silencieux", async () => {
    echecs["rpc:creer_jeu_et_lots"] = { message: "Le total des poids doit valoir 100 %" };
    const r = await createGameAction(CHARGE);
    expect(r.success).toBe(false);
    expect(r.error).toContain("100");
  });
});

describe("ne jamais convertir avant de valider", () => {
  for (const saisie of ["abc", "NaN", "Infinity", "-3", "5.5", "1e3", "5abc"]) {
    it(`poids « ${saisie} » part TEL QUEL`, async () => {
      await createGameAction({ ...CHARGE, prizes: [{ label: "L", weight: saisie, quantity: null }] });
      expect((appel()?.p_lots as { weight: unknown }[])[0].weight).toBe(saisie);
    });

    it(`montant « ${saisie} » part TEL QUEL`, async () => {
      await createGameAction({ ...CHARGE, form: { ...CHARGE.form, min_spend: saisie } });
      expect(appel()?.p_jeu.min_spend).toBe(saisie);
    });
  }

  it("aucune valeur invalide n'est convertie en 0 ou null avant l'appel", async () => {
    for (const saisie of ["abc", "-3", "NaN"]) {
      journal = [];
      await createGameAction({
        ...CHARGE,
        form: { ...CHARGE.form, is_stock_limit_active: true },
        prizes: [{ label: "L", weight: 100, quantity: saisie }],
      });
      const q = (appel()?.p_lots as { quantity: unknown }[])[0].quantity;
      expect(q, "un null ici voudrait dire « illimité »").not.toBeNull();
      expect(q).toBe(saisie);
    }
  });

  it("limite de stock inactive : tous les stocks partent à null", async () => {
    await createGameAction({
      ...CHARGE,
      form: { ...CHARGE.form, is_stock_limit_active: false },
      prizes: [{ label: "L", weight: 100, quantity: 5 }],
    });
    expect((appel()?.p_lots as { quantity: unknown }[])[0].quantity).toBeNull();
  });

  it("saisie vide : null — « rien de saisi », pas « zéro »", async () => {
    for (const vide of ["", "   ", null, undefined]) {
      journal = [];
      await createGameAction({ ...CHARGE, form: { ...CHARGE.form, min_spend: vide } });
      expect(appel()?.p_jeu.min_spend).toBeNull();
    }
  });
});

describe("whitelist du design : une absence n'est pas une valeur", () => {
  it("champ omis : la clé n'est pas transmise", async () => {
    await createGameAction({ ...CHARGE, design: { primary_color: "#abcdef" } });
    expect(Object.keys(appel()?.p_restaurant ?? {})).toEqual(["primary_color"]);
  });

  it("null explicite : la clé est transmise, à null", async () => {
    await createGameAction({ ...CHARGE, design: { primary_color: "#abcdef", logo_url: null } });
    expect("logo_url" in (appel()?.p_restaurant ?? {})).toBe(true);
  });

  it("les champs hors whitelist ne passent jamais", async () => {
    await createGameAction({
      ...CHARGE,
      design: { primary_color: "#abcdef", slug: "vole", is_blocked: true },
    });
    expect(Object.keys(appel()?.p_restaurant ?? {})).toEqual(["primary_color"]);
  });
});
