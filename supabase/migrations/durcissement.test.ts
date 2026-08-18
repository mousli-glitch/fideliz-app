import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LE DURCISSEMENT, ET LA RÈGLE QUI LE COMPLÈTE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Deux protections indépendantes, et il en faut deux.
 *
 * 1. LES DÉFAUTS. La forme GLOBALE — sans `IN SCHEMA` — retire bien à
 *    `PUBLIC` l'EXECUTE que PostgreSQL accorde à toute nouvelle fonction.
 *    J'avais conclu l'inverse : mes quatre essais portaient `IN SCHEMA
 *    public`, or les défauts par schéma s'AJOUTENT aux globaux et ne peuvent
 *    rien en retirer. Je testais la seule forme incapable de le faire.
 *
 *    Le revers : « global » vaut pour tout schéma, et `postgres` crée aussi
 *    des fonctions dans `extensions` (49 sur 55 en production). D'où le
 *    rattrapage explicite qui rend à `extensions` son comportement d'origine.
 *
 * 2. LA RÈGLE. Chaque fonction de `public` porte son propre revoke. Elle est
 *    conservée : une protection qui repose sur une entrée de catalogue que
 *    personne ne regarde est une protection qu'un `ALTER` distrait annule.
 *
 * C'est le défaut exact qui a produit les deux P0 du 17/08 —
 * `archive_redeemed_winners` et `_log_event` appelables sans compte.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
/*
 * Réconcilié le 18/08/2026 soir avec le candidat réellement déployé en
 * production (`5094af3`) : l'ancien brouillon `20260818010000` (avec
 * fonction d'audit, positionné AVANT la RLS) a été remplacé par le fichier
 * effectivement livré, `20260818150000` — après la RLS/identité-root
 * (`20260818011000_rls_isolation_inter_tenant.sql`), sans fonction d'audit.
 */
const DURCISSEMENT = "20260818150000";

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

  it("le revoke des fonctions est GLOBAL, sans IN SCHEMA", () => {
    /* La forme `IN SCHEMA public` ne peut RIEN retirer d'un défaut global :
       les entrées de schéma s'ajoutent aux globales. C'est l'erreur que j'ai
       faite, et ce test existe pour qu'elle ne revienne pas. */
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(
      /alter default privileges for role postgres\s+revoke execute on functions from public/i,
    );
  });

  it("extensions retrouve explicitement son EXECUTE public", () => {
    /* Sans ce rattrapage, une mise à jour de pgcrypto par postgres recréerait
       `gen_random_bytes` fermée — et `winners.qr_code`, dont c'est le défaut
       de colonne, cesserait de s'insérer chez de vrais restaurants. */
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(
      /alter default privileges for role postgres in schema extensions\s+grant execute on functions to public/i,
    );
  });

  it("le rattrapage extensions vient APRÈS le revoke global", () => {
    const sql = sansCommentaires(durcissement!.sql);
    const global = sql.search(/alter default privileges for role postgres\s+revoke execute on functions/i);
    const rattrapage = sql.search(/in schema extensions\s+grant execute on functions/i);
    expect(global).toBeGreaterThan(-1);
    expect(rattrapage).toBeGreaterThan(global);
  });

  it("service_role n'obtient sur les séquences que USAGE et SELECT", () => {
    const sql = sansCommentaires(durcissement!.sql);
    expect(sql).toMatch(/grant usage, select on sequences to service_role/i);
    expect(sql).not.toMatch(/grant all on sequences to service_role/i);
  });

  /*
   * La fonction `auditer_privileges_publics()` a existé dans un brouillon de
   * cette migration. Le candidat réellement déployé en production (`5094af3`,
   * commit "candidat minimal, sans fonction d'audit") l'exclut délibérément —
   * la détection repose sur `sentinelle-privileges-anon.sql` et
   * `empreintes.sql`, versionnés et rejouables, plutôt que sur une fonction
   * vivant dans la base. Pas de test la réclamant ici : ce serait tester un
   * brouillon abandonné, pas ce qui protège réellement.
   */
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

describe("tables de sauvegarde — 133 lignes personnelles, fermées par la RLS seule", () => {
  /*
   * Leur protection ne tient pas à une absence de droits : `anon` et
   * `authenticated` détiennent SELECT, INSERT, UPDATE et DELETE dessus.
   * Elle tient à la RLS activée SANS AUCUNE POLICY.
   *
   * Ce test-ci ne peut pas interroger la base — le garde tourne hors ligne.
   * Il vérifie donc ce qu'il peut vraiment vérifier : qu'aucune migration
   * versionnée ne désactive leur RLS ni ne leur ajoute de policy. Le contrôle
   * de l'état RÉEL est `supabase/verifications/tables-de-sauvegarde.sql`, à
   * passer sur la production avant toute bascule.
   */
  const SAUVEGARDES = [
    "auth_ghosts_backup_20260606",
    "auth_orphan_backup_20260606",
    "contacts_backup_20260606",
    "winners_backup_20260606",
  ];

  for (const t of SAUVEGARDES) {
    it(`${t} — aucune migration ne désactive sa RLS`, () => {
      for (const m of migrations) {
        const sql = sansCommentaires(m.sql);
        const motif = new RegExp(`alter table[^;]*\\b${t}\\b[^;]*disable row level security`, "i");
        expect(sql, `${m.nom} désactive la RLS de ${t}`).not.toMatch(motif);
      }
    });

    it(`${t} — aucune migration ne lui ajoute de policy`, () => {
      for (const m of migrations) {
        const sql = sansCommentaires(m.sql);
        const motif = new RegExp(`create policy[^;]*\\bon public\\.${t}\\b`, "i");
        expect(sql, `${m.nom} ajoute une policy sur ${t}`).not.toMatch(motif);
      }
    });
  }

  it("la baseline active bien leur RLS", () => {
    const baseline = migrations.find((m) => m.version === "00000000000000")!;
    const sql = sansCommentaires(baseline.sql);
    for (const t of SAUVEGARDES) {
      expect(sql, `${t} sans « enable row level security » dans la baseline`).toMatch(
        new RegExp(`alter table[^;]*\\b${t}\\b[^;]*enable row level security`, "i"),
      );
    }
  });
});
