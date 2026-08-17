import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cronAutorise } from "./secret-cron";

/*
 * Le secret de cron garde trois routes qui, elles, ne demandent aucune
 * session : synchronisation des avis, réponses automatiques, recharge des
 * stocks. Si ce contrôle cède, elles sont ouvertes à tous.
 *
 * Aucun vrai secret n'apparaît ici. Celui utilisé est fabriqué pour le test.
 */

const SECRET = "secret-de-test-jamais-utilise-ailleurs";

const requete = (entetes: Record<string, string>) =>
  new Request("https://exemple.invalid/api/cron/x", { headers: entetes });

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("secret de cron", () => {
  describe("accepte", () => {
    it("l'en-tête Bearer, celui qu'envoie Vercel Cron", () => {
      expect(cronAutorise(requete({ authorization: `Bearer ${SECRET}` }))).toBe(true);
    });

    it("l'en-tête x-cron-secret", () => {
      expect(cronAutorise(requete({ "x-cron-secret": SECRET }))).toBe(true);
    });
  });

  describe("refuse", () => {
    it("l'absence totale d'en-tête", () => {
      expect(cronAutorise(requete({}))).toBe(false);
    });

    it("un secret vide", () => {
      expect(cronAutorise(requete({ "x-cron-secret": "" }))).toBe(false);
      expect(cronAutorise(requete({ authorization: "Bearer " }))).toBe(false);
    });

    it("un préfixe Bearer absent", () => {
      expect(cronAutorise(requete({ authorization: SECRET }))).toBe(false);
    });

    it("un secret presque bon — un caractère de trop", () => {
      expect(cronAutorise(requete({ "x-cron-secret": SECRET + "a" }))).toBe(false);
    });

    it("un secret presque bon — un caractère de moins", () => {
      expect(cronAutorise(requete({ "x-cron-secret": SECRET.slice(0, -1) }))).toBe(false);
    });

    it("un préfixe correct du secret — l'attaque par mesure de durée", () => {
      expect(cronAutorise(requete({ "x-cron-secret": SECRET.slice(0, 5) }))).toBe(false);
    });

    /*
     * Sans secret configuré, personne ne passe. La tentation inverse — « pas
     * de secret défini, donc on laisse entrer » — transformerait un oubli de
     * configuration en porte ouverte.
     */
    it("tout, quand aucun secret n'est configuré", () => {
      delete process.env.CRON_SECRET;
      expect(cronAutorise(requete({ authorization: `Bearer ${SECRET}` }))).toBe(false);
      expect(cronAutorise(requete({}))).toBe(false);
    });
  });
});
