import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Un identifiant privilégié codé en dur est une autorisation qui échappe au
 * système de rôles. Il ne se voit pas dans une revue de policies, il ne se
 * voit pas dans une matrice RLS, et il survit à tous les durcissements.
 *
 * Ce test parcourt le code applicatif et échoue si un UUID réapparaît près
 * d'une décision d'autorisation ou d'attribution.
 */

const RACINES = ["app", "components", "lib", "utils"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/*
 * Un UUID dans une URL nomme un FICHIER, pas un principal : les fonds d'écran
 * du Storage en portent, et les signaler serait du bruit. La distinction n'est
 * pas cosmétique — c'est elle qui fait la différence entre un détecteur qu'on
 * lit et un détecteur qu'on désactive.
 */
function estDansUneUrl(ligne: string, uuid: string): boolean {
  const i = ligne.indexOf(uuid);
  if (i <= 0 || !/https?:\/\/\S*$/.test(ligne.slice(0, i))) return false;

  /*
   * L'exception est BORNÉE aux assets Storage. Sans cette borne, il suffirait
   * de placer un identifiant d'autorisation dans une URL pour échapper au
   * détecteur — l'exemption deviendrait le trou qu'elle est censée éviter.
   */
  return /\/storage\/v1\/object\/public\//.test(ligne);
}

function fichiers(): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!["node_modules", ".next"].includes(e.name)) parcourir(p); }
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  for (const r of RACINES) { try { parcourir(join(process.cwd(), r)); } catch {} }
  return out;
}

describe("aucun identifiant privilégié codé en dur", () => {
  it("le graphe applicatif est bien lu", () => {
    expect(fichiers().length).toBeGreaterThan(20);
  });

  it.each(fichiers().map((f) => [f.replace(process.cwd() + "/", ""), f]))(
    "%s ne contient aucun UUID en dur",
    (_nom, chemin) => {
      const trouves: string[] = [];
      for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
        for (const m of ligne.matchAll(UUID)) {
          if (!estDansUneUrl(ligne, m[0])) trouves.push(m[0]);
        }
      }

      expect(
        trouves,
        `UUID codé en dur : une autorisation ou une attribution qui échappe au ` +
          `système de rôles. Résoudre par rôle — voir lib/securite/root.ts.`,
      ).toEqual([]);
    },
  );

  it("le résolveur de root existe et porte la barrière server-only", () => {
    const src = readFileSync(join(process.cwd(), "lib/securite/root.ts"), "utf8");
    expect(src).toMatch(/^import ["']server-only["']/m);
    expect(src).toContain("resoudreRootHeritier");
    // Il doit choisir par RÔLE, pas par identifiant.
    expect(src).toMatch(/\.eq\(\s*["']role["']\s*,\s*["']root["']\s*\)/);
  });
});
