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
    const gel = migrations.find((m) => m.nom.includes("gel_source_fideliz"));
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

describe("gel source Fideliz — aucun laissez-passer, jamais", () => {
  /*
   * Le premier candidat mélangeait gel source (Fideliz, lecture seule pour
   * le migrateur) et gel destination (Cartiz, où le migrateur DOIT écrire)
   * dans un seul mécanisme à jeton. Le migrateur n'écrit JAMAIS dans la
   * source : un jeton de contournement y est une surface privilégiée sans
   * besoin, pas une protection. Séparé le 19/08/2026 — ce test empêche
   * qu'un jeton, une empreinte, ou un `current_setting` ne revienne ici.
   */
  const gel = migrations.find((m) => m.nom.includes("gel_source_fideliz"))!;

  it("la migration existe", () => {
    expect(gel, "aucune migration gel_source_fideliz").toBeDefined();
  });

  it("aucune mention de jeton, empreinte de jeton, ou current_setting", () => {
    const sql = sansCommentaires(gel.sql);
    expect(sql).not.toMatch(/jeton/i);
    expect(sql).not.toMatch(/empreinte_jeton/i);
    expect(sql).not.toMatch(/current_setting/i);
    expect(sql).not.toMatch(/bascule\.jeton/i);
  });

  it("refuser_pendant_maintenance() ne contient aucune branche de passage", () => {
    // Le corps entier, une fois le "if maintenance_actif()" retiré de la
    // lecture, ne doit contenir qu'un raise exception — jamais un chemin
    // qui laisserait passer l'écriture pendant que actif = true.
    const sql = sansCommentaires(gel.sql);
    const corps = sql.match(/create or replace function public\.refuser_pendant_maintenance\(\)[\s\S]*?\$\$;/);
    expect(corps, "fonction refuser_pendant_maintenance introuvable").toBeTruthy();
    const texte = corps![0];
    expect(texte).toMatch(/raise exception/i);
    expect(texte).not.toMatch(/encode\(/i);
    expect(texte).not.toMatch(/digest\(/i);
  });

  it("P0 du 19/08 : le revoke sur `maintenance` cible aussi service_role, pas seulement anon/authenticated", () => {
    // Le premier jet ne retirait les droits qu'à anon/authenticated : service_role
    // gardait, par les DEFAULT PRIVILEGES, un accès direct en écriture sur la table
    // du drapeau — de quoi désactiver le gel sans jamais toucher au trigger.
    const sql = sansCommentaires(gel.sql);
    const revokeTable = sql.match(/revoke all on public\.maintenance from ([^;]+);/i);
    expect(revokeTable, "revoke sur la table maintenance introuvable").toBeTruthy();
    const cibles = revokeTable![1].toLowerCase();
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(cibles, `\`${role}\` doit être dans le revoke sur maintenance`).toContain(role);
    }
  });

  it("P0 du 19/08 : les revoke sur les fonctions internes ciblent aussi service_role", () => {
    const sql = sansCommentaires(gel.sql);
    for (const fn of ["maintenance_actif", "refuser_pendant_maintenance"]) {
      const revoke = sql.match(new RegExp(`revoke all on function public\\.${fn}\\(\\) from ([^;]+);`, "i"));
      expect(revoke, `revoke sur ${fn}() introuvable`).toBeTruthy();
      expect(revoke![1].toLowerCase(), `\`service_role\` doit être dans le revoke sur ${fn}()`).toContain("service_role");
    }
  });

  it("le fencing MVCC (verrou de ligne) précède la lecture du drapeau", () => {
    // Prouvé le 19/08 en concurrence réelle (deux sessions PostgREST) : sans ce
    // verrou, une transaction REPEATABLE READ dont l'instantané précède
    // l'activation ne voit pas maintenance_actif() devenir vrai, et son
    // écriture passe. Le `for share` force PostgreSQL à refuser silencieusement
    // une version périmée de la ligne (40001) plutôt que de laisser lire le
    // drapeau obsolète. Ce test ne peut pas rejouer la concurrence (pas de
    // deuxième session ici) — il garde seulement la présence et l'ordre du verrou.
    const sql = sansCommentaires(gel.sql);
    const corps = sql.match(/create or replace function public\.refuser_pendant_maintenance\(\)[\s\S]*?\$\$;/);
    expect(corps, "fonction refuser_pendant_maintenance introuvable").toBeTruthy();
    const texte = corps![0];
    expect(texte, "le verrou `for share` sur maintenance a disparu").toMatch(
      /from public\.maintenance where id for share/i,
    );
    const indexVerrou = texte.search(/for share/i);
    const indexLectureDrapeau = texte.search(/maintenance_actif\(\)/i);
    expect(indexVerrou, "le verrou doit être pris avant la lecture de maintenance_actif()").toBeLessThan(
      indexLectureDrapeau,
    );
    // for share, jamais for update : un for update sérialiserait aussi les
    // écritures concurrentes entre elles (pas seulement contre l'activation).
    expect(texte).not.toMatch(/for update/i);
  });
});

describe("gel source Fideliz — inventaire exhaustif des tables, aucun angle mort", () => {
  /*
   * Classées nominativement le 19/08/2026 (docs/qualification-couche-4-gel.md
   * §3) : 10 gelées, 7 exclues avec justification individuelle. Ce test ne
   * vérifie pas que la classification est *correcte* — c'est une décision
   * produit, pas un fait vérifiable par regex — mais qu'aucune table créée
   * par une migration ne reste NON classée : ni gelée, ni sur la liste des
   * exclusions documentées. Une future migration qui ajoute une table sans
   * mettre à jour l'un des deux camps fait échouer ce test, au lieu de
   * laisser un angle mort silencieux.
   */
  const gel = migrations.find((m) => m.nom.includes("gel_source_fideliz"))!;

  const TABLES_GELEES = [
    "winners", "contacts", "prizes", "games", "restaurants", "profiles",
    "avis", "crm_notes", "sales_restaurants", "winners_archive",
  ];

  const TABLES_EXCLUES_DOCUMENTEES = [
    "maintenance", "system_logs", "activity_logs_legacy",
    "auth_ghosts_backup_20260606", "auth_orphan_backup_20260606",
    "contacts_backup_20260606", "winners_backup_20260606",
  ];

  it("le tableau `tables` du fichier gel contient exactement les 10 tables attendues", () => {
    const sql = sansCommentaires(gel.sql);
    const bloc = sql.match(/tables\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/);
    expect(bloc, "tableau `tables` introuvable dans le fichier gel").toBeTruthy();
    const trouvees = Array.from(bloc![1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(new Set(trouvees)).toEqual(new Set(TABLES_GELEES));
  });

  it("chaque exclusion documentée l'est nommément dans le commentaire d'inventaire", () => {
    for (const table of TABLES_EXCLUES_DOCUMENTEES) {
      expect(gel.sql, `\`${table}\` n'est plus mentionnée dans l'inventaire du fichier gel`).toMatch(
        new RegExp("`" + table + "`"),
      );
    }
  });

  it("aucune table créée par une migration n'échappe aux deux camps (gelée ou exclue documentée)", () => {
    const connues = new Set([...TABLES_GELEES, ...TABLES_EXCLUES_DOCUMENTEES]);
    const nonClassees = new Set<string>();
    for (const m of migrations) {
      const sansCom = sansCommentaires(m.sql);
      const matches = sansCom.matchAll(
        /create table(?:\s+if not exists)?\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      );
      for (const match of matches) {
        const table = match[1].toLowerCase();
        if (!connues.has(table)) nonClassees.add(table);
      }
    }
    expect(
      Array.from(nonClassees),
      "table(s) créée(s) par une migration mais absente(s) des deux listes de classification (gelée / exclue documentée) — mettre à jour le fichier gel et ce test",
    ).toEqual([]);
  });
});
