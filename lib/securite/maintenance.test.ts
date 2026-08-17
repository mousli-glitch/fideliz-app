import { describe, it, expect } from "vitest";
import { estGelDeBascule, messageMaintenance, siGelee, CODE_MAINTENANCE } from "./maintenance";

/*
 * Ces tests portent sur la TRADUCTION du gel, pas sur le gel lui-même.
 *
 * Le gel est imposé par des triggers en base : le prouver demande une base,
 * et cela se fera sur la branche temporaire — insertion d'un gagnant refusée,
 * appel direct à `play_game` refusé, lecture d'un menu toujours servie.
 *
 * Ce qui se teste ici, sans base : qu'une erreur de maintenance ne se
 * confonde jamais avec un vrai incident. Les deux méritent des réponses
 * opposées — l'une dit « revenez dans dix minutes », l'autre doit remonter.
 */

const erreurGel = { code: CODE_MAINTENANCE, message: "Bascule en cours, retour à 8 h.", hint: "bascule_en_cours" };
const erreurVraie = { code: "23505", message: "duplicate key value violates unique constraint" };

describe("reconnaître le gel", () => {
  it("reconnaît le code SQLSTATE dédié", () => {
    expect(estGelDeBascule(erreurGel)).toBe(true);
  });

  it("reconnaît l'indice, même si le code s'est perdu en chemin", () => {
    expect(estGelDeBascule({ hint: "bascule_en_cours" })).toBe(true);
  });

  it("ne confond pas une vraie erreur avec une maintenance", () => {
    expect(estGelDeBascule(erreurVraie)).toBe(false);
  });

  it("ne prend pas l'absence d'erreur pour une maintenance", () => {
    expect(estGelDeBascule(null)).toBe(false);
    expect(estGelDeBascule(undefined)).toBe(false);
  });
});

describe("le message montré au client", () => {
  it("reprend celui de la base — modifiable pendant la bascule sans redéployer", () => {
    expect(messageMaintenance(erreurGel)).toBe("Bascule en cours, retour à 8 h.");
  });

  it("retombe sur un message clair si la base n'en donne aucun", () => {
    expect(messageMaintenance({ code: CODE_MAINTENANCE })).toMatch(/réessayer/i);
  });

  it("ne montre jamais un message technique de Postgres au client", () => {
    expect(messageMaintenance({ code: CODE_MAINTENANCE, message: "permission denied for table winners" })).toMatch(
      /réessayer/i
    );
  });
});

describe("envelopper une écriture", () => {
  it("laisse passer une écriture qui réussit", async () => {
    const r = await siGelee(async () => "validé");
    expect(r).toEqual({ gelee: false, resultat: "validé" });
  });

  it("rend une réponse propre quand le gel refuse", async () => {
    const r = await siGelee(async () => {
      throw erreurGel;
    });
    expect(r).toEqual({ gelee: true, message: "Bascule en cours, retour à 8 h." });
  });

  /*
   * Le point qui compte. Si un vrai incident était avalé en « maintenance »,
   * on croirait la bascule en cours alors que la base tombe — et on
   * attendrait tranquillement que ça passe.
   */
  it("laisse remonter un vrai incident au lieu de le déguiser", async () => {
    await expect(
      siGelee(async () => {
        throw erreurVraie;
      })
    ).rejects.toEqual(erreurVraie);
  });
});
