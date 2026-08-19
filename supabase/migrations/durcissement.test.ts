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
    // Le corps entier, une fois le "if v_actif then" retiré de la lecture,
    // ne doit contenir qu'un raise exception — jamais un chemin qui
    // laisserait passer l'écriture pendant que actif = true.
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

  it("P0 du 19/08 : le revoke sur la fonction interne cible aussi service_role", () => {
    const sql = sansCommentaires(gel.sql);
    const revoke = sql.match(/revoke all on function public\.refuser_pendant_maintenance\(\) from ([^;]+);/i);
    expect(revoke, "revoke sur refuser_pendant_maintenance() introuvable").toBeTruthy();
    expect(revoke![1].toLowerCase(), "`service_role` doit être dans le revoke sur refuser_pendant_maintenance()").toContain(
      "service_role",
    );
  });

  it("maintenance_actif() n'existe plus — verrou et décision viennent d'une seule lecture", () => {
    // Signalé le 19/08 : une première correction ajoutait le verrou `for share`
    // PUIS appelait maintenance_actif(), une fonction séparée qui relisait la
    // table SANS verrou — rien ne garantissait que les deux lectures portaient
    // sur la même version de la ligne. Corrigé en supprimant cette fonction
    // (son unique appelante était refuser_pendant_maintenance) et en fusionnant
    // verrou + décision dans un seul `select ... for share into`.
    const sql = sansCommentaires(gel.sql);
    expect(sql, "maintenance_actif() ne doit plus être définie").not.toMatch(
      /create (or replace )?function public\.maintenance_actif/i,
    );
    expect(sql, "maintenance_actif() ne doit plus être appelée").not.toMatch(/maintenance_actif\(\)/i);
  });

  it("le fencing MVCC : un seul select verrouillant fournit le verrou, actif et message", () => {
    // Prouvé le 19/08 en concurrence réelle (deux sessions PostgREST) : sans un
    // verrou pris AVANT toute décision, une transaction REPEATABLE READ dont
    // l'instantané précède l'activation peut laisser passer l'écriture. Le
    // `for share` force PostgreSQL à refuser silencieusement une version
    // périmée de la ligne (40001) plutôt que de laisser lire un drapeau
    // obsolète. Ce test ne peut pas rejouer la concurrence (pas de deuxième
    // session ici) — il garde la forme structurelle : une seule requête
    // verrouillante, avant toute décision, avec un contrôle FOUND explicite.
    const sql = sansCommentaires(gel.sql);
    const corps = sql.match(/create or replace function public\.refuser_pendant_maintenance\(\)[\s\S]*?\$\$;/);
    expect(corps, "fonction refuser_pendant_maintenance introuvable").toBeTruthy();
    const texte = corps![0];

    expect(texte, "la lecture verrouillante de actif/message a disparu").toMatch(
      /select\s+actif\s*,\s*message\s+into\s+v_actif\s*,\s*v_message\s+from\s+public\.maintenance\s+where\s+id\s+for\s+share/i,
    );
    const occurrencesLectureTable = texte.match(/from public\.maintenance/gi) ?? [];
    expect(
      occurrencesLectureTable.length,
      "une seule lecture de public.maintenance doit exister dans ce corps (le verrou et la décision ne doivent plus provenir de deux requêtes distinctes)",
    ).toBe(1);
    expect(texte, "la ligne absente doit échouer fermé (if not found)").toMatch(/if not found then/i);

    const indexVerrou = texte.search(/for share/i);
    const indexDecision = texte.search(/if v_actif then/i);
    expect(indexVerrou, "le verrou doit précéder la décision").toBeLessThan(indexDecision);

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
    /*
     * Troisième voie de classification, ajoutée le 19/08/2026.
     *
     * Jusqu'ici une table ne pouvait être déclarée hors gel qu'en la
     * nommant dans l'inventaire du FICHIER GEL. C'était une impasse : toute
     * migration ultérieure devait rouvrir une couche déjà appliquée et
     * qualifiée, juste pour y ajouter une phrase — donc en changer le
     * contenu, donc en invalider l'empreinte.
     *
     * Une migration peut désormais justifier ELLE-MÊME l'exclusion de la
     * table qu'elle crée, par un bloc `HORS GEL` qui la nomme. C'est plus
     * strict, pas moins : la justification vit à l'endroit exact où la
     * décision est prise, et une table créée sans un mot d'explication reste
     * un échec.
     */
    const connues = new Set([...TABLES_GELEES, ...TABLES_EXCLUES_DOCUMENTEES]);
    const nonClassees = new Set<string>();
    for (const m of migrations) {
      const sansCom = sansCommentaires(m.sql);
      const matches = sansCom.matchAll(
        /create table(?:\s+if not exists)?\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      );
      for (const match of matches) {
        const table = match[1].toLowerCase();
        if (connues.has(table)) continue;
        // La migration qui crée la table doit porter sa justification.
        const justifiee =
          /HORS GEL/i.test(m.sql) && new RegExp("`" + table + "`").test(m.sql);
        if (!justifiee) nonClassees.add(table);
      }
    }
    expect(
      Array.from(nonClassees),
      "table(s) créée(s) par une migration sans classification : ni gelée, ni nommée dans l'inventaire du fichier gel, ni justifiée par un bloc `HORS GEL` dans sa propre migration",
    ).toEqual([]);
  });
});

describe("gel source Fideliz — activation/levée fail-closed, jamais service_role", () => {
  // Signalé le 19/08 (2e et 3e tours) : un update nu sans contrôle du
  // nombre de lignes peut échouer silencieusement ; un simple count(*) = 10
  // triggers ne détecte pas un trigger sur la mauvaise table, en AFTER, sur
  // deux événements sur trois, pointant vers la mauvaise fonction, ou
  // désactivé ; une deuxième activation/levée ne doit pas être un no-op
  // silencieux.
  const VERIFICATIONS = join(ICI, "..", "verifications");

  it("activer-gel-source-fideliz.sql vérifie les triggers par catalogue système (identité exacte, pas correspondance textuelle)", () => {
    // Signalé le 19/08 (5e tour) : la version précédente reconnaissait la
    // fonction par `action_statement ilike '%refuser_pendant_maintenance%'`
    // — textuel, pas une identité : une fonction nommée
    // `evil_refuser_pendant_maintenance_bypass()` aurait matché. Et la
    // portée FOR EACH ROW n'était jamais contrôlée. Ces gardes-ci vérifient
    // que le script lit bien pg_trigger/pg_proc ; la preuve VIVANTE que les
    // deux cas d'attaque sont effectivement refusés est en §10 de
    // docs/qualification-couche-4-gel.md (jouée sur fusion-tests-2).
    const sql = readFileSync(join(VERIFICATIONS, "activer-gel-source-fideliz.sql"), "utf8");
    const sansCom = sansCommentaires(sql);
    expect(sansCom).toMatch(/get diagnostics\s+\w+\s*=\s*row_count/i);
    expect(sansCom).toMatch(/if\s+\w+\s*<>\s*1\s+then\s+raise exception/i);
    expect(sansCom).toMatch(/tgname\s*=\s*'gel_de_bascule'/i);

    // Identité EXACTE de la fonction par OID, jamais une correspondance de nom.
    expect(sansCom, "la fonction doit être identifiée par regprocedure, pas par ILIKE").toMatch(
      /tgfoid\s*=\s*'public\.refuser_pendant_maintenance\(\)'::regprocedure/i,
    );
    expect(sansCom, "aucune reconnaissance de fonction par correspondance textuelle").not.toMatch(
      /action_statement\s+ilike/i,
    );

    // tgtype = 31 en égalité STRICTE : BEFORE+ROW+INSERT+UPDATE+DELETE et
    // rien d'autre. Exclut un trigger STATEMENT (bit ROW absent) comme un
    // trigger portant TRUNCATE en plus (bit 32).
    expect(sansCom, "tgtype doit être comparé en égalité stricte à 31").toMatch(/tgtype\s*=\s*31/i);

    expect(sansCom).toMatch(/tgenabled\s*=\s*'O'/i);
    // Exactement un trigger par table attendue.
    expect(sansCom).toMatch(/coalesce\(r\.n,\s*0\)\s*=\s*1/i);
    // Aucun trigger gel_de_bascule sur une table hors de la liste attendue,
    // lu depuis pg_class (pas information_schema).
    expect(sansCom).toMatch(/c\.relname\s*<>\s*all\s*\(/i);
    // Transition stricte : refuse si déjà actif.
    expect(sansCom).toMatch(/if\s+v_actif_avant\s+then\s+raise exception/i);
    expect(sansCom).not.toMatch(/service_role/i);
  });

  it("lever-gel-source-fideliz.sql existe, contrôle le row_count, transition stricte, jamais service_role", () => {
    const sql = readFileSync(join(VERIFICATIONS, "lever-gel-source-fideliz.sql"), "utf8");
    const sansCom = sansCommentaires(sql);
    expect(sansCom).toMatch(/get diagnostics\s+\w+\s*=\s*row_count/i);
    expect(sansCom).toMatch(/if\s+\w+\s*<>\s*1\s+then\s+raise exception/i);
    // Transition stricte : refuse si déjà inactif.
    expect(sansCom).toMatch(/if\s+not\s+v_actif_avant\s+then\s+raise exception/i);
    expect(sansCom).not.toMatch(/service_role/i);
  });
});

describe("gel source Fideliz — harnais de concurrence gardé (cible synthétique, nettoyage protégé)", () => {
  // Signalé le 19/08 (3e tour) : la garde d'identité par nonce n'intervenait
  // qu'après la création des fonctions témoins SECURITY DEFINER — trop
  // tard si la cible n'était pas la bonne. Et le nettoyage DDL forçait
  // actif=false sans condition, ce qui aurait levé un gel réellement actif.
  const VERIFICATIONS = join(ICI, "..", "verifications");

  it("harnais-gel-concurrence.sql garde la cible AVANT toute création (auth.users, transaction unique)", () => {
    const sql = readFileSync(join(VERIFICATIONS, "harnais-gel-concurrence.sql"), "utf8");
    const sansCom = sansCommentaires(sql);
    // Une seule transaction enveloppant tout le fichier.
    expect(sansCom.trim()).toMatch(/^begin;/i);
    expect(sansCom).toMatch(/commit;/i);
    // La garde (vérification auth.users) doit précéder la première création.
    const indexGarde = sansCom.search(/from auth\.users/i);
    const indexPremiereCreation = sansCom.search(/create (or replace )?function/i);
    expect(indexGarde, "vérification auth.users introuvable").toBeGreaterThan(-1);
    expect(indexPremiereCreation, "aucune création de fonction trouvée").toBeGreaterThan(-1);
    expect(indexGarde, "la garde doit précéder toute création de fonction").toBeLessThan(indexPremiereCreation);
    expect(sansCom).toMatch(/v_utilisateurs_auth\s*>\s*0\s+then\s+raise exception/i);
    // Variante REPEATABLE READ via attribut de fonction (proconfig), pas SET dans le corps.
    expect(sansCom).toMatch(/set default_transaction_isolation to 'repeatable read'/i);
    expect(sansCom).toMatch(/notify pgrst, 'reload schema'/i);
  });

  it("harnais-gel-concurrence-nettoyage.sql refuse si l'état n'est pas exactement ligne présente/actif=false", () => {
    const sql = readFileSync(join(VERIFICATIONS, "harnais-gel-concurrence-nettoyage.sql"), "utf8");
    const sansCom = sansCommentaires(sql);
    expect(sansCom.trim()).toMatch(/^begin;/i);
    // Garde le nombre de lignes ET la valeur d'actif AVANT toute suppression.
    const indexGardeLignes = sansCom.search(/v_lignes\s*<>\s*1\s+then\s+raise exception/i);
    const indexGardeActif = sansCom.search(/v_actif\s+is\s+distinct\s+from\s+false\s+then\s+raise exception/i);
    const indexPremierDrop = sansCom.search(/drop function/i);
    expect(indexGardeLignes, "garde sur le nombre de lignes introuvable").toBeGreaterThan(-1);
    expect(indexGardeActif, "garde sur actif=false introuvable").toBeGreaterThan(-1);
    expect(indexPremierDrop, "aucun drop function trouvé").toBeGreaterThan(-1);
    expect(indexGardeLignes).toBeLessThan(indexPremierDrop);
    expect(indexGardeActif).toBeLessThan(indexPremierDrop);
    // Ne force jamais actif=false sans condition — pas de simple
    // "on conflict ... do update set actif = false" en dehors de la garde.
    expect(sansCom).not.toMatch(/on conflict[^;]*do update set actif\s*=\s*false/i);
  });
});

describe("harnais de cascade — fail-closed, pas un tableau à lire", () => {
  // Signalé le 19/08 (relais 024) : la sortie attendue n'était qu'un
  // commentaire et un tableau. Une valeur erronée, un `ERREUR : ...`, un
  // manifeste différent ou un résidu pouvaient s'afficher pendant que le
  // script terminait en succès. Ces gardes exigent que chaque assertion
  // critique existe VRAIMENT dans le fichier versionné.
  const VERIFICATIONS = join(ICI, "..", "verifications");
  const harnais = readFileSync(join(VERIFICATIONS, "harnais-cascade-suppression.sql"), "utf8");
  const sansCom = sansCommentaires(harnais);

  it("une seule transaction, annulée à la fin", () => {
    expect(sansCom.trim()).toMatch(/^begin;/i);
    expect(sansCom.trim()).toMatch(/rollback;\s*$/i);
  });

  it("la garde de cible synthétique précède toute mutation", () => {
    const indexGarde = sansCom.search(/from auth\.users/i);
    const indexPremiereMutation = sansCom.search(/insert into auth\.users/i);
    expect(indexGarde).toBeGreaterThan(-1);
    expect(indexGarde).toBeLessThan(indexPremiereMutation);
    expect(sansCom).toMatch(/v_users\s*>\s*0\s+then\s+raise exception/i);
  });

  it("garde anti-dérive sur les DEUX invariants dont le code dépend", () => {
    /*
     * Ce test EXIGEAIT `restaurants_user_id_fkey` et `profiles_id_fkey` —
     * c'est-à-dire qu'il exigeait le défaut. Signalé le 19/08/2026 : un nom
     * de contrainte est décoratif, et la garde qui s'y fiait ne voyait ni
     * une FK recréée sous un autre nom avec une autre action, ni une FK
     * supplémentaire sur la même colonne.
     *
     * On exige désormais l'inverse : que les noms n'apparaissent PAS, et que
     * la garde nomme la sémantique complète des deux invariants.
     */
    expect(sansCom, "un nom de contrainte ne prouve rien").not.toMatch(/restaurants_user_id_fkey/);
    expect(sansCom, "un nom de contrainte ne prouve rien").not.toMatch(/profiles_id_fkey/);

    // Invariant 1 : public.restaurants(user_id) -> auth.users(id) CASCADE.
    expect(sansCom).toMatch(/source\s*=\s*'public\.restaurants'\s+and\s+colonnes_source\s*=\s*'user_id'/);
    // Invariant 2 : public.profiles(id) -> auth.users(id) CASCADE.
    expect(sansCom).toMatch(/source\s*=\s*'public\.profiles'\s+and\s+colonnes_source\s*=\s*'id'/);
    expect(sansCom.match(/cible\s*=\s*'auth\.users'\s+and\s+colonnes_cible\s*=\s*'id'\s+and\s+on_delete\s*=\s*'c'/g)?.length ?? 0)
      .toBe(2);

    // Et la cardinalité exacte : une seule FK part de chacune des colonnes.
    expect(sansCom.match(/v_total\s*<>\s*1/g)?.length ?? 0).toBe(2);
    expect(sansCom.match(/DÉRIVE/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("les deux rollbacks délibérés utilisent des SQLSTATE privés distincts", () => {
    // Une comparaison de message se casse au premier reformulage, et
    // avalerait alors une VRAIE erreur en la prenant pour le rollback voulu.
    expect(sansCom).toMatch(/errcode\s*=\s*'P9001'/);
    expect(sansCom).toMatch(/errcode\s*=\s*'P9002'/);
    expect(sansCom).toMatch(/when sqlstate 'P9001' then null/i);
    expect(sansCom).toMatch(/when sqlstate 'P9002' then null/i);
    // Toute autre exception se repropage au lieu d'être convertie en texte.
    expect(sansCom.match(/when others then raise;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("les valeurs attendues sont ASSERTÉES, pas seulement affichées", () => {
    expect(sansCom, "la branche SANS doit exiger exactement 0/0/0/0/0/0").toMatch(
      /\(nr,\s*ng,\s*np,\s*nw,\s*nc,\s*nv\)\s+is distinct from\s+\(0,\s*0,\s*0,\s*0,\s*0,\s*0\)/i,
    );
    expect(sansCom, "la branche AVEC doit exiger exactement 1/1/1/1/1/1").toMatch(
      /\(nr,\s*ng,\s*np,\s*nw,\s*nc,\s*nv\)\s+is distinct from\s+\(1,\s*1,\s*1,\s*1,\s*1,\s*1\)/i,
    );
    // Profil parti par cascade, et les TROIS rattachements sur le root.
    expect(sansCom).toMatch(/le profil .*aurait du partir par cascade/i);
    expect(sansCom).toMatch(/TROIS rattachements/i);
  });

  it("empreinte de DONNÉES et manifeste de SCHÉMA sont distincts et tous deux vérifiés", () => {
    expect(sansCom).toMatch(/empreinte_donnees_avant/);
    expect(sansCom).toMatch(/empreinte_donnees_apres/);
    /*
     * Le manifeste n'était calculé qu'APRÈS : il n'y avait aucun « avant »
     * à lui opposer, malgré le commentaire qui promettait la comparaison.
     * On exige les deux points, et leur confrontation par une assertion.
     */
    expect(sansCom, "sans « avant », un manifeste ne compare rien").toMatch(/manifeste_schema_avant/);
    expect(sansCom).toMatch(/manifeste_schema_apres/);
    expect(sansCom).toMatch(/v_schema_avant is distinct from v_schema_apres then\s+raise exception/i);
    // Un manifeste absent est un échec, pas un silence.
    expect(sansCom).toMatch(/v_schema_avant is null or v_schema_apres is null/);
    // Et il porte la sémantique complète, pas seulement l'action.
    expect(sansCom).toMatch(/confdeltype::text/);
    expect(sansCom).toMatch(/confupdtype::text/);
    expect(sansCom, "les colonnes cibles doivent entrer dans l'empreinte").toMatch(/con\.confkey/);
  });

  it("verdict final : empreinte identique, 0 Auth résiduel, 0 témoin — chacun assertés", () => {
    expect(sansCom).toMatch(/v_avant is distinct from v_apres then\s+raise exception/i);
    expect(sansCom).toMatch(/v_users <> '0' then\s+raise exception/i);
    expect(sansCom).toMatch(/v_temoins <> '0' then\s+raise exception/i);
  });

  it("aucune adresse réelle : les identités sont en .invalid (RFC 2606)", () => {
    const adresses = harnais.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(adresses.length).toBeGreaterThan(0);
    for (const a of adresses) expect(a, `${a} n'est pas en .invalid`).toMatch(/\.invalid$/);
  });
});
