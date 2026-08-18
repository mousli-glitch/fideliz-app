import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════════════════
//  ÉQUILIBRE LEXICAL — les commentaires bloc PostgreSQL s'imbriquent
// ═══════════════════════════════════════════════════════════════════════
//
// Trouvé le 18/08/2026 : `20260818160000_gel_de_bascule.sql` (depuis
// renommé `20260818160000_gel_source_fideliz.sql`, périmètre séparé de
// la destination Cartiz) portait une
// ouverture de commentaire (ligne 58) jamais refermée. PostgreSQL imbrique
// les commentaires bloc — contrairement à C — donc chaque nouvelle
// ouverture rouvrait un niveau au lieu d'être une erreur de syntaxe
// visible. Résultat mesuré : le fichier entier, à partir de la ligne 58,
// vivait à l'intérieur d'un commentaire. Exécuté tel quel via `psql -f`
// ou `supabase db push`, rien après la ligne 57 ne se serait exécuté — ni
// les fonctions, ni les triggers, ni les revokes. Seule la table aurait
// existé, sans aucune application du gel.
//
// Une regex NON imbriquée (utilisée ailleurs dans ce dépôt pour retirer
// les commentaires avant de chercher un motif) ne peut pas détecter ça :
// elle s'arrête à la première fermeture rencontrée, quelle que soit sa
// profondeur réelle. Ce fichier implémente un scanner caractère par
// caractère qui suit la profondeur réelle, et qui ignore les ouvertures
// et fermetures de commentaire qui apparaissent à l'intérieur d'une
// chaîne simple-quote, d'un identifiant double-quote, ou d'une chaîne
// dollar-quote — où elles ne sont que du texte, pas des délimiteurs.
//
// Ne demande ni base ni secret : il lit le dépôt.
//
// Durci le 19/08/2026 : le déséquilibre des commentaires bloc n'est pas la
// seule façon dont un fichier SQL peut mentir sur sa propre structure. Un
// */ sans ouverture, une chaîne simple-quote, un identifiant double-quote,
// ou une chaîne dollar-quote jamais refermée produisent le même symptôme —
// tout ce qui suit change de sens sans erreur de syntaxe visible à l'oeil.
// Le scanner détecte maintenant les quatre, avec la ligne où le jeton
// fautif commence.

export interface ResultatEquilibre {
  profondeurFinale: number;
  ouverturesNonFermees: number[];
  erreurs: string[];
}

// Scanner lexical minimal mais correct : imbrication réelle des
// commentaires bloc, et les chaînes ('...', "...", $tag$...$tag$) qui
// neutralisent les délimiteurs de commentaire en dehors de tout
// commentaire déjà ouvert. Signale aussi tout jeton resté ouvert jusqu'à
// la fin du fichier — chaîne, identifiant, dollar-quote — et tout */
// rencontré sans ouverture correspondante.
export function equilibreCommentairesBloc(sql: string): ResultatEquilibre {
  let i = 0;
  let ligne = 1;
  let profondeur = 0;
  const ouvertures: number[] = [];
  const erreurs: string[] = [];
  const n = sql.length;

  const avancerLigne = (depuis: number, jusque: number) => {
    for (let k = depuis; k < jusque; k++) if (sql[k] === "\n") ligne++;
  };

  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];

    if (profondeur > 0) {
      // À l'intérieur d'un commentaire bloc : seuls /* et */ comptent.
      if (c === "/" && c2 === "*") {
        profondeur++;
        ouvertures.push(ligne);
        i += 2;
        continue;
      }
      if (c === "*" && c2 === "/") {
        profondeur--;
        ouvertures.pop();
        i += 2;
        continue;
      }
      if (c === "\n") ligne++;
      i++;
      continue;
    }

    // Profondeur 0 : les chaînes neutralisent /* et */ tant qu'on y est.
    if (c === "'") {
      const ligneDebut = ligne;
      let j = i + 1;
      let fermee = false;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j++;
          fermee = true;
          break;
        }
        j++;
      }
      avancerLigne(i, j);
      if (!fermee) {
        erreurs.push(`chaîne simple-quote jamais refermée, ouverte ligne ${ligneDebut}`);
      }
      i = j;
      continue;
    }

    if (c === '"') {
      const ligneDebut = ligne;
      let j = i + 1;
      let fermee = false;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j++;
          fermee = true;
          break;
        }
        j++;
      }
      avancerLigne(i, j);
      if (!fermee) {
        erreurs.push(`identifiant double-quote jamais refermé, ouvert ligne ${ligneDebut}`);
      }
      i = j;
      continue;
    }

    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const ligneDebut = ligne;
        const tag = m[0];
        const debutContenu = i + tag.length;
        const fin = sql.indexOf(tag, debutContenu);
        const j = fin === -1 ? n : fin + tag.length;
        avancerLigne(i, j);
        if (fin === -1) {
          erreurs.push(`chaîne dollar-quote ${tag} jamais refermée, ouverte ligne ${ligneDebut}`);
        }
        i = j;
        continue;
      }
    }

    if (c === "-" && c2 === "-") {
      let j = i;
      while (j < n && sql[j] !== "\n") j++;
      i = j;
      continue;
    }

    if (c === "/" && c2 === "*") {
      profondeur++;
      ouvertures.push(ligne);
      i += 2;
      continue;
    }

    if (c === "*" && c2 === "/") {
      erreurs.push(`*/ sans ouverture correspondante, ligne ${ligne}`);
      i += 2;
      continue;
    }

    if (c === "\n") ligne++;
    i++;
  }

  return { profondeurFinale: profondeur, ouverturesNonFermees: ouvertures, erreurs };
}

const ICI = dirname(fileURLToPath(import.meta.url));
const fichiersMigration = readdirSync(ICI).filter((f) => f.endsWith(".sql"));

describe("équilibre lexical — chaque migration referme tous ses commentaires bloc", () => {
  for (const nom of fichiersMigration) {
    it(`${nom} : profondeur finale 0, aucune ouverture orpheline, aucune erreur lexicale`, () => {
      const sql = readFileSync(join(ICI, nom), "utf8");
      const { profondeurFinale, ouverturesNonFermees, erreurs } = equilibreCommentairesBloc(sql);
      expect(
        profondeurFinale,
        `${nom} : ${ouverturesNonFermees.length} commentaire(s) bloc jamais fermé(s), ` +
          `ouvert(s) ligne(s) ${ouverturesNonFermees.join(", ")}. Un */ manque.`,
      ).toBe(0);
      expect(ouverturesNonFermees).toEqual([]);
      expect(erreurs, `${nom} : ${erreurs.join(" | ")}`).toEqual([]);
    });
  }

  it("le scanner détecte réellement une imbrication non fermée (cas fabriqué)", () => {
    const cassé = "select 1;\n/* ouvert\n/* imbriqué */\n-- toujours dans le premier\n";
    const r = equilibreCommentairesBloc(cassé);
    expect(r.profondeurFinale).toBe(1);
    expect(r.ouverturesNonFermees).toEqual([2]);
  });

  it("le scanner accepte une imbrication correctement refermée (cas fabriqué)", () => {
    const propre = "select 1;\n/* ouvert /* imbriqué */ toujours ouvert */\nselect 2;\n";
    const r = equilibreCommentairesBloc(propre);
    expect(r.profondeurFinale).toBe(0);
    expect(r.ouverturesNonFermees).toEqual([]);
  });

  it("le scanner ignore /* et */ à l'intérieur d'une chaîne dollar-quote (cas fabriqué)", () => {
    const fonction = "create function f() returns text as $$ select '/* pas un commentaire */'; $$ language sql;\n";
    const r = equilibreCommentairesBloc(fonction);
    expect(r.profondeurFinale).toBe(0);
  });

  it("le scanner ignore /* et */ à l'intérieur d'une chaîne simple-quote (cas fabriqué)", () => {
    const requete = "select 'texte avec /* dedans' as t;\n";
    const r = equilibreCommentairesBloc(requete);
    expect(r.profondeurFinale).toBe(0);
  });

  it("une regex non imbriquée aurait laissé passer le défaut réel du 18/08 — non-régression", () => {
    // Reproduction fidèle du défaut réel : un premier bloc jamais fermé,
    // suivi d'un second bloc correctement fermé plus loin dans le fichier.
    const commeLeVrai = [
      "create table t (id int);",
      "/*",
      " * explication jamais fermee",
      "-- pas vraiment un commentaire ligne, on est deja dans le bloc",
      "/*",
      " * sous-section",
      " */",
      "create function f() returns void language sql as $$ select 1; $$;",
    ].join("\n");

    const naive = commeLeVrai.replace(/\/\*[\s\S]*?\*\//g, " ");
    // La regex non imbriquée s'arrête au premier */ : elle croit le texte propre.
    expect(naive).not.toMatch(/jamais fermee/);

    const reel = equilibreCommentairesBloc(commeLeVrai);
    expect(reel.profondeurFinale).toBeGreaterThan(0);
  });

  it("le scanner détecte un */ sans ouverture (cas fabriqué)", () => {
    const cassé = "select 1;\n*/\nselect 2;\n";
    const r = equilibreCommentairesBloc(cassé);
    expect(r.erreurs).toEqual(["*/ sans ouverture correspondante, ligne 2"]);
  });

  it("le scanner détecte une chaîne simple-quote jamais refermée (cas fabriqué)", () => {
    const cassé = "select 1;\nselect 'texte jamais refermé;\nselect 2;\n";
    const r = equilibreCommentairesBloc(cassé);
    expect(r.erreurs).toEqual(["chaîne simple-quote jamais refermée, ouverte ligne 2"]);
  });

  it("le scanner accepte une chaîne simple-quote avec échappement '' correctement refermée (non-régression)", () => {
    const propre = "select 'texte avec '' échappé, puis refermé';\n";
    const r = equilibreCommentairesBloc(propre);
    expect(r.erreurs).toEqual([]);
  });

  it("le scanner détecte un identifiant double-quote jamais refermé (cas fabriqué)", () => {
    const cassé = 'select 1;\nselect * from "table_jamais_refermee;\nselect 2;\n';
    const r = equilibreCommentairesBloc(cassé);
    expect(r.erreurs).toEqual(["identifiant double-quote jamais refermé, ouvert ligne 2"]);
  });

  it("le scanner détecte une chaîne dollar-quote jamais refermée (cas fabriqué)", () => {
    // Attention : le texte de test ne doit contenir aucune occurrence
    // littérale de "$$" après l'ouverture, sinon le scanner la trouverait
    // légitimement comme fermeture — même dans un commentaire descriptif.
    const cassé = "create function f() returns text language sql as $$ select 'x';\n-- jamais refermee\n";
    const r = equilibreCommentairesBloc(cassé);
    expect(r.erreurs).toEqual(["chaîne dollar-quote $$ jamais refermée, ouverte ligne 1"]);
  });

  it("le scanner détecte une chaîne dollar-quote taguée ($corps$) jamais refermée (cas fabriqué)", () => {
    const cassé = "create function f() returns text language sql as $corps$ select 'x';\n";
    const r = equilibreCommentairesBloc(cassé);
    expect(r.erreurs).toEqual(["chaîne dollar-quote $corps$ jamais refermée, ouverte ligne 1"]);
  });

  it("un fichier par ailleurs propre ne déclenche aucune des quatre erreurs (non-régression)", () => {
    const propre = [
      "create table t (id int, nom text);",
      "comment on table t is 'un texte avec un */ dedans, inoffensif';",
      "create function f() returns void language sql as $$",
      "  select \"colonne entre guillemets\" from t;",
      "$$;",
    ].join("\n");
    const r = equilibreCommentairesBloc(propre);
    expect(r.erreurs).toEqual([]);
    expect(r.profondeurFinale).toBe(0);
  });
});
