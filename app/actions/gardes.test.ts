import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * FILET ANTI-RÉGRESSION
 * ═════════════════════
 *
 * Une Server Action qui instancie `service_role` contourne RLS : la base ne la
 * rattrapera pas. Son autorisation ne peut donc venir que de son propre code.
 *
 * Ce test lit le dossier et refuse toute action `service_role` sans garde. Une
 * nouvelle action non gardée fait échouer la suite le jour où elle est écrite,
 * pas le jour où elle est exploitée.
 *
 * Ni l'identifiant d'une Server Action ni le middleware ne comptent comme une
 * garde : le premier est extractible du bundle, le second ne connaît pas
 * l'objet visé.
 */

const DOSSIER = join(process.cwd(), "app/actions");

/*
 * Le vocabulaire doit couvrir TOUTES les formes de garde réellement employées,
 * pas seulement les helpers récents. Une liste trop étroite crée des faux
 * positifs — `validate-win.ts` et `get-winner-info.ts` sont gardés à la main,
 * par `auth.getUser()` puis comparaison du restaurant, et un filet ignorant
 * cette forme les aurait signalés à tort.
 */
const GARDES = [
  "exigerRole", "exigerRestaurant", "exigerRestaurantParSlug",
  "autoriserParJeu", "autoriserRestaurant",
  "garderResto", "garderRoot",
  "auth.getUser", "createAuthClient", "identiteRecevable", "deciderValidationTicket",
];

/*
 * Publiques par conception : le jeu que le client scanne. Leur protection est
 * ailleurs — RPC `security definer` et limitation par IP — et un contrôle de
 * session les casserait.
 */
const PUBLIQUES = new Set(["play-game.ts", "register-winner.ts", "check-replay.ts"]);

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("Server Actions en service_role", () => {
  it("le dossier est bien lu", () => {
    expect(fichiers.length).toBeGreaterThan(5);
  });

  it.each(fichiers)("%s : service_role implique une garde", (nom) => {
    const src = readFileSync(join(DOSSIER, nom), "utf8");

    const serviceRole = src.includes("SUPABASE_SERVICE_ROLE_KEY");
    const exporteUneAction = /export async function/.test(src);
    if (!serviceRole || !exporteUneAction || PUBLIQUES.has(nom)) return;

    const garde = GARDES.some((g) => src.includes(g));
    expect(garde, `${nom} ouvre service_role sans aucune garde d'autorisation`).toBe(true);
  });

  it("les six actions corrigées portent leur garde", () => {
    const attendu = [
      "update-game.ts", "create-game.ts", "get-winners-page.ts",
      "get-sales-data.ts", "log-system-error.ts", "google-business.ts",
    ];
    for (const nom of attendu) {
      const src = readFileSync(join(DOSSIER, nom), "utf8");
      expect(GARDES.some((g) => src.includes(g)), `${nom} a perdu sa garde`).toBe(true);
    }
  });

  it("update-game n'écrit jamais avec un identifiant venu du client", () => {
    const src = readFileSync(join(DOSSIER, "update-game.ts"), "utf8");

    // `data.restaurant_id` était le cœur de la faille : il ne doit plus servir.
    expect(src).not.toMatch(/eq\(\s*["']id["']\s*,\s*data\.restaurant_id/);
    // Et le gameId reçu ne doit plus filtrer ni remplir une écriture.
    expect(src).not.toMatch(/eq\(\s*["']game_?[iI]d["']\s*,\s*gameId/);
    expect(src).not.toMatch(/game_id:\s*gameId/);
  });
});
