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

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LES ACL DE LA BASELINE NE DOIVENT JAMAIS S'OUVRIR EN GRAND
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La première version de la baseline se terminait par un
 * `grant all on all functions in schema public to anon, authenticated`.
 * Elle aurait ouvert à tout visiteur six fonctions que la production
 * restreint — dont `play_game` et `register_win`, qui créent des
 * participations et décrémentent des stocks.
 *
 * Et le replay ne l'aurait pas rattrapé : la migration P0 du 17/08 ne ferme
 * que deux fonctions. Les six autres seraient restées ouvertes dans une
 * baseline censée reproduire fidèlement la production.
 *
 * Ces tests lisent le dépôt : ni base, ni secret.
 */
describe("baseline — les ACL des fonctions sensibles", () => {
  const baseline = readFileSync(
    join(ICI, migrations.find((n) => n.includes("baseline_fideliz"))!),
    "utf8"
  );
  /* On raisonne sur le code seul : le commentaire explique justement le
     piège en le citant, et on ne veut pas confondre les deux. */
  const code = baseline
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--") && !l.trimStart().startsWith("*"))
    .join("\n");

  it("aucun grant global sur les fonctions", () => {
    expect(code).not.toMatch(/grant\s+(all|execute)\s+on\s+all\s+functions/i);
  });

  const reservees = [
    "play_game",
    "register_win",
    "get_replay_status",
    "anonymize_expired_data",
    "get_sales_stats",
  ];

  for (const fn of reservees) {
    it(`${fn} est retirée à public, anon et authenticated`, () => {
      const revoke = new RegExp(
        `revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*from\\s+public,\\s*anon,\\s*authenticated`,
        "i"
      );
      expect(code).toMatch(revoke);
    });

    it(`${fn} est accordée à service_role`, () => {
      const grant = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+service_role`,
        "i"
      );
      expect(code).toMatch(grant);
    });
  }

  it("activate_game reste ouverte aux comptes connectés, fermée aux anonymes", () => {
    expect(code).toMatch(/revoke\s+execute\s+on\s+function\s+public\.activate_game\s*\([^)]*\)\s*from\s+public,\s*anon/i);
    expect(code).toMatch(/grant\s+execute\s+on\s+function\s+public\.activate_game\s*\([^)]*\)\s*to\s+authenticated,\s*service_role/i);
  });

  /*
   * L'inverse compte autant. Ces deux-là DOIVENT rester ouvertes dans la
   * baseline : c'est l'état d'avant, et c'est la migration P0 qui les ferme.
   * Les refermer ici ferait perdre la trace de la faille.
   */
  for (const fn of ["_log_event", "archive_redeemed_winners"]) {
    it(`${fn} reste ouverte dans la baseline — c'est le P0 qui la ferme`, () => {
      expect(code).not.toMatch(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}`, "i"));
      const p0 = readFileSync(
        join(ICI, migrations.find((n) => n.includes("rpc_destructives"))!),
        "utf8"
      );
      expect(p0).toMatch(new RegExp(`revoke execute on function public\\.${fn}`, "i"));
    });
  }

  it("anon n'écrit pas sur games, prizes ni restaurants", () => {
    for (const t of ["games", "prizes", "restaurants"]) {
      expect(code).toMatch(new RegExp(`revoke insert, update, delete on public\\.${t}\\s+from anon`, "i"));
    }
  });
});
