import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE HARNAIS NÉGATIF DOIT RESTER SOLIDAIRE DU HARNAIS POSITIF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `harnais-cascade-negatif.sql` prouve que `harnais-cascade-suppression.sql`
 * n'est pas vide : il injecte des fautes bornées et exige que les assertions
 * du second se déclenchent.
 *
 * Cette preuve ne vaut QUE si les deux fichiers parlent de la même chose.
 * Le jour où le manifeste canonique du harnais positif est corrigé sans que
 * celui du négatif le soit, le négatif continue de virer au vert en
 * éprouvant une définition qui n'existe plus nulle part — et rien ne
 * l'annonce. C'est le mode de panne le plus discret d'un harnais : il
 * survit à ce qu'il est censé surveiller.
 *
 * Ces tests sont lexicaux, et ils l'assument : ils ne prouvent rien du
 * comportement SQL — c'est le rôle de l'exécution des deux fichiers. Ils
 * prouvent seulement que les deux textes ne peuvent pas diverger en silence.
 */

const DOSSIER = __dirname;
const POSITIF = readFileSync(join(DOSSIER, "harnais-cascade-suppression.sql"), "utf8");
const NEGATIF = readFileSync(join(DOSSIER, "harnais-cascade-negatif.sql"), "utf8");

/** Extrait le corps de la vue `_fk_canonique`, espaces normalisés. */
function definitionManifeste(source: string): string {
  const debut = source.indexOf("create temp view _fk_canonique as");
  expect(debut, "la vue `_fk_canonique` doit exister dans les deux fichiers").toBeGreaterThan(-1);
  const fin = source.indexOf(";", debut);
  return source.slice(debut, fin).replace(/\s+/g, " ").trim();
}

describe("harnais cascade — positif et négatif ne peuvent pas diverger", () => {
  it("les deux fichiers portent la MÊME définition du manifeste canonique", () => {
    expect(definitionManifeste(NEGATIF)).toBe(definitionManifeste(POSITIF));
  });

  it("le manifeste ignore le nom de contrainte — c'est voulu, donc c'est vérifié", () => {
    // `conname` dans le manifeste ferait échouer un renommage inoffensif et
    // laisserait passer une FK repointée. L'épreuve 3 du harnais négatif
    // repose entièrement sur cette absence.
    expect(definitionManifeste(POSITIF)).not.toContain("conname");
  });

  it("le manifeste porte les tables, les colonnes ET les deux actions", () => {
    // L'ancienne empreinte ne portait que `conname:confdeltype` : une FK
    // déplacée d'une colonne à une autre donnait la même valeur.
    const d = definitionManifeste(POSITIF);
    for (const morceau of ["conkey", "confkey", "confdeltype", "confupdtype"]) {
      expect(d, `le manifeste doit porter ${morceau}`).toContain(morceau);
    }
  });
});

describe("le harnais positif compare réellement son manifeste", () => {
  it("il capture un « avant » ET un « après »", () => {
    expect(POSITIF).toContain("manifeste_schema_avant");
    expect(POSITIF).toContain("manifeste_schema_apres");
  });

  it("il LÈVE sur divergence — il ne se contente pas de l'afficher", () => {
    // Le défaut d'origine : le manifeste n'était calculé qu'après, et le
    // commentaire promettait une comparaison qui n'existait pas.
    const verdict = POSITIF.slice(POSITIF.indexOf("VERDICT FAIL-CLOSED"));
    expect(verdict).toContain("v_schema_avant is distinct from v_schema_apres");
    expect(verdict).toContain("raise exception");
  });

  it("un manifeste manquant est un échec, pas un silence", () => {
    expect(POSITIF).toContain("v_schema_avant is null or v_schema_apres is null");
  });
});

describe("la garde anti-dérive juge la sémantique, pas un nom", () => {
  it("elle n'interroge plus `conname`", () => {
    const garde = POSITIF.slice(
      POSITIF.indexOf("garde anti-dérive : les invariants du code"),
      POSITIF.indexOf("Manifeste lisible"),
    );
    expect(garde.length, "le bloc de garde doit être trouvé").toBeGreaterThan(0);
    expect(garde, "un nom de contrainte est décoratif").not.toContain("conname");
  });

  it("elle vérifie la cardinalité exacte des FK partant de chaque colonne", () => {
    const garde = POSITIF.slice(
      POSITIF.indexOf("garde anti-dérive : les invariants du code"),
      POSITIF.indexOf("Manifeste lisible"),
    );
    // Deux invariants × deux contrôles (conformité + cardinalité) = 4.
    expect((garde.match(/v_total <> 1/g) ?? []).length).toBe(2);
    expect((garde.match(/v_conforme <> 1/g) ?? []).length).toBe(2);
  });
});

describe("le harnais négatif ne peut pas passer au vert sur une panne", () => {
  it("chaque détection attend un SQLSTATE privé, jamais « une erreur »", () => {
    // Sans code privé, une faute de frappe ou une table absente compterait
    // comme une détection réussie.
    expect(NEGATIF).toContain("when sqlstate 'P9101' then");
    expect(NEGATIF).toContain("when others then raise;");
  });

  it("les quatre épreuves doivent avoir été JOUÉES, pas seulement réussies", () => {
    expect(NEGATIF).toContain("4 attendues");
  });

  it("il refuse de s'exécuter si le point de départ manque", () => {
    // Une FK de départ absente n'est pas une épreuve qui échoue : c'est un
    // harnais inapplicable, et ça ne doit pas ressembler à un succès.
    expect(NEGATIF).toContain("HARNAIS NÉGATIF INAPPLICABLE");
  });

  it("il garde la cible synthétique avant toute mutation, comme le positif", () => {
    const garde = NEGATIF.indexOf("HARNAIS REFUSÉ");
    const premiereMutation = NEGATIF.indexOf("insert into auth.users");
    expect(garde).toBeGreaterThan(-1);
    expect(garde, "la garde doit précéder la première mutation").toBeLessThan(premiereMutation);
  });

  it("les identités synthétiques utilisent le domaine réservé `.invalid`", () => {
    const adresses = NEGATIF.match(/'[a-z0-9-]+@[a-z0-9.-]+'/gi) ?? [];
    expect(adresses.length).toBeGreaterThan(0);
    for (const a of adresses) expect(a).toContain(".invalid");
  });
});

describe("les deux fichiers restent des scripts manuels", () => {
  for (const [nom, contenu] of [["positif", POSITIF], ["négatif", NEGATIF]] as const) {
    it(`le harnais ${nom} s'annule et ne s'applique jamais en migration`, () => {
      expect(contenu.trimEnd().endsWith("rollback;"), "doit finir par un rollback").toBe(true);
      expect(contenu).toContain("Ne jamais appliquer via `supabase db push`");
      expect(contenu, "aucun commit ne doit exister dans un harnais").not.toMatch(/^\s*commit\s*;/mi);
    });
  }
});
