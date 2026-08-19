import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE PAQUET DE HOTFIX NE PEUT PAS DIVERGER DU DÉPÔT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `hotfix/isolation-lot-jeu/` est ce qui sera réellement joué en production.
 * `supabase/migrations/` et `supabase/rollback/` sont ce qui est audité,
 * relu et versionné avec le reste. Si les deux divergent, l'audit ne porte
 * plus sur ce qui s'exécute — et c'est le genre d'écart que personne ne voit,
 * parce que les deux fichiers ont l'air de dire la même chose.
 *
 * ─── POURQUOI PAS UNE ÉGALITÉ OCTET À OCTET ───
 *
 * Le fichier du paquet ouvre sa PROPRE transaction : il est joué à la main,
 * par un opérateur, et ne peut pas dépendre de l'outil qui l'exécute. La
 * migration, elle, suit la convention du dépôt — l'outil de migration
 * l'enveloppe déjà, et y ajouter un `begin;` provoquerait une transaction
 * imbriquée.
 *
 * Une égalité stricte serait donc la mauvaise exigence : elle forcerait l'un
 * des deux à être faux. Ce qui doit être identique, c'est la SUBSTANCE — le
 * bloc qui décide et qui écrit. C'est ce qu'on vérifie.
 */

const RACINE = join(__dirname, "..", "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

const MIGRATION = lire("supabase/migrations/20260819080000_isolation_lot_jeu.sql");
const ROLLBACK  = lire("supabase/rollback/20260819080000_rollback.sql");
const APPLIQUER = lire("hotfix/isolation-lot-jeu/02-appliquer.sql");
const RETOUR    = lire("hotfix/isolation-lot-jeu/04-retour-arriere.sql");
const PREFLIGHT = lire("hotfix/isolation-lot-jeu/01-preflight-production.sql");
const POST      = lire("hotfix/isolation-lot-jeu/03-controles-post.sql");
const RUNNER    = lire("supabase/verifications/harnais-machine-etat-hotfix.sql");
const README    = lire("hotfix/isolation-lot-jeu/README.md");

/** Le bloc substantiel : du premier `do $$` jusqu'à la fin du fichier. */
const substance = (s: string) => s.slice(s.indexOf("do $$"));

const PREIMAGE  = "374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3";
const POSTIMAGE = "32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442";

describe("le paquet de hotfix porte la substance canonique", () => {
  it("`02-appliquer.sql` contient VERBATIM le bloc de la migration", () => {
    expect(APPLIQUER).toContain(substance(MIGRATION));
  });

  it("`04-retour-arriere.sql` est le rollback canonique", () => {
    expect(RETOUR).toBe(ROLLBACK);
  });
});

describe("les constantes sont les mêmes partout — sinon le harnais teste autre chose", () => {
  const fichiers: [string, string][] = [
    ["migration", MIGRATION], ["rollback", ROLLBACK], ["préflight", PREFLIGHT],
    ["contrôles post", POST], ["runner", RUNNER], ["README", README],
  ];

  for (const [nom, contenu] of fichiers) {
    it(`${nom} porte le POSTIMAGE attendu`, () => {
      expect(contenu).toContain(POSTIMAGE);
    });
  }

  // Les contrôles post n'ont pas à connaître la préimage : ils vérifient
  // qu'on est arrivé, pas d'où on vient.
  for (const [nom, contenu] of fichiers.filter(([n]) => n !== "contrôles post")) {
    it(`${nom} porte la PRÉIMAGE attendue`, () => {
      expect(contenu).toContain(PREIMAGE);
    });
  }

  it("les deux fragments sont écrits à l'identique dans la migration et le runner", () => {
    for (const fragment of [
      "select * into v_prize from prizes where id = p_prize_id;",
      "select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;",
      "update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;",
      "update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;",
    ]) {
      expect(MIGRATION, `migration : ${fragment}`).toContain(fragment);
      expect(RUNNER, `runner : ${fragment}`).toContain(fragment);
    }
  });
});

describe("l'application et le retour arrière sont atomiques par eux-mêmes", () => {
  /*
   * Sans transaction explicite, une interruption entre le `revoke` et le
   * `grant` laisse la fonction corrigée mais SANS DROIT D'EXÉCUTION : le
   * parcours joueur cassé en production, par un correctif de sécurité.
   */
  for (const [nom, contenu] of [["application", APPLIQUER], ["retour arrière", RETOUR]] as const) {
    it(`${nom} : transaction explicite, du début à la fin`, () => {
      expect(contenu).toMatch(/^\s*begin\s*;/m);
      expect(contenu.trimEnd().endsWith("commit;")).toBe(true);
    });

    it(`${nom} : délais bornés — refuser plutôt qu'attendre sur une production active`, () => {
      expect(contenu).toContain("set local lock_timeout");
      expect(contenu).toContain("set local statement_timeout");
    });

    it(`${nom} : verrou consultatif contre deux exécutions concurrentes`, () => {
      expect(contenu).toContain("pg_advisory_xact_lock");
    });

    it(`${nom} : les droits sont revérifiés AVANT le commit`, () => {
      const avantCommit = contenu.slice(0, contenu.lastIndexOf("commit;"));
      expect(avantCommit).toContain("has_function_privilege('service_role'");
    });
  }
});

describe("préflight et contrôles post lèvent, ils n'affichent pas", () => {
  for (const [nom, contenu] of [["préflight", PREFLIGHT], ["contrôles post", POST]] as const) {
    it(`${nom} : refuse une fonction ABSENTE — zéro ligne se lirait comme un succès`, () => {
      expect(contenu).toMatch(/v_n\s*=\s*0/);
      expect(contenu).toContain("raise exception");
    });

    it(`${nom} : refuse les SURCHARGES`, () => {
      expect(contenu).toMatch(/v_n\s*>\s*1/);
    });

    it(`${nom} : exige le droit POSITIF de service_role`, () => {
      expect(contenu).toContain("has_function_privilege('service_role'");
    });

    it(`${nom} : exige l'absence de droit pour anon et authenticated`, () => {
      expect(contenu).toContain("has_function_privilege('anon'");
      expect(contenu).toContain("has_function_privilege('authenticated'");
    });

    it(`${nom} : compare un manifeste ACL canonique`, () => {
      expect(contenu).toContain("postgres=X/postgres service_role=X/postgres");
    });
  }
});

describe("la procédure ne franchit aucune limite", () => {
  it("le README ne demande plus de test sur un vrai restaurant", () => {
    /*
     * Ce test créerait un ticket réel, un contact, un mouvement de stock, et
     * potentiellement une donnée personnelle — une mutation de donnée métier
     * qui ne fait pas partie de l'autorisation d'appliquer un correctif de
     * fonction.
     */
    expect(README).not.toMatch(/parcours joueur nominal sur un vrai restaurant/i);
    expect(README).toMatch(/autorisation distincte/i);
  });

  it("le README ne présente plus les comptages comme un critère", () => {
    expect(README).toMatch(/ne prouve(nt)? rien|non concluant/i);
  });

  it("les contrôles post ne renvoient plus vers le rollback par réflexe", () => {
    expect(POST).toMatch(/ARRÊT IMMÉDIAT|ARRET IMMEDIAT/i);
    expect(POST).toMatch(/forward/i);
  });

  it("les tailles sont annoncées en caractères, pas en octets", () => {
    // `length()` compte des caractères ; le corps est multioctet
    // (3600 caractères pour 3604 octets sur le corrigé).
    for (const [nom, contenu] of [["README", README], ["préflight", PREFLIGHT]] as const) {
      expect(contenu, `${nom} ne doit pas annoncer des octets`).not.toMatch(/3600 octets|3552 octets/);
    }
  });
});
