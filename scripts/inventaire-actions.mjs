/*
 * Inventaire du graphe d'appel réel des Server Actions.
 *
 * Une action durcie qui n'est appelée par personne ne sécurise rien, et une
 * action sans garde appelée depuis une page publique est une porte ouverte.
 * Seul le graphe d'appel dit laquelle est laquelle — pas la lecture du
 * fichier isolé.
 *
 * Ce script ne juge pas : il constate. Qui exporte quoi, qui l'importe,
 * depuis quelle page, si cette page est couverte par le matcher du
 * middleware, et si l'action tient une clé de service.
 *
 * Usage :  node scripts/inventaire-actions.mjs [--json]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.cwd();
const DOSSIER = join(RACINE, "app/actions");

/* Le matcher du middleware, recopié depuis middleware.ts. Toute page hors de
   ces préfixes est publique — et les Server Actions qu'elle importe le sont
   avec elle. */
const COUVERT = [/^app\/admin(\/|$)/, /^app\/super-admin(\/|$)/];

function fichiers(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p);
  }
  return acc;
}

const sources = fichiers(join(RACINE, "app"))
  .concat(fichiers(join(RACINE, "components")))
  .concat(fichiers(join(RACINE, "lib")));

const actions = readdirSync(DOSSIER)
  .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
  .map((n) => {
    const chemin = join(DOSSIER, n);
    const src = readFileSync(chemin, "utf8");
    const module = `@/app/actions/${n.replace(/\.ts$/, "")}`;
    const exports = [...src.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);

    const appelants = sources
      .filter((f) => f !== chemin)
      .filter((f) => readFileSync(f, "utf8").includes(module))
      .map((f) => relative(RACINE, f));

    const pagesPubliques = appelants.filter((a) => !COUVERT.some((r) => r.test(a)));

    return {
      module: n.replace(/\.ts$/, ""),
      exports,
      serviceRole: /SERVICE_ROLE_KEY/.test(src),
      verifieIdentite: /auth\.getUser\(\)/.test(src),
      journalise: /journaliser\(/.test(src),
      appelants,
      pagesPubliques,
      lignes: src.split("\n").length,
    };
  })
  .sort((a, b) => a.module.localeCompare(b.module));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(actions, null, 2));
} else {
  const marque = (b, oui = "oui", non = "—") => (b ? oui : non);
  console.log(`\n${"═".repeat(100)}`);
  console.log("  SERVER ACTIONS — graphe d'appel réel");
  console.log(`${"═".repeat(100)}\n`);
  console.log(
    "module".padEnd(28) + "svc".padEnd(6) + "auth".padEnd(6) + "log".padEnd(6) + "appelants"
  );
  console.log("─".repeat(100));
  for (const a of actions) {
    console.log(
      a.module.padEnd(28) +
        marque(a.serviceRole).padEnd(6) +
        marque(a.verifieIdentite).padEnd(6) +
        marque(a.journalise).padEnd(6) +
        (a.appelants.length ? a.appelants.join(", ") : "AUCUN — code mort")
    );
    if (a.pagesPubliques.length)
      console.log(" ".repeat(46) + `⚠ hors matcher du middleware : ${a.pagesPubliques.join(", ")}`);
  }

  const morts = actions.filter((a) => !a.appelants.length);
  const exposees = actions.filter((a) => a.pagesPubliques.length && a.serviceRole);
  console.log(`\n${"─".repeat(100)}`);
  console.log(`  ${actions.length} modules, ${actions.reduce((n, a) => n + a.exports.length, 0)} actions exportées`);
  console.log(`  ${actions.filter((a) => a.serviceRole).length} tiennent une clé de service`);
  console.log(`  ${actions.filter((a) => a.verifieIdentite).length} vérifient une identité`);
  console.log(`  ${morts.length} sans aucun appelant : ${morts.map((a) => a.module).join(", ") || "—"}`);
  console.log(
    `  ${exposees.length} avec clé de service ET appelées hors matcher : ${
      exposees.map((a) => a.module).join(", ") || "—"
    }`
  );
  console.log("");
}
