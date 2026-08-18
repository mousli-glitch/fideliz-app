import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LE DURCISSEMENT, ET LA RÈGLE QUI LE COMPLÈTE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Les privilèges par défaut ferment les tables, les vues et les séquences.
 * Ils ne ferment PAS les fonctions : `ALTER DEFAULT PRIVILEGES … REVOKE
 * EXECUTE ON FUNCTIONS FROM PUBLIC` n'enregistre rien sur cette instance —
 * mesuré le 18/08 sur PostgreSQL 17.6, sur deux transactions séparées.
 *
 * Toute nouvelle fonction de `public` naît donc exécutable par `PUBLIC`,
 * donc par `anon`. C'est exactement le défaut qui a produit les deux P0 du
 * 17/08 : `archive_redeemed_winners` et `_log_event` appelables sans compte.
 *
 * La seule protection qui tienne est une règle : chaque fonction porte son
 * propre revoke. Une règle qu'aucun test ne vérifie n'est qu'un vœu — d'où
 * ce fichier.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const DURCISSEMENT = "20260818010000";

const migrations = readdirSync(ICI)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((nom) => ({
    nom,
    version: nom.split("_")[0],
    sql: readFileSync(join(ICI, nom), "utf8"),
  }));

const durcissement = migrations.find((m) => m.version === DURCISSEMENT);

/* Les commentaires expliquent ; ils ne s'exécutent pas. Les confondre avec du
   SQL ferait passer au vert un fichier qui ne fait rien. */
function sansCommentaires(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

describe("durcissement — les nouveaux objets naissent fermés", () => {
  it("la migration existe", () => {
    expect(durcissement, `aucune migration ${DURCISSEMENT}`).toBeDefined();
  });

  it("elle vient après toutes les migrations historiques", () => {
    const historiques = migrations
      .filter((m) => m.version < DURCISSEMENT)
      .map((m) => m.version);
    expect(historiques).toContain("00000000000000");
    expect(historiques).toContain("20260817235046");
    expect(historiques.every((v) => v < DURCISSEMENT)).toBe(true);
  });

  it("elle vient avant le gel de bascule", () => {
    const gel = migrations.find((m) => m.nom.includes("gel_de_bascule"));
    expect(gel).toBeDefined();
    expect(DURCISSEMENT < gel!.version).toBe(true);
  });

  it("elle refuse de s'appliquer si le rôle créateur n'est plus postgres", () => {
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(/current_user\s*<>\s*'postgres'/);
    expect(sql).toMatch(/raise exception/i);
  });

  for (const objet of ["tables", "sequences", "functions"]) {
    it(`anon et authenticated perdent tout sur les nouvelles ${objet}`, () => {
      const sql = sansCommentaires(durcissement!.sql);
      const motif = new RegExp(
        `alter default privileges[\\s\\S]{0,120}?revoke all on ${objet} from[^;]*anon[^;]*authenticated`,
        "i",
      );
      expect(sql).toMatch(motif);
    });
  }

  it("service_role garde exactement les quatre verbes utiles sur les tables", () => {
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(
      /grant select, insert, update, delete on tables to service_role/i,
    );
    /* Ni TRUNCATE, ni REFERENCES, ni TRIGGER, ni MAINTAIN : aucun chemin
       applicatif ne s'en sert, et un droit inutile finit par servir. */
    expect(sql).not.toMatch(/grant[^;]*truncate[^;]*on tables to service_role/i);
    expect(sql).not.toMatch(/grant all on tables to service_role/i);
  });

  it("service_role n'obtient sur les séquences que USAGE et SELECT", () => {
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(/grant usage, select on sequences to service_role/i);
    expect(sql).not.toMatch(/grant all on sequences to service_role/i);
  });

  it("la fonction d'audit voit les fonctions dont l'ACL est absente", () => {
    /* Une fonction à `proacl` NULL porte le défaut câblé — propriétaire ET
       PUBLIC. Elle est donc ouverte à tous sans qu'aucun `grant` n'existe.
       Un audit qui ne regarde que les grants explicites passe à côté du cas
       exact qui a produit les deux P0. */
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(/auditer_privileges_publics/);
    expect(sql).toMatch(/proacl is null/i);
  });

  it("la fonction d'audit n'est pas joignable par anon ni authenticated", () => {
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(
      /revoke all on function public\.auditer_privileges_publics\(\)[^;]*from[^;]*public/i,
    );
  });
});

/*
 * La détection, isolée : un test qui ne peut pas échouer ne prouve rien, et
 * on ne dégrade pas un fichier réel pour s'en assurer. On l'éprouve donc sur
 * des chaînes fabriquées, juste en dessous.
 */
export function fonctionsNonFermees(sql: string): string[] {
  const propre = sansCommentaires(sql);
  const creees = [
    ...propre.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.("?)([a-z0-9_]+)\1\s*\(/gi,
    ),
  ].map((x) => x[2]);

  return [...new Set(creees)].filter((nom) => {
    /* Le revoke doit viser `public` : retirer le droit à `anon` seul ne
       ferme rien tant que PUBLIC l'a encore. C'est la leçon exacte du
       17/08, et elle avait été trouvée par ChatGPT, pas par moi. */
    const motif = new RegExp(
      `revoke[^;]*\\bon function\\b[^;]*\\bpublic\\.("?)${nom}\\1\\s*\\([^;]*\\bfrom\\b[^;]*\\bpublic\\b`,
      "i",
    );
    return !motif.test(propre);
  });
}

describe("la détection mord — éprouvée sur des cas fabriqués", () => {
  const creation = "create function public.essai() returns int language sql as 'select 1';";

  it("signale une fonction sans aucun revoke", () => {
    expect(fonctionsNonFermees(creation)).toEqual(["essai"]);
  });

  it("signale un revoke qui ne vise qu'anon — le piège du 17/08", () => {
    const sql = creation + " revoke all on function public.essai() from anon, authenticated;";
    expect(fonctionsNonFermees(sql)).toEqual(["essai"]);
  });

  it("accepte un revoke qui vise public", () => {
    const sql = creation + " revoke all on function public.essai() from public, anon;";
    expect(fonctionsNonFermees(sql)).toEqual([]);
  });

  it("ne se laisse pas berner par un revoke en commentaire", () => {
    const sql = creation + " -- revoke all on function public.essai() from public;";
    expect(fonctionsNonFermees(sql)).toEqual(["essai"]);
  });

  it("distingue deux fonctions dont l'une seulement est fermée", () => {
    const sql =
      creation +
      " create function public.autre(x int) returns int language sql as 'select x';" +
      " revoke all on function public.essai() from public;";
    expect(fonctionsNonFermees(sql)).toEqual(["autre"]);
  });
});

describe("règle permanente — toute fonction porte son propre revoke", () => {
  /*
   * Portée : les migrations POSTÉRIEURES au durcissement. La baseline décrit
   * l'histoire telle qu'elle est, défauts compris ; la réécrire ici la rendrait
   * fausse. La règle vaut pour ce qu'on écrit à partir de maintenant, et c'est
   * là qu'elle protège — toutes les tables et fonctions de la fusion.
   */
  const posterieures = migrations.filter((m) => m.version > DURCISSEMENT);

  it("il y a bien des migrations postérieures à contrôler", () => {
    expect(posterieures.length).toBeGreaterThan(0);
  });

  for (const m of posterieures) {
    it(`${m.nom} — chaque fonction créée est fermée à PUBLIC`, () => {
      const manquantes = fonctionsNonFermees(m.sql);

      expect(
        manquantes,
        `Fonctions sans « revoke … from public » dans ${m.nom} : ${manquantes.join(", ")}.\n` +
          `PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle fonction, et\n` +
          `ALTER DEFAULT PRIVILEGES ne le retire pas sur cette instance (mesuré le 18/08).\n` +
          `Ajoute : revoke all on function public.<nom>(<args>) from public, anon, authenticated;`,
      ).toEqual([]);
    });
  }
});
