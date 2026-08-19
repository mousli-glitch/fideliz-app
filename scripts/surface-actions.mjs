/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LA SURFACE PUBLIQUE DES SERVER ACTIONS — invariant vérifiable
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Une Server Action ne s'invoque pas par son URL : elle s'invoque par son
 * identifiant, posté sur une route dont le bundle la contient. C'est ce
 * détail qui décide de tout.
 *
 * Le matcher du middleware (/admin, /super-admin) protège donc réellement
 * les vingt-huit actions d'administration — non pas parce qu'il inspecte
 * les actions, mais parce que leur identifiant n'existe dans aucun bundle
 * public. Un inconnu ne peut pas les atteindre : il n'a aucune route où
 * les poster.
 *
 * Cette protection est solide, et elle est FRAGILE.
 *
 * Elle tient à un graphe d'imports, pas à un contrôle. Le jour où une page
 * publique — ou un composant qu'elle partage — importera `set-subscription`
 * ou `delete-restaurant-full`, l'identifiant entrera dans un bundle public
 * et l'action deviendra joignable par n'importe qui. Aucune erreur ne
 * s'affichera. Aucun test fonctionnel ne le verra. Le produit marchera
 * exactement pareil.
 *
 * D'où ce script : il lit le manifeste de build et refuse toute action
 * publiquement joignable qui ne figure pas dans la liste ci-dessous.
 *
 * Usage :
 *   npm run build && node scripts/surface-actions.mjs
 *   MANIFESTE=<chemin> node scripts/surface-actions.mjs   (fixture de test)
 *
 * Le chemin du manifeste est paramétrable, et ce n'est pas un détail : un
 * garde-fou qui exigerait qu'on dégrade une vraie page publique pour être
 * éprouvé serait un garde-fou qu'on n'éprouve jamais. On lui donne des
 * manifestes fabriqués (scripts/fixtures-surface/) et on vérifie qu'il
 * refuse. La page /verify, elle, n'est jamais touchée.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MANIFESTE = process.env.MANIFESTE
  ? join(process.cwd(), process.env.MANIFESTE)
  : join(process.cwd(), ".next/server/server-reference-manifest.json");

/* Les routes que le middleware intercepte (matcher de middleware.ts). */
const COUVERT = (page) => /^app\/(admin|super-admin)(\/|$)/.test(page);

/*
 * Les seules pages publiques autorisées à porter des Server Actions, et ce
 * qu'elles ont le droit d'y mettre. Toute autre combinaison est un refus.
 *
 * Ces quatre-là sont voulues, pas tolérées :
 *
 * · /play/[slug] est le jeu lui-même. Le client n'a pas de compte et n'en
 *   aura jamais : lui demander une identité serait supprimer le produit.
 *   Ses trois actions se protègent autrement — validation de l'e-mail et du
 *   téléphone, tirage et décrément du stock dans une RPC atomique, et limite
 *   par IP réglable par jeu sur les DEUX qui écrivent.
 *
 *   La troisième, `checkReplayStatusAction`, n'a pas de limite d'IP et ce
 *   n'est pas un oubli : le patron des deux autres compte les lignes de
 *   `winners` qu'elles créent elles-mêmes, et celle-ci n'écrit rien. Le
 *   transposer donnerait une garde qui ne bloque jamais. Elle est bornée
 *   autrement — sa RPC ne rend plus le nombre de participations (19/08/2026)
 *   et l'action ne projette que cinq champs nommés. Voir
 *   `docs/application-check-replay.md`.
 *
 * · /verify/[id] porte la validation en caisse. Le personnel s'y connecte,
 *   et l'action vérifie elle-même la session, le rôle et l'appartenance du
 *   ticket au restaurant. C'est la seule action d'administration
 *   publiquement joignable, et c'est aussi la seule qui se garde toute
 *   seule — les deux vont ensemble.
 */
const AUTORISEES = {
  "app/play/[slug]/page": {
    combien: 3,
    quoi: "checkReplayStatusAction, playGameAction, registerWinnerAction",
    pourquoi: "le jeu public — le joueur n'a pas de compte ; validation des saisies, RPC atomique, limite par IP sur les deux actions qui écrivent",
  },
  "app/verify/[id]/page": {
    combien: 1,
    quoi: "validateWinAction",
    pourquoi: "la validation en caisse — l'action vérifie elle-même session, rôle et appartenance du ticket",
  },
};

if (!existsSync(MANIFESTE)) {
  console.error(
    `\nManifeste introuvable : ${MANIFESTE}\n` +
      `Ce contrôle lit le résultat d'un build. Lancer « npm run build » d'abord.\n`
  );
  process.exit(1);
}

const node = JSON.parse(readFileSync(MANIFESTE, "utf8")).node ?? {};

const parPage = new Map();
let total = 0;
for (const info of Object.values(node)) {
  total++;
  for (const page of Object.keys(info.workers ?? {})) {
    if (COUVERT(page)) continue;
    parPage.set(page, (parPage.get(page) ?? 0) + 1);
  }
}

const V = "\x1b[32m", R = "\x1b[31m", G = "\x1b[2m", Z = "\x1b[0m";
const echecs = [];

console.log(`\n${"═".repeat(74)}`);
console.log("  SURFACE PUBLIQUE DES SERVER ACTIONS");
console.log(`${"═".repeat(74)}\n`);
console.log(`  ${total} actions au total, ${parPage.size} page(s) publique(s) en portent\n`);

for (const [page, combien] of [...parPage].sort()) {
  const attendu = AUTORISEES[page];
  if (!attendu) {
    console.log(`  ${R}✗ ${page} — ${combien} action(s) NON PRÉVUE(S)${Z}`);
    console.log(`      ${G}Une page hors du matcher porte des Server Actions qui n'y étaient pas.`);
    console.log(`      Elles sont désormais joignables par un inconnu.${Z}`);
    echecs.push(page);
    continue;
  }
  if (combien !== attendu.combien) {
    console.log(`  ${R}✗ ${page} — ${combien} action(s), ${attendu.combien} attendue(s)${Z}`);
    console.log(`      ${G}attendu : ${attendu.quoi}${Z}`);
    echecs.push(page);
    continue;
  }
  console.log(`  ${V}✓${Z} ${page} — ${combien} action(s)`);
  console.log(`      ${G}${attendu.quoi}${Z}`);
  console.log(`      ${G}${attendu.pourquoi}${Z}`);
}

for (const page of Object.keys(AUTORISEES)) {
  if (!parPage.has(page)) {
    console.log(`  ${R}✗ ${page} ne porte plus aucune action${Z}`);
    console.log(`      ${G}Soit la page a disparu, soit le parcours a changé. Dans les deux cas`);
    console.log(`      la liste ci-dessus ment, et il faut la corriger sciemment.${Z}`);
    echecs.push(page);
  }
}

console.log(`\n${"═".repeat(74)}`);
if (echecs.length) {
  console.log(`${R}REFUSÉ — la surface publique a changé${Z}\n`);
  console.log(`  Ce n'est pas forcément une faute : un parcours a pu évoluer volontairement.`);
  console.log(`  Mais alors la liste AUTORISEES de ce fichier doit être mise à jour, avec le`);
  console.log(`  pourquoi écrit à côté — et l'action concernée doit se garder elle-même.\n`);
  process.exit(1);
}
console.log(`${V}Conforme — aucune action d'administration n'est joignable publiquement.${Z}\n`);
