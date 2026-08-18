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

  /* La baseline n'accorde plus en bloc pour retirer ensuite : elle accorde
     exactement ce que la production porte. Le contrôle porte donc sur ce qui
     est donné, pas sur ce qui est repris. */
  it("anon ne reçoit que SELECT sur games, prizes et restaurants", () => {
    expect(code).toMatch(/grant select on public\.games, public\.prizes, public\.restaurants to anon;/i);
    expect(code).not.toMatch(/grant[^;]*\b(insert|update|delete)\b[^;]*public\.games[^;]*to[^;]*\banon\b/i);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LES VUES NE DOIVENT JAMAIS PERDRE security_invoker
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sans cette option, une vue s'exécute avec les droits de son PROPRIÉTAIRE —
 * `postgres`, qui contourne la RLS. `public_winners_safe` expose des colonnes
 * de `winners` et accorde SELECT à `anon` : sans l'option, tout visiteur y
 * lirait l'état de tous les tickets, tous restaurants confondus.
 *
 * La première baseline créait les quatre vues sans aucune option. Constaté le
 * 18/08/2026 en comparant `reloptions` : production `security_invoker` sur les
 * quatre, branche reconstruite AUCUNE.
 */
describe("baseline — security_invoker sur les quatre vues", () => {
  const baseline = readFileSync(
    join(ICI, migrations.find((n) => n.includes("baseline_fideliz"))!),
    "utf8"
  );
  const code = baseline
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--") && !l.trimStart().startsWith("*"))
    .join("\n");

  /* Orthographe exacte de la production : « on » pour deux vues, « true »
     pour les deux autres. Même sémantique, mais on restitue tel quel —
     uniformiser corrigerait un état historique sans mandat. */
  const attendu: Record<string, string> = {
    public_restaurants: "on",
    view_integrity_check: "on",
    public_winners_safe: "true",
    v_my_access_status: "true",
  };

  for (const [vue, valeur] of Object.entries(attendu)) {
    it(`${vue} porte security_invoker = ${valeur}`, () => {
      const motif = new RegExp(
        `alter\\s+view\\s+public\\.${vue}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*${valeur}\\s*\\)`,
        "i"
      );
      expect(code).toMatch(motif);
    });
  }

  it("les quatre vues sont créées, et aucune de plus", () => {
    const creees = [...code.matchAll(/create\s+or\s+replace\s+view\s+public\.(\w+)/gi)].map((m) => m[1]);
    expect(creees.sort()).toEqual(Object.keys(attendu).sort());
  });

  /*
   * Le test qui compte le plus. Si quelqu'un recrée `public_winners_safe`
   * plus bas dans le fichier sans repasser l'option, la vue la perd — un
   * `create or replace view` réinitialise les reloptions.
   */
  it("public_winners_safe ne peut pas être recréée après son ALTER VIEW", () => {
    const iAlter = code.search(/alter\s+view\s+public\.public_winners_safe/i);
    const apres = code.slice(iAlter);
    expect(apres).not.toMatch(/create\s+or\s+replace\s+view\s+public\.public_winners_safe/i);
  });

  it("les définitions des vues restent inchangées", () => {
    expect(code).toMatch(/create or replace view public\.public_winners_safe as\s+select id, prize_label_snapshot, created_at, status from public\.winners/i);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  AUCUN GRANT GLOBAL — il a déjà ouvert trois fois plus que la production
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `grant all on all tables in schema public to anon, authenticated` touche
 * AUSSI les vues. Il a donné, à chaque fois sans qu'on le voie :
 *
 *   · huit privilèges sur les quatre vues au lieu de cinq ;
 *   · tous les droits sur `winners`, où ces deux rôles n'en ont AUCUN ;
 *   · REFERENCES, TRIGGER et TRUNCATE partout.
 *
 * Avec la vue `public_winners_safe` accordée à `anon`, cette combinaison
 * rendait les tickets modifiables par un visiteur.
 */
describe("baseline — pas de grant global sur les relations", () => {
  const baseline = readFileSync(
    join(ICI, migrations.find((n) => n.includes("baseline_fideliz"))!),
    "utf8"
  );
  const code = baseline
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--") && !l.trimStart().startsWith("*"))
    .join("\n");

  it("aucun grant global de tables à anon ou authenticated", () => {
    const global = /grant\s+(all|[a-z, ]+)\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+([^;]*)/gi;
    for (const m of code.matchAll(global)) {
      expect(m[2]).not.toMatch(/\banon\b/i);
      expect(m[2]).not.toMatch(/\bauthenticated\b/i);
    }
  });

  it("winners n'est accordée ni à anon ni à authenticated", () => {
    for (const m of code.matchAll(/grant\s+[a-z, ]+\s+on\s+([^;]*?)\s+to\s+([^;]*);/gi)) {
      const cibles = m[1], roles = m[2];
      if (/\banon\b|\bauthenticated\b/i.test(roles)) {
        expect(cibles).not.toMatch(/public\.winners\b(?!_)/i);
      }
    }
  });

  it("les quatre vues reçoivent cinq privilèges, pas huit", () => {
    expect(code).toMatch(
      /grant delete, insert, maintain, select, update on[\s\S]{0,220}public_winners_safe[\s\S]{0,220}to anon, authenticated/i
    );
    expect(code).not.toMatch(/grant\s+all\s+on\s+public\.public_winners_safe/i);
  });

  it("anon ne lit que games, prizes et restaurants — sans écriture", () => {
    expect(code).toMatch(/grant select on public\.games, public\.prizes, public\.restaurants to anon;/i);
  });

  it("authenticated écrit sur ces trois tables mais sans MAINTAIN", () => {
    expect(code).toMatch(
      /grant delete, insert, select, update on public\.games, public\.prizes, public\.restaurants to authenticated;/i
    );
  });
});
