/*
 * ═══════════════════════════════════════════════════════════════════════
 *  RÉCONCILIATION — le registre appliqué, et les fichiers du dépôt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Fideliz a longtemps eu deux histoires parallèles : un registre de
 * migrations dans la base, et aucun fichier dans le dépôt. Six migrations
 * appliquées entre le 24/07 et le 16/08/2026 n'existaient nulle part sous
 * forme versionnée.
 *
 * Elles ont été récupérées telles quelles : `supabase_migrations.schema_migrations`
 * conserve les instructions exactes, commentaires d'origine compris. Rien
 * n'a été réécrit, rien n'a été deviné à partir du schéma vivant — ce
 * qu'aucune reconstruction n'aurait pu garantir, puisque le schéma ne montre
 * que l'état final et jamais le chemin.
 *
 * ─── POURQUOI UN INSTANTANÉ, ET PAS UNE LECTURE EN DIRECT ───
 *
 * PostgREST n'expose que `public` et `graphql_public`. Lire le registre en
 * direct exigerait soit d'exposer `supabase_migrations`, soit d'ajouter une
 * vue `security definer` — deux modifications de la production qu'un simple
 * contrôle de cohérence ne justifie pas.
 *
 * Le témoin est donc `supabase/registre-migrations.json`, relevé sur la
 * production et versionné. Sa faiblesse est qu'il peut vieillir ; elle est
 * assumée et écrite dans le fichier. Ce qu'il attrape reste l'essentiel :
 * un fichier du dépôt qui ne correspond pas à ce qui a réellement été
 * appliqué.
 *
 * Ce script ne modifie rien et ne réapplique rien.
 *
 * Usage :  npm run migrations:reconcilier
 * Sortie : 0 réconcilié · 1 divergence.
 */

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = join(RACINE, "supabase", "migrations");
const TEMOIN = join(RACINE, "supabase", "registre-migrations.json");

const V = "\x1b[32m", R = "\x1b[31m", J = "\x1b[33m", G = "\x1b[2m", B = "\x1b[1m", Z = "\x1b[0m";

/* Les fichiers dont la version n'est que des zéros décrivent l'état
   historique. Ils n'ont jamais été appliqués comme migrations, donc ils ne
   figurent pas au registre — et c'est voulu. */
const EST_BASELINE = (n) => /^0{6,}_/.test(n);

const sha = (texte) => createHash("sha256").update(texte).digest("hex");

/*
 * Le registre stocke les instructions telles qu'exécutées : sans saut de
 * ligne final, et sans les blancs de fin de ligne qu'un éditeur ajoute.
 *
 * Le témoin porte l'empreinte de ce texte brut. Un fichier du dépôt qui n'en
 * diffère que par ces invisibles décrit pourtant la même migration — on
 * essaie donc les deux formes, et l'une des deux doit tomber juste. Toute
 * autre différence est une vraie divergence.
 */
function correspond(contenu, sha256Attendu) {
  const brut = contenu.replace(/\r\n/g, "\n");
  const rogne = brut
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
  return sha(brut) === sha256Attendu || sha(rogne) === sha256Attendu;
}

const registre = JSON.parse(readFileSync(TEMOIN, "utf8"));
const fichiers = readdirSync(DOSSIER).filter((n) => n.endsWith(".sql")).sort();

console.log(`\n${"═".repeat(74)}`);
console.log(`  RÉCONCILIATION DES MIGRATIONS   ${G}(témoin relevé le ${registre.releve_le})${Z}`);
console.log(`${"═".repeat(74)}\n`);

const divergences = [];
const enAttente = [];
const parVersion = new Map(registre.migrations.map((m) => [m.version, m]));
const vus = new Set();
/* La plus récente version réellement appliquée : au-delà, un fichier est du
   travail en cours ; en deçà, une absence est suspecte. */
const derniereAppliquee = registre.migrations.map((m) => m.version).sort().at(-1) ?? "";

for (const fichier of fichiers) {
  const version = fichier.split("_")[0];

  if (EST_BASELINE(fichier)) {
    console.log(`  ${G}·${Z} ${fichier}`);
    console.log(`      ${G}état historique — jamais appliqué, absent du registre par construction${Z}`);
    continue;
  }

  const m = parVersion.get(version);
  if (!m) {
    /*
     * Une migration écrite mais pas encore appliquée n'est pas une
     * divergence : c'est du travail en cours. On les distingue par leur
     * version — plus récente que tout ce qui a tourné. Une version PLUS
     * ANCIENNE absente du registre, en revanche, est un fichier qui prétend
     * une histoire qui n'a pas eu lieu.
     */
    if (version > derniereAppliquee) {
      console.log(`  ${J}⏳${Z} ${fichier}`);
      console.log(`      ${G}écrite, pas encore appliquée — normale tant qu'elle attend sa bascule${Z}`);
      enAttente.push(fichier);
    } else {
      console.log(`  ${R}✗${Z} ${fichier}`);
      console.log(`      ${G}version ${version} antérieure à la dernière appliquée, et absente du registre :`);
      console.log(`      ce fichier raconte une histoire qui n'a pas eu lieu${Z}`);
      divergences.push(fichier);
    }
    continue;
  }
  vus.add(version);

  const contenu = readFileSync(join(DOSSIER, fichier), "utf8");

  if (correspond(contenu, m.sha256)) {
    console.log(`  ${V}✓${Z} ${fichier} ${G}— identique à ce qui a été appliqué (${m.nom})${Z}`);
  } else {
    console.log(`  ${R}✗${Z} ${fichier} ${G}— diverge de ce qui a été appliqué (${m.nom})${Z}`);
    console.log(`      ${G}registre : ${m.sha256.slice(0, 16)}…${Z}`);
    console.log(`      ${G}fichier  : ${sha(contenu.replace(/\n+$/, "")).slice(0, 16)}…${Z}`);
    divergences.push(fichier);
  }
}

for (const m of registre.migrations) {
  if (!vus.has(m.version)) {
    console.log(`  ${R}✗${Z} version ${m.version} (${m.nom}) appliquée en base, ${B}sans fichier dans Git${Z}`);
    console.log(`      ${G}l'écart silencieux : la base sait quelque chose que le dépôt ignore${Z}`);
    divergences.push(m.version);
  }
}

const migrations = fichiers.filter((f) => !EST_BASELINE(f)).length;
console.log(`\n${"═".repeat(74)}`);
console.log(
  `  ${registre.migrations.length} appliquée(s) · ${migrations} dans Git · ${fichiers.length - migrations} baseline(s)` +
    (enAttente.length ? ` · ${enAttente.length} en attente` : "")
);

if (divergences.length) {
  console.log(`\n${R}${B}DIVERGENCE — ${divergences.length} écart(s)${Z}\n`);
  console.log(`  Ne pas réappliquer une migration pour « corriger » l'écart : elle est déjà`);
  console.log(`  passée. C'est le fichier qu'il faut aligner sur le registre, jamais l'inverse.\n`);
  process.exit(1);
}
console.log(`\n${V}Réconcilié — le dépôt et la base racontent la même histoire.${Z}\n`);
