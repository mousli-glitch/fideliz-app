import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ENREGISTRER SON JEU, PAS CELUI DU VOISIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `updateGameAction` écrivait à la clé de service et n'avait aucun test.
 * Quatre défauts, vérifiés dans le code avant correction :
 *
 *   1. La garde validait le `restaurant_id` reçu, mais les mutations visaient
 *      `gameId` seul. Rien ne prouvait que ce jeu appartenait au restaurant
 *      autorisé : un restaurateur légitime pouvait annoncer SON restaurant et
 *      fournir le jeu d'un CONFRÈRE, dont les lots partaient.
 *   2. L'erreur du DELETE des lots était ignorée.
 *   3. DELETE puis INSERT en deux requêtes HTTP : DELETE réussi + INSERT
 *      échoué = tous les lots perdus.
 *   4. La règle « total des poids = 100 % » ne vivait que dans les composants
 *      de page.
 *
 * Ces tests portent sur ce que le code TypeScript peut garantir : le tenant
 * vient de la garde et non du corps de la requête, tout part dans un seul
 * appel atomique, et un refus n'est jamais présenté comme un succès. Les
 * garanties SQL — appartenance, atomicité, validation, conservation — sont
 * éprouvées par `supabase/verifications/harnais-enregistrement-jeu.sql`,
 * joué sur base réelle : un test unitaire ne peut pas prouver une
 * transaction.
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

function clientSimule() {
  return {
    from: (table: string) => {
      const chaine: Record<string, unknown> = {};
      let payload: unknown;
      let predicat: unknown;
      chaine.update = (v: unknown) => { payload = v; return chaine; };
      chaine.eq = (_c: string, v: unknown) => { predicat = v; return chaine; };
      chaine.then = (r: (v: unknown) => unknown) => {
        const cle = `${table}:update`;
        journal.push({ cle, payload: { valeurs: payload, cible: predicat } });
        return Promise.resolve({ data: [], error: echecs[cle] ?? null }).then(r);
      };
      return chaine;
    },
    rpc: async (nom: string, params: unknown) => {
      journal.push({ cle: `rpc:${nom}`, payload: params });
      return { data: null, error: echecs[`rpc:${nom}`] ?? null };
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => clientSimule() }));

const { updateGameAction } = await import("./update-game");

const CHARGE = {
  restaurant_id: "resto-autorise",
  form: { name: "Mon jeu", active_action: "wheel", action_url: "https://exemple.invalid", validity_days: 7 },
  design: { primary_color: "#000000" },
  prizes: [
    { label: "Lot 1", weight: 60, quantity: null },
    { label: "Lot 2", weight: 40, quantity: null },
  ],
};

beforeEach(() => {
  journal = [];
  echecs = {};
  garde = {
    ok: true,
    appelant: { userId: "root-synthetique" },
    restaurant: { id: "resto-autorise", slug: "resto-autorise" },
  };
});

function appelRpc() {
  return journal.find((o) => o.cle === "rpc:enregistrer_jeu_et_lots")?.payload as
    | { p_game_id: string; p_restaurant_id: string; p_jeu: Record<string, unknown>; p_lots: unknown[] }
    | undefined;
}

describe("P0 : le tenant vient de la garde, jamais du corps de la requête", () => {
  it("le restaurant transmis à la fonction est celui RÉSOLU par la garde", async () => {
    // `data.restaurant_id` a servi à résoudre ; il ne sert plus à décider.
    await updateGameAction("jeu-1", { ...CHARGE, restaurant_id: "resto-annonce-par-le-navigateur" });
    expect(appelRpc()?.p_restaurant_id).toBe("resto-autorise");
  });

  it("le jeu est transmis AVEC son tenant — jamais seul", async () => {
    await updateGameAction("jeu-1", CHARGE);
    const appel = appelRpc();
    expect(appel?.p_game_id).toBe("jeu-1");
    expect(appel?.p_restaurant_id, "sans tenant, le jeu d'un confrère passerait").toBeTruthy();
  });

  it("le design du restaurant est borné au tenant résolu", async () => {
    await updateGameAction("jeu-1", { ...CHARGE, restaurant_id: "resto-annonce-par-le-navigateur" });
    const maj = journal.find((o) => o.cle === "restaurants:update");
    expect((maj?.payload as { cible?: string })?.cible).toBe("resto-autorise");
  });

  it("garde refusée : rien n'est tenté", async () => {
    garde = { ok: false, error: "Ce restaurant n'est pas le vôtre." };
    const r = await updateGameAction("jeu-1", CHARGE);
    expect(r.success).toBe(false);
    expect(journal).toEqual([]);
  });

  it("restaurant non résolu par la garde : refus, pas un enregistrement à l'aveugle", async () => {
    garde = { ok: true, appelant: { userId: "root-synthetique" } };
    const r = await updateGameAction("jeu-1", CHARGE);
    expect(r.success).toBe(false);
    expect(journal).toEqual([]);
  });

  it("jeu manquant : refus", async () => {
    const r = await updateGameAction("", CHARGE);
    expect(r.success).toBe(false);
    expect(journal).toEqual([]);
  });
});

describe("un seul appel atomique — plus de DELETE puis INSERT", () => {
  it("les lots partent dans le MÊME appel que le jeu", async () => {
    await updateGameAction("jeu-1", CHARGE);
    expect(appelRpc()?.p_lots).toHaveLength(2);
    // Aucune suppression de lots côté client : c'est la transaction qui l'a.
    expect(journal.map((o) => o.cle)).not.toContain("prizes:delete");
  });

  it("un seul aller-retour d'enregistrement, pas deux", async () => {
    await updateGameAction("jeu-1", CHARGE);
    expect(journal.filter((o) => o.cle.startsWith("rpc:"))).toHaveLength(1);
  });

  it("échec de l'enregistrement : échec franc, jamais un succès silencieux", async () => {
    echecs["rpc:enregistrer_jeu_et_lots"] = { message: "Le total des poids doit valoir 100 %" };
    const r = await updateGameAction("jeu-1", CHARGE);
    expect(r.success).toBe(false);
    expect(r.error).toContain("100");
  });

  it("échec de la sauvegarde du restaurant : on n'enregistre pas le jeu derrière", async () => {
    echecs["restaurants:update"] = { message: "panne" };
    const r = await updateGameAction("jeu-1", CHARGE);
    expect(r.success).toBe(false);
    expect(journal.map((o) => o.cle)).not.toContain("rpc:enregistrer_jeu_et_lots");
  });
});

describe("les stocks : vide veut dire illimité, jamais zéro", () => {
  it("limite de stock inactive : tous les stocks partent à null", async () => {
    await updateGameAction("jeu-1", {
      ...CHARGE,
      form: { ...CHARGE.form, is_stock_limit_active: false },
      prizes: [{ label: "Lot", weight: 100, quantity: 5 }],
    });
    expect((appelRpc()?.p_lots as { quantity: unknown }[])[0].quantity).toBeNull();
  });

  it("limite active, stock saisi : le nombre est conservé", async () => {
    await updateGameAction("jeu-1", {
      ...CHARGE,
      form: { ...CHARGE.form, is_stock_limit_active: true },
      prizes: [{ label: "Lot", weight: 100, quantity: 5 }],
    });
    expect((appelRpc()?.p_lots as { quantity: unknown }[])[0].quantity).toBe(5);
  });

  it("limite active, stock vide : null (illimité), surtout pas 0", async () => {
    // Un 0 rendrait le lot inatteignable au lieu de l'ouvrir.
    for (const vide of ["", null, undefined]) {
      journal = [];
      await updateGameAction("jeu-1", {
        ...CHARGE,
        form: { ...CHARGE.form, is_stock_limit_active: true },
        prizes: [{ label: "Lot", weight: 100, quantity: vide }],
      });
      expect((appelRpc()?.p_lots as { quantity: unknown }[])[0].quantity).toBeNull();
    }
  });

  it("la recharge automatique n'est transmise que si la limite est active", async () => {
    await updateGameAction("jeu-1", {
      ...CHARGE,
      form: { ...CHARGE.form, is_stock_limit_active: false, stock_refill_enabled: true },
    });
    expect(appelRpc()?.p_jeu.stock_refill_enabled).toBe(false);
  });
});

describe("les dates : elles ne partent que si la limite est active", () => {
  it("limite de date inactive : début et fin sont nuls", async () => {
    await updateGameAction("jeu-1", {
      ...CHARGE,
      form: { ...CHARGE.form, is_date_limit_active: false, start_date: "2026-01-01", end_date: "2026-02-01" },
    });
    expect(appelRpc()?.p_jeu.start_date).toBeNull();
    expect(appelRpc()?.p_jeu.end_date).toBeNull();
  });

  it("limite active : les deux dates sont normalisées en ISO", async () => {
    await updateGameAction("jeu-1", {
      ...CHARGE,
      form: { ...CHARGE.form, is_date_limit_active: true, start_date: "2026-01-01", end_date: "2026-02-01" },
    });
    expect(String(appelRpc()?.p_jeu.start_date)).toMatch(/^2026-01-01T/);
  });
});

describe("le montant minimum reste normalisé", () => {
  for (const [saisi, attendu] of [["5,90", "5.9"], ["5.90", "5.9"], ["", "0"], ["-3", "0"], ["abc", "0"]]) {
    it(`« ${saisi} » devient « ${attendu} »`, async () => {
      await updateGameAction("jeu-1", { ...CHARGE, form: { ...CHARGE.form, min_spend: saisi } });
      expect(appelRpc()?.p_jeu.min_spend).toBe(attendu);
    });
  }
});

describe("charge malformée : on ne fabrique pas de lots", () => {
  it("`prizes` absent : liste vide transmise, et c'est la fonction qui refuse", async () => {
    await updateGameAction("jeu-1", { ...CHARGE, prizes: undefined });
    expect(appelRpc()?.p_lots).toEqual([]);
  });

  it("`prizes` non tableau : liste vide, jamais une exception non gérée", async () => {
    const r = await updateGameAction("jeu-1", { ...CHARGE, prizes: "pas un tableau" });
    expect(appelRpc()?.p_lots).toEqual([]);
    expect(typeof r.success).toBe("boolean");
  });
});
