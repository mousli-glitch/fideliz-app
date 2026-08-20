/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE GEL NE DOIT PAS REDEVENIR UNE « ERREUR INCONNUE »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Garde statique, sur le VRAI code, comme la garde de portage des rôles.
 *
 * ─── CE QU'ELLE EMPÊCHE DE REVENIR ───
 *
 * Le module `lib/securite/maintenance.ts` existait depuis le 18/08/2026 et
 * n'était appelé par personne — seulement par son propre test. Son en-tête
 * annonçait pourtant ce qu'il évitait : « sans lui, un client qui joue pendant
 * la fenêtre de bascule verrait Erreur serveur critique ».
 *
 * La répétition du gel du 20/08 a mesuré ce que le joueur voyait vraiment,
 * gel actif, et c'était pire que prévu :
 *
 *   • la roue tombait sur « Une erreur est survenue. Merci de réessayer » —
 *     une invitation à insister pendant toute la fenêtre de bascule ;
 *   • l'inscription levait une exception, le rattrapage affichait un écran
 *     TICKET portant le code « ERREUR-CONTACT-STAFF ». Le joueur repartait
 *     avec un faux ticket, et l'employé n'avait rien à scanner.
 *
 * Un test unitaire sur `estGelDeBascule` n'aurait rien vu : la fonction était
 * correcte, elle n'était simplement branchée nulle part. Ce qui se vérifie
 * ici, c'est le BRANCHEMENT.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { estGelDeBascule, messageMaintenance, CODE_MAINTENANCE, ERREUR_MAINTENANCE } from "./maintenance";

const RACINE = join(import.meta.dirname, "..", "..");
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");

/* Les deux écritures que le gel refuse et qu'un CLIENT déclenche. */
const ACTIONS_JOUEUR = [
  "app/actions/play-game.ts",
  "app/actions/register-winner.ts",
] as const;

describe("le gel est reconnu là où le joueur le rencontre", () => {
  it.each(ACTIONS_JOUEUR)("%s reconnaît le gel", (chemin) => {
    const src = lire(chemin);
    expect(src).toContain("estGelDeBascule");
    expect(src).toContain("ERREUR_MAINTENANCE");
  });

  it.each(ACTIONS_JOUEUR)(
    "%s teste le gel AVANT de rendre l'erreur brute",
    (chemin) => {
      const src = lire(chemin);
      const gel = src.indexOf("estGelDeBascule(error)");
      const brute = src.indexOf("return { success: false, error: error.message }");
      expect(gel).toBeGreaterThan(-1);
      expect(brute).toBeGreaterThan(-1);
      /*
       * L'ordre est le fond du correctif : testé APRÈS, le gel ne serait
       * jamais atteint, et le test « il contient estGelDeBascule » passerait
       * quand même au vert.
       */
      expect(gel).toBeLessThan(brute);
    }
  );

  it("le client reconnaît le code de maintenance dans ses DEUX parcours", () => {
    const src = lire("components/game/public-game-client.tsx");
    const occurrences = src.split("ERREUR_MAINTENANCE").length - 1;
    // 1 import + 1 branche roue + 1 branche inscription
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("le gel ne passe plus par le throw qui fabrique un faux ticket", () => {
    const src = lire("components/game/public-game-client.tsx");
    const gel = src.indexOf(`result.error === ERREUR_MAINTENANCE`);
    const jete = src.indexOf(`throw new Error(result.error`);
    expect(gel).toBeGreaterThan(-1);
    expect(jete).toBeGreaterThan(-1);
    expect(gel).toBeLessThan(jete);
  });

  it("le faux ticket existe toujours pour les VRAIES pannes — on ne l'a pas supprimé", () => {
    /*
     * Le rattrapage « ERREUR-CONTACT-STAFF » reste la bonne réponse à un
     * incident réel : le joueur a quelque chose à montrer. Ce qu'on a retiré,
     * c'est son déclenchement par une maintenance annoncée.
     */
    expect(lire("components/game/public-game-client.tsx")).toContain("ERREUR-CONTACT-STAFF");
  });
});

describe("la traduction elle-même", () => {
  it("reconnaît le code du gel, et lui seul", () => {
    expect(estGelDeBascule({ code: CODE_MAINTENANCE })).toBe(true);
    expect(estGelDeBascule({ hint: "bascule_en_cours" })).toBe(true);
    expect(estGelDeBascule({ code: "23505" })).toBe(false);
    expect(estGelDeBascule(null)).toBe(false);
  });

  it("préfère le message de la base — modifiable en cours de bascule", () => {
    expect(messageMaintenance({ code: CODE_MAINTENANCE, message: "Retour à 7 h." }))
      .toBe("Retour à 7 h.");
  });

  it("retombe sur un message correct quand la base n'en donne pas", () => {
    expect(messageMaintenance({ code: CODE_MAINTENANCE })).toMatch(/momentanément suspendu/i);
    /* « permission denied » est un message de plateforme, pas un message client. */
    expect(messageMaintenance({ code: CODE_MAINTENANCE, message: "permission denied for table winners" }))
      .toMatch(/momentanément suspendu/i);
  });

  it("le code rendu à l'interface n'est pas le SQLSTATE", () => {
    /* Le client compare des mots métier ; « P0100 » n'en est pas un. */
    expect(ERREUR_MAINTENANCE).not.toBe(CODE_MAINTENANCE);
    expect(ERREUR_MAINTENANCE).toBe("maintenance");
  });
});
