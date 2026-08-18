import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Ce que ces tests protègent
 * ══════════════════════════
 *
 * `updateGameAction(gameId, data)` reçoit deux identifiants du client. La
 * garde écrite sur la branche de fusion validait `data.restaurant_id` — donc
 * la mauvaise moitié : passer le jeu du voisin avec son propre restaurant
 * suffisait à modifier ce jeu et à supprimer ses lots.
 *
 * Le cas nommé « le piège de la branche de fusion » ci-dessous échoue si
 * quelqu'un réintroduit cette forme de garde.
 */

vi.mock("server-only", () => ({}));

const maybeSingle = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const exigerRestaurantParSlug = vi.fn();
vi.mock("@/lib/securite/garde-action", () => ({ exigerRestaurantParSlug }));

const { autoriserParJeu } = await import("./garde-objet");

const JEU_DE_B = "11111111-1111-4111-8111-111111111111";
const RESTO_DE_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  maybeSingle.mockReset();
  exigerRestaurantParSlug.mockReset();
});

describe("autoriserParJeu", () => {
  it("résout le restaurant depuis le jeu, pas depuis ce que dit le client", async () => {
    maybeSingle.mockResolvedValue({ data: { id: JEU_DE_B, restaurant_id: RESTO_DE_B } });
    exigerRestaurantParSlug.mockResolvedValue({ ok: true });

    await autoriserParJeu(JEU_DE_B, ["restaurant"], "jeu.modification");

    // L'identifiant soumis à la garde est celui LU en base.
    expect(exigerRestaurantParSlug).toHaveBeenCalledWith(RESTO_DE_B, ["restaurant"], "jeu.modification");
  });

  it("le piège de la branche de fusion : le jeu de B avec le restaurant de A est refusé", async () => {
    maybeSingle.mockResolvedValue({ data: { id: JEU_DE_B, restaurant_id: RESTO_DE_B } });
    // A n'est pas rattaché au restaurant de B : la garde refuse.
    exigerRestaurantParSlug.mockResolvedValue({ ok: false, error: "Ce restaurant n'est pas le vôtre." });

    const r = await autoriserParJeu(JEU_DE_B, ["restaurant"], "jeu.modification");

    expect(r.ok).toBe(false);
  });

  it("rend l'identifiant résolu, seul autorisé pour les écritures qui suivent", async () => {
    maybeSingle.mockResolvedValue({ data: { id: JEU_DE_B, restaurant_id: RESTO_DE_B } });
    exigerRestaurantParSlug.mockResolvedValue({ ok: true });

    const r = await autoriserParJeu(JEU_DE_B, ["restaurant"], "x");

    expect(r).toEqual({ ok: true, restaurantId: RESTO_DE_B, objetId: JEU_DE_B });
  });

  it("refuse un identifiant qui n'est pas un UUID sans interroger la base", async () => {
    const r = await autoriserParJeu("' or 1=1 --", ["restaurant"], "x");

    expect(r.ok).toBe(false);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 42, {}, ["x"]])("refuse le type inattendu %s", async (v) => {
    expect((await autoriserParJeu(v, ["restaurant"], "x")).ok).toBe(false);
  });

  it("un jeu inexistant et un jeu interdit donnent le MÊME message", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const inexistant = await autoriserParJeu(JEU_DE_B, ["restaurant"], "x");

    maybeSingle.mockResolvedValue({ data: { id: JEU_DE_B, restaurant_id: RESTO_DE_B } });
    exigerRestaurantParSlug.mockResolvedValue({ ok: false, error: "Ce restaurant n'est pas le vôtre." });
    const interdit = await autoriserParJeu(JEU_DE_B, ["restaurant"], "x");

    // Sinon l'écart de message dit à un curieux quels identifiants existent.
    expect(inexistant).toEqual(interdit);
  });
});
