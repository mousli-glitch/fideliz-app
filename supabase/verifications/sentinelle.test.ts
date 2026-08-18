import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  GARDE ANTI-DÉRIVE — la sentinelle et son harnais ne peuvent pas diverger
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `harnais-scenarios-sentinelle.sql` rejoue la logique de détection de
 * `sentinelle-privileges-anon.sql` sur 4 scénarios synthétiques, en
 * COPIANT le texte de la requête entre des ancres (`ANCRE_REQUETE_*`).
 * Une copie collée peut diverger silencieusement de l'original le jour où
 * l'un des deux fichiers est modifié seul. Ce test lit les deux fichiers,
 * extrait le texte entre les mêmes ancres, et échoue si un seul caractère
 * diffère — dans n'importe laquelle des occurrences du harnais.
 *
 * Il ne demande ni base ni secret : il lit le dépôt.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const sentinelle = readFileSync(join(ICI, "sentinelle-privileges-anon.sql"), "utf8");
const harnais = readFileSync(join(ICI, "harnais-scenarios-sentinelle.sql"), "utf8");
const preuveAvis = readFileSync(join(ICI, "preuve-acl-avis.sql"), "utf8");
const empreintes = readFileSync(join(ICI, "empreintes.sql"), "utf8");

/** Toutes les occurrences du texte entre `DEBUT`/`FIN` d'une ancre nommée. */
function extraireAncres(texte: string, nom: string): string[] {
  const debut = `ANCRE_REQUETE_${nom}_DEBUT`;
  const fin = `ANCRE_REQUETE_${nom}_FIN`;
  const motif = new RegExp(
    debut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*\\n([\\s\\S]*?)\\n\\s*--\\s*" + fin,
    "g"
  );
  const trouvailles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = motif.exec(texte)) !== null) trouvailles.push(m[1]);
  return trouvailles;
}

describe("le harnais des 4 scénarios ne peut pas diverger de la sentinelle", () => {
  for (const nom of ["RELATIONS", "DEFAUTS"] as const) {
    it(`ancre ${nom} : la sentinelle en porte exactement une définition canonique`, () => {
      const canoniques = extraireAncres(sentinelle, nom);
      expect(canoniques, `aucune ancre ${nom} trouvée dans sentinelle-privileges-anon.sql`).toHaveLength(1);
    });

    it(`ancre ${nom} : le harnais en porte au moins une occurrence`, () => {
      const occurrences = extraireAncres(harnais, nom);
      expect(occurrences.length, `aucune occurrence de l'ancre ${nom} dans le harnais`).toBeGreaterThan(0);
    });

    it(`ancre ${nom} : chaque occurrence du harnais est identique caractère pour caractère à la sentinelle`, () => {
      const [canonique] = extraireAncres(sentinelle, nom);
      const occurrences = extraireAncres(harnais, nom);
      for (const [i, occ] of occurrences.entries()) {
        expect(occ, `occurrence #${i} de l'ancre ${nom} dans le harnais a dérivé de la sentinelle`).toBe(canonique);
      }
    });
  }
});

describe("régression — les clauses qui ferment les angles morts restent présentes", () => {
  it("relations existantes : has_table_privilege (droits effectifs), pas aclexplode(relacl) seul", () => {
    expect(sentinelle).toMatch(/has_table_privilege\(/);
  });

  it("défauts : les entrées globales ne sont plus exclues (defaclnamespace = 0 testé)", () => {
    expect(sentinelle).toMatch(/defaclnamespace\s*=\s*0/);
  });

  it("défauts : aucun filtre figé sur defaclrole = 'postgres'", () => {
    expect(sentinelle).not.toMatch(/defaclrole\)\s*=\s*'postgres'/);
  });

  it("défauts : PUBLIC (grantee = 0) est traité par un CASE explicite, pas dans l'ordre d'un OR", () => {
    expect(sentinelle).toMatch(/case\s*\n\s*when a\.grantee = 0 then true/);
  });

  it("défauts : l'héritage de rôle est couvert par pg_has_role", () => {
    expect(sentinelle).toMatch(/pg_has_role\(/);
  });
});

describe("régression — preuve-acl-avis.sql mesure des droits effectifs, pas seulement directs", () => {
  /* Le bloc do $$ seul : le commentaire d'en-tête décrit à dessein
     l'ancienne approche (aclexplode) comme contexte historique — le
     chercher dans le fichier entier donnerait un faux positif. */
  const corpsDoBlock = preuveAvis.slice(preuveAvis.indexOf("do $$"));

  it("le corps exécutable utilise has_table_privilege, pas aclexplode(relacl)", () => {
    expect(corpsDoBlock).toMatch(/has_table_privilege\(/);
    expect(corpsDoBlock).not.toMatch(/aclexplode\(/);
  });
});

describe("régression — empreintes.sql n'utilise plus la normalisation comme preuve d'équivalence", () => {
  it("la dimension `fonctions` compare prosrc EXACT (md5 brut), pas regexp_replace", () => {
    expect(empreintes).toMatch(/\|\|' src_md5='\|\|md5\(p\.prosrc\)/);
    expect(empreintes).not.toMatch(/\|\|' src='\|\|regexp_replace\(p\.prosrc/);
  });

  it("le manifeste publie une empreinte exacte ET une empreinte normalisée, étiquetées distinctement", () => {
    expect(empreintes).toMatch(/empreinte_exacte/);
    expect(empreintes).toMatch(/empreinte_normalisee_aide_seulement/);
  });

  it("les défauts par défaut incluent la portée globale (pas seulement schéma public)", () => {
    const debutDefaut = empreintes.indexOf("defaut as (");
    const finDefaut = empreintes.indexOf("\n)", debutDefaut);
    const blocDefaut = empreintes.slice(debutDefaut, finDefaut);
    expect(blocDefaut).toMatch(/left join pg_namespace/);
    expect(blocDefaut).toMatch(/defaclnamespace\s*=\s*0/);
  });
});
