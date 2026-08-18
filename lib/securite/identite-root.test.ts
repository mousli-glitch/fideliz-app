import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { estCompteProtege } from "./compte-root";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  L'UUID DU ROOT NE DOIT PLUS REVENIR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Il était recopié à six endroits : trois policies, une fonction de trigger,
 * trois fichiers TypeScript. Chaque copie faisait la même chose — attacher
 * une autorisation à une PERSONNE — avec deux conséquences.
 *
 * Le droit s'éteint le jour où le compte change. Et surtout : un root
 * SYNTHÉTIQUE n'est jamais cette personne-là, donc le parcours
 * d'administration ne pouvait se prouver qu'en production. C'est exactement
 * ce qu'on cherche à ne plus faire.
 *
 * Ce fichier empêche le retour. Sans lui, la correction tiendrait le temps
 * qu'un copier-coller la défasse.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UUID_ROOT = "04eb7091-6876-41e0-84c6-5891658a5768";

/* La baseline décrit l'histoire telle qu'elle fut, UUID compris : la
   réécrire la rendrait fausse. C'est la migration corrective qui corrige,
   et son fichier cite l'ancien état dans son rollback — donc les deux
   sont exemptés, nommément. */
const EXEMPTS = new Set([
  "00000000000000_baseline_fideliz.sql",
  "20260818011000_rls_isolation_inter_tenant.sql",
]);

function fichiers(dossier: string, ext: string[]): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (["node_modules", ".next", ".git", "sauvegardes"].includes(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin, ext));
    else if (ext.some((e) => nom.endsWith(e))) sortie.push(chemin);
  }
  return sortie;
}

/* Un commentaire qui EXPLIQUE le retrait est légitime ; du code qui teste
   l'identifiant ne l'est pas. On enlève donc les commentaires avant de
   chercher — c'est la même précaution que dans `durcissement.test.ts`. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

describe("aucune autorisation attachée à une personne", () => {
  it("l'UUID du root n'apparaît dans aucun code applicatif", () => {
    /* Ce fichier-ci porte l'UUID : c'est ce qu'il cherche. Il est exclu
       NOMMÉMENT, et non par la catégorie « tests » — un test pourrait très
       bien dissimuler un couplage qu'on veut voir. */
    const moi = join(RACINE, "lib", "securite", "identite-root.test.ts");

    const fautifs = fichiers(join(RACINE, "app"), [".ts", ".tsx"])
      .concat(fichiers(join(RACINE, "lib"), [".ts", ".tsx"]))
      .filter((f) => f !== moi)
      .filter((f) => sansCommentaires(readFileSync(f, "utf8")).includes(UUID_ROOT))
      .map((f) => f.replace(RACINE + "/", ""));

    expect(
      fautifs,
      `UUID du root retrouvé dans : ${fautifs.join(", ")}.\n` +
        `Une autorisation se teste par le RÔLE (exigerRole, current_role()).\n` +
        `Un destinataire se CHERCHE (lib/securite/compte-root.ts).\n` +
        `Ne remplace pas cet UUID par un autre identifiant écrit en dur.`,
    ).toEqual([]);
  });

  it("aucune nouvelle migration ne le réintroduit", () => {
    const dossier = join(RACINE, "supabase", "migrations");
    const fautives = readdirSync(dossier)
      .filter((f) => f.endsWith(".sql") && !EXEMPTS.has(f))
      .filter((f) => sansCommentaires(readFileSync(join(dossier, f), "utf8")).includes(UUID_ROOT));

    expect(
      fautives,
      `UUID du root dans : ${fautives.join(", ")}. Emploie public."current_role"() = 'root'.`,
    ).toEqual([]);
  });

  it("la migration corrective retire bien les deux dernières policies", () => {
    const sql = readFileSync(
      join(RACINE, "supabase", "migrations", "20260818011000_rls_isolation_inter_tenant.sql"),
      "utf8",
    );
    const propre = sansCommentaires(sql);
    for (const policy of ["ADMIN_GAMES_FULL_ACCESS", "Root Full Access"]) {
      expect(propre).toContain(`drop policy if exists "${policy}"`);
    }
    /* Recréées par le rôle, et par rien d'autre. */
    expect(propre.match(/current_role"\(\) = 'root'/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(propre).not.toContain(UUID_ROOT);
  });

  it("handle_deleted_commercial cherche le root au lieu de le nommer", () => {
    const sql = sansCommentaires(
      readFileSync(
        join(RACINE, "supabase", "migrations", "20260818011000_rls_isolation_inter_tenant.sql"),
        "utf8",
      ),
    );
    expect(sql).toMatch(/where\s+p\.role\s*=\s*'root'/i);
    /* `search_path` figé : elle en était dépourvue, et c'est une fonction
       SECURITY DEFINER. On ne la réécrit pas pour la laisser ainsi. */
    expect(sql).toMatch(/set search_path = ''/);
    /* Fonction de trigger : aucun EXECUTE nécessaire. */
    expect(sql).toMatch(/revoke all on function public\.handle_deleted_commercial\(\)/i);
  });
});

describe("la protection du compte se lit sur le rôle", () => {
  it("un root est protégé", () => {
    expect(estCompteProtege("root")).toBe(true);
  });

  it("les autres ne le sont pas", () => {
    for (const r of ["sales", "restaurant", null, undefined, ""]) {
      expect(estCompteProtege(r as string | null | undefined)).toBe(false);
    }
  });

  it("un second root créé demain sera protégé sans qu'on y pense", () => {
    /* C'est tout l'intérêt du test de rôle : il ne connaît personne. */
    expect(estCompteProtege("root")).toBe(true);
  });
});
