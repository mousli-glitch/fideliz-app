/*
 * ═══════════════════════════════════════════════════════════════════════
 *  AVANT DE POUSSER — sur ce dépôt, pousser c'est déployer
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Le projet Vercel `fideliz-app` est relié à GitHub : tout push sur `main`
 * déclenche un déploiement de PRODUCTION, aliasé sur app.fideliz-app.fr.
 * Aucune étape manuelle, aucune confirmation.
 *
 * Le 18/08/2026, deux pushes que je croyais documentaires sont partis chez
 * de vrais clients — La Ruche, Best Pizza, Soukara — sans qu'aucun
 * `vercel --prod` soit tapé. Sur Cartiz le déploiement est explicite ;
 * l'habitude ne se transpose pas, et rien à l'écran ne le disait.
 *
 * Ce script le dit. Il ne pousse rien et n'empêche rien : il montre où l'on
 * est, où l'on va, et ce que cela déclenchera.
 *
 * Usage :  npm run avant-push
 */

import { execSync } from "node:child_process";

const V = "\x1b[32m", R = "\x1b[31m", J = "\x1b[33m", G = "\x1b[2m", B = "\x1b[1m", Z = "\x1b[0m";

const git = (c) => execSync(`git ${c}`, { encoding: "utf8" }).trim();

const branche = git("rev-parse --abbrev-ref HEAD");
const tete = git("log --oneline -1");
const suivi = (() => {
  try {
    return git("rev-parse --abbrev-ref --symbolic-full-name @{u}");
  } catch {
    return null;
  }
})();
const enAvance = suivi ? git(`rev-list --count ${suivi}..HEAD`) : "?";
const enAttente = suivi ? git(`log --oneline ${suivi}..HEAD`) : git("log --oneline -5");
const propre = git("status --porcelain") === "";

console.log(`\n${"═".repeat(70)}`);
console.log(`  AVANT DE POUSSER — ${B}fideliz-app${Z}`);
console.log(`${"═".repeat(70)}\n`);

console.log(`  branche courante  : ${B}${branche}${Z}`);
console.log(`  destination       : ${suivi ?? `${J}aucune (première poussée)${Z}`}`);
console.log(`  tête              : ${tete}`);
console.log(`  arbre de travail  : ${propre ? `${V}propre${Z}` : `${J}modifications non commitées${Z}`}`);
console.log(`  commits en avance : ${enAvance}`);

if (enAttente) {
  console.log(`\n  ${G}ce qui partirait :${Z}`);
  for (const l of enAttente.split("\n").slice(0, 10)) console.log(`    ${l}`);
}

console.log("");

if (branche === "main") {
  console.log(`${R}${"▲".repeat(35)}${Z}`);
  console.log(`${R}${B}  POUSSER SUR main DÉPLOIE EN PRODUCTION${Z}`);
  console.log(`${R}${"▲".repeat(35)}${Z}\n`);
  console.log(`  app.fideliz-app.fr sert La Ruche, Best Pizza et Soukara —`);
  console.log(`  de vrais clients, avec des QR imprimés en circulation.\n`);
  console.log(`  Aucun travail de fusion ne part sur main. Il part sur`);
  console.log(`  ${B}feat/fusion-fideliz${Z}, qui ne produit que des previews.\n`);
  console.log(`  ${G}Relever l'URL de rollback AVANT de pousser :${Z}`);
  console.log(`    npx vercel ls | head -8\n`);
} else {
  console.log(`${V}  Branche de travail : ce push produira une preview, pas une production.${Z}\n`);
}

/* L'état réel de Vercel, pas celui qu'on suppose. */
try {
  const sortie = execSync("npx vercel ls 2>/dev/null | sed -n '5,8p'", { encoding: "utf8" });
  if (sortie.trim()) {
    console.log(`  ${G}déploiements récents :${Z}`);
    for (const l of sortie.trimEnd().split("\n")) console.log(`  ${l}`);
    console.log("");
  }
} catch {
  console.log(`  ${G}(état Vercel indisponible — vérifier à la main)${Z}\n`);
}
