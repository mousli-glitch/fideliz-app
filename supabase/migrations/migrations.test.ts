import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LA MINE NE DOIT PAS REPOUSSER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `handle_new_user_profile()` lisait le rôle du nouveau profil dans
 * `raw_user_meta_data` — c'est-à-dire dans ce que le client envoie à
 * l'inscription. Avec une inscription publique ouverte et la confirmation
 * d'e-mail désactivée, une inscription portant `{"role":"root"}` donnait un
 * compte root immédiatement utilisable.
 *
 * Corrigé le 18/08/2026. Ces tests lisent les migrations dans leur ordre
 * d'application et vérifient l'ÉTAT FINAL de la fonction — pas une migration
 * en particulier. Si quelqu'un réintroduit un jour la lecture des
 * métadonnées, par mégarde ou par recopie d'un ancien fichier, ce test
 * tombe.
 *
 * Il ne demande ni base ni secret : il lit le dépôt. C'est ce qui le rend
 * exécutable partout, tout le temps.
 */

const migrations = readdirSync(ICI)
  .filter((n) => n.endsWith(".sql"))
  .sort(); // l'ordre lexical est l'ordre d'application

/** Dernière définition de la fonction, dans l'ordre des migrations. */
function definitionFinale(nomFonction: string): { fichier: string; corps: string } | null {
  let trouve: { fichier: string; corps: string } | null = null;
  for (const fichier of migrations) {
    const sql = readFileSync(join(ICI, fichier), "utf8");
    /* On coupe les commentaires : la baseline DÉCRIT le défaut en toutes
       lettres, et on ne veut pas confondre la description avec le code. */
    const code = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    const motif = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${nomFonction}\\s*\\(([\\s\\S]*?)\\$function\\$\\s*;`,
      "i"
    );
    const m = code.match(motif);
    if (m) trouve = { fichier, corps: m[0] };
  }
  return trouve;
}

describe("handle_new_user_profile — le rôle ne vient jamais du client", () => {
  const finale = definitionFinale("handle_new_user_profile");

  it("une définition existe dans les migrations", () => {
    expect(finale, "aucune migration ne définit handle_new_user_profile").not.toBeNull();
  });

  it("la dernière définition ne lit plus raw_user_meta_data", () => {
    expect(finale!.corps).not.toMatch(/raw_user_meta_data/);
  });

  it("elle écrit le rôle « restaurant » en dur", () => {
    expect(finale!.corps).toMatch(/'restaurant'/);
  });

  it("elle ne rattache le nouveau compte à aucun restaurant", () => {
    expect(finale!.corps).toMatch(/'restaurant',\s*null/);
  });

  it("elle ne peut poser ni root ni sales", () => {
    expect(finale!.corps).not.toMatch(/'root'/);
    expect(finale!.corps).not.toMatch(/'sales'/);
  });

  /*
   * La baseline, elle, DOIT garder le défaut : elle explique l'état
   * historique. Ce test le vérifie aussi — une baseline « nettoyée » ferait
   * perdre la trace de ce qui s'est réellement passé.
   */
  it("la baseline conserve l'état historique, défaut compris", () => {
    const baseline = migrations.find((n) => n.includes("baseline_fideliz"));
    expect(baseline, "la baseline historique a disparu").toBeDefined();
    expect(readFileSync(join(ICI, baseline!), "utf8")).toMatch(/raw_user_meta_data/);
  });

  it("la correction vient après la baseline dans l'ordre d'application", () => {
    const iBaseline = migrations.findIndex((n) => n.includes("baseline_fideliz"));
    const iCorrectif = migrations.findIndex((n) => n.includes("role_jamais_depuis_les_metadonnees"));
    expect(iBaseline).toBeGreaterThanOrEqual(0);
    expect(iCorrectif).toBeGreaterThan(iBaseline);
  });
});
