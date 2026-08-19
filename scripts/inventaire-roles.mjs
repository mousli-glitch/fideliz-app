#!/usr/bin/env node
/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE VOCABULAIRE DES RÔLES, DES DEUX CÔTÉS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Décision P-1 du 19/08/2026 : après fusion, le gérant s'appelle
 * `restaurateur` partout. Fideliz l'appelle `restaurant`, et ce mot est aussi
 * un nom de table, un nom de variable et un segment d'URL — un simple grep
 * rend des centaines de lignes dont l'immense majorité n'a rien à voir.
 *
 * Ce script énumère les sites qui portent vraiment une VALEUR DE RÔLE, classés
 * par ce qu'ils en font. C'est la liste que le portage devra épuiser.
 *
 * Pourquoi un script et pas une liste dans un document : une liste écrite à la
 * main est fausse le lendemain. Celle-ci se régénère, et son total se compare.
 *
 *   node scripts/inventaire-roles.mjs [chemin-vers-cartiz]
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const FIDELIZ = process.cwd();
const CARTIZ = process.argv[2] ?? "/Users/samy/Desktop/FIDELIZ/cartiz";

const C = { g: "\x1b[32m", j: "\x1b[33m", r: "\x1b[31m", d: "\x1b[2m", z: "\x1b[0m", b: "\x1b[1m" };

/* Les valeurs de rôle des deux vocabulaires. `admin` est cité pour mémoire :
   il existe côté Cartiz et l'instruction est de ne jamais le retirer. */
const VALEURS = ["restaurant", "restaurateur", "root", "sales", "admin"];

function fichiers(racine, dossiers, extensions) {
  const out = [];
  for (const d of dossiers) {
    const base = join(racine, d);
    if (!existsSync(base)) continue;
    const pile = [base];
    while (pile.length) {
      const p = pile.pop();
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        if (/node_modules|\.next|\.git/.test(p)) continue;
        for (const e of readdirSync(p)) pile.push(join(p, e));
      } else if (extensions.some((x) => p.endsWith(x))) {
        out.push(p);
      }
    }
  }
  return out;
}

/*
 * Le classement. L'ordre des tests compte : un fichier de test qui contient
 * une garde reste un test — c'est ce qu'il EST qui décide, pas ce qu'il cite.
 */
function classer(chemin, ligne) {
  if (/\.test\.[tj]sx?$/.test(chemin)) return "test";
  if (chemin.endsWith(".sql")) return "sql";
  if (/role:\s*['"]/.test(ligne) || /user_metadata/.test(ligne)) return "ecriture";
  if (/exiger|includes\(|ROLES|Roles|authorizedRoles|=== *['"]|\[\s*['"]/.test(ligne)) return "garde";
  return "autre";
}

function inventorier(racine, nom, dossiers, extensions) {
  const trouves = [];
  for (const f of fichiers(racine, dossiers, extensions)) {
    let texte;
    try { texte = readFileSync(f, "utf8"); } catch { continue; }
    texte.split("\n").forEach((ligne, i) => {
      /* Une valeur de rôle est TOUJOURS entre guillemets. Sans cette borne on
         ramasse `restaurants`, `restaurant_id`, `/restaurant/`… */
      const cite = VALEURS.some((v) =>
        new RegExp(`['"\`]${v}['"\`]|'${v}'::text`).test(ligne)
      );
      if (!cite) return;
      /* Un nom de table entre guillemets n'est pas un rôle. */
      if (/\.from\(|from\s*\(|table_name|information_schema/.test(ligne)) return;
      /*
       * Ni un nom de paramètre d'URL, d'en-tête ou de cookie. Relevé sur
       * `searchParams.get("restaurant")` côté Cartiz, que l'inventaire
       * annonçait comme un rôle à convertir : le seul faux positif du lot, et
       * il aurait envoyé le portage modifier une lecture de query-string.
       */
      if (/searchParams|\.get\(|\.set\(|headers|cookies|formData/.test(ligne)) return;
      /* Quelles valeurs cette ligne porte-t-elle ? C'est ce qui distingue une
         ligne que P-1 doit convertir d'une ligne qu'elle ne touche pas. */
      const portees = VALEURS.filter((v) =>
        new RegExp(`['"\`]${v}['"\`]|'${v}'::text`).test(ligne)
      );
      trouves.push({
        fichier: relative(racine, f),
        ligne: i + 1,
        categorie: classer(f, ligne),
        valeurs: portees,
        aConvertir: portees.includes("restaurant"),
        extrait: ligne.trim().slice(0, 96),
      });
    });
  }
  return { nom, racine, trouves };
}

function rendre(inv) {
  console.log(`\n${C.b}══ ${inv.nom} ══${C.z}  ${C.d}${inv.racine}${C.z}`);
  if (!existsSync(inv.racine)) {
    console.log(`  ${C.j}dépôt introuvable — ignoré${C.z}`);
    return;
  }
  const par = {};
  for (const t of inv.trouves) (par[t.categorie] ??= []).push(t);
  const ordre = ["garde", "ecriture", "sql", "autre", "test"];
  const libelle = {
    garde: "gardes — LISENT un rôle, à élargir puis restreindre",
    ecriture: "écritures — CRÉENT un compte avec un rôle",
    sql: "prédicats SQL — dans les policies et les fonctions",
    autre: "divers — à lire un par un",
    test: "tests — fixtures, suivent le code",
  };
  for (const c of ordre) {
    const l = par[c] ?? [];
    if (!l.length) continue;
    const aConv = l.filter((t) => t.aConvertir).length;
    console.log(
      `\n  ${C.b}${String(l.length).padStart(3)}${C.z}  ${libelle[c]}` +
      (aConv ? `   ${C.j}dont ${aConv} à convertir${C.z}` : ` ${C.d}— aucune conversion${C.z}`)
    );
    for (const t of l) {
      const marque = t.aConvertir ? `${C.j}→${C.z}` : " ";
      console.log(`     ${marque} ${C.d}${t.fichier}:${t.ligne}${C.z}`);
    }
  }
  const conv = inv.trouves.filter((t) => t.aConvertir).length;
  console.log(`\n  ${C.b}total : ${inv.trouves.length}${C.z}  ${C.j}dont ${conv} portant « restaurant »${C.z}`);
}

const inventaires = [
  inventorier(FIDELIZ, "FIDELIZ — vocabulaire à convertir", ["app", "lib", "components", "utils"], [".ts", ".tsx"]),
  inventorier(FIDELIZ, "FIDELIZ — SQL", ["supabase/migrations"], [".sql"]),
  inventorier(CARTIZ, "CARTIZ — vocabulaire cible", ["app", "lib", "components"], [".ts", ".tsx"]),
];

console.log(`${C.b}Vocabulaire des rôles — décision P-1 : « restaurateur » partout${C.z}`);
inventaires.forEach(rendre);

const total = inventaires.reduce((n, i) => n + i.trouves.length, 0);
const aConvertir = inventaires.reduce(
  (n, i) => n + i.trouves.filter((t) => t.aConvertir).length, 0
);

console.log(`\n${"═".repeat(74)}`);
console.log(`${C.b}${total} sites portent une valeur de rôle.${C.z}`);
console.log(
  `${C.b}${C.j}${aConvertir} portent « restaurant »${C.z} — ce sont EUX que la décision P-1 convertit.`
);
console.log(
  `${C.d}Les autres citent root, sales, admin ou déjà restaurateur : ils sont là pour\n` +
  `que le portage voie le vocabulaire entier, pas pour être modifiés.${C.z}`
);
console.log(`${C.d}Rien n'est modifié : ce script ne fait que compter.${C.z}\n`);
