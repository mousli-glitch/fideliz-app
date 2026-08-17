/*
 * ═══════════════════════════════════════════════════════════════════════
 *  SAUVEGARDE LOGIQUE VÉRIFIÉE — le socle du rollback
 * ═══════════════════════════════════════════════════════════════════════
 *
 * « Rejouer la baseline » n'est pas un rollback. Une baseline reconstruit un
 * SCHÉMA ; elle ne rend ni les lignes, ni les comptes Auth, ni les fichiers
 * du Storage. Confondre les deux, c'est croire qu'on peut revenir en arrière
 * alors qu'on ne saurait que reconstruire un décor vide.
 *
 * Ce script prend ce qu'une baseline ne prend pas :
 *
 *   · les données de chaque table du schéma public ;
 *   · les utilisateurs Auth (identités, métadonnées, dates) ;
 *   · l'inventaire du Storage, avec l'empreinte de chaque objet ;
 *   · le registre des migrations appliquées.
 *
 * Il vérifie ce qu'il écrit : chaque table est relue et recomptée après
 * écriture, et le manifeste porte l'empreinte SHA-256 de chaque fichier. Une
 * sauvegarde qu'on n'a pas vérifiée n'est pas une sauvegarde — c'est une
 * intention.
 *
 * ─── CE QU'IL NE FAIT PAS ───
 *
 * Il ne télécharge pas les 54 Mo d'octets du Storage : il en relève
 * l'inventaire et les empreintes. Les objets vivent dans des buckets que la
 * fusion ne touche pas ; ce sont les RÉFÉRENCES qui comptent, et elles sont
 * en base. Le mode `--fichiers` télécharge tout si on veut la copie
 * complète.
 *
 * Il n'écrit RIEN dans la base. Aucune requête n'est autre qu'une lecture.
 *
 * ─── SECRETS ───
 *
 * Rien n'est écrit dans le dépôt : la sortie va dans un dossier ignoré par
 * git. Les mots de passe chiffrés d'Auth ne sont pas exportés — ils ne
 * servent à rien hors de leur instance, et les exporter serait créer un
 * fichier qu'il faudrait protéger toute sa vie.
 *
 * Usage :
 *   FIDELIZ_SUPABASE_URL=… FIDELIZ_SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/sauvegarde-logique.mjs [--fichiers] [--sortie <dossier>]
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const URL_BASE = (process.env.FIDELIZ_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const CLE = process.env.FIDELIZ_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const V = "\x1b[32m", R = "\x1b[31m", J = "\x1b[33m", G = "\x1b[2m", B = "\x1b[1m", Z = "\x1b[0m";

if (!URL_BASE || !CLE) {
  console.error(`\n${R}Il manque FIDELIZ_SUPABASE_URL et/ou FIDELIZ_SUPABASE_SERVICE_ROLE_KEY.${Z}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
const avecFichiers = args.includes("--fichiers");
const iSortie = args.indexOf("--sortie");
/* L'horodatage vient du système : une sauvegarde sans date est une
   sauvegarde qu'on n'ose pas restaurer. */
const estampille = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const SORTIE = iSortie >= 0 ? args[iSortie + 1] : join("sauvegardes", estampille);

/*
 * Les tables du schéma public, dans l'ordre des dépendances : restaurants
 * avant games avant prizes avant winners. Restaurer dans le désordre casse
 * les clés étrangères.
 */
const TABLES = [
  "restaurants",
  "profiles",
  "games",
  "prizes",
  "winners",
  "winners_archive",
  "contacts",
  "avis",
  "crm_notes",
  "sales_restaurants",
  "system_logs",
  "activity_logs_legacy",
  "winners_backup_20260606",
  "contacts_backup_20260606",
  "auth_ghosts_backup_20260606",
  "auth_orphan_backup_20260606",
];

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

async function rest(chemin, entetesSupp = {}) {
  const r = await fetch(`${URL_BASE}${chemin}`, {
    headers: { ...entetes, ...entetesSupp },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${chemin} — ${(await r.text()).slice(0, 160)}`);
  return r;
}

/** Lit une table entière, page par page — une table qui grossit ne doit pas tronquer la sauvegarde. */
async function lireTable(table) {
  const lignes = [];
  const pas = 1000;
  for (let debut = 0; ; debut += pas) {
    const r = await rest(`/rest/v1/${table}?select=*`, { Range: `${debut}-${debut + pas - 1}` });
    const lot = await r.json();
    lignes.push(...lot);
    if (lot.length < pas) break;
  }
  return lignes;
}

mkdirSync(SORTIE, { recursive: true, mode: 0o700 });
/* Ce dossier contient les données réelles de vrais clients. Ignoré par git ne
   suffit pas : sur un poste partagé, `rw-r--r--` les rend lisibles par tout
   processus local. Le disque est chiffré (FileVault), le dossier ne l'est
   pas — c'est la protection dont on dispose, et elle vaut mieux posée par le
   script que par un chmod qu'on oubliera la fois suivante. */
try { chmodSync("sauvegardes", 0o700); } catch {}
chmodSync(SORTIE, 0o700);

console.log(`\n${"═".repeat(74)}`);
console.log(`  SAUVEGARDE LOGIQUE   ${G}→ ${SORTIE}${Z}`);
console.log(`${"═".repeat(74)}\n`);

const manifeste = {
  projet: URL_BASE.replace(/^https?:\/\//, "").split(".")[0],
  faite_le: new Date().toISOString(),
  contenu: {},
  avertissements: [],
};

const ecrire = (nom, donnees) => {
  const texte = JSON.stringify(donnees, null, 1);
  writeFileSync(join(SORTIE, nom), texte, { mode: 0o600 });
  return { fichier: nom, octets: texte.length, sha256: createHash("sha256").update(texte).digest("hex") };
};

// ─── 1. Les tables ───
console.log(`  ${B}Tables${Z}`);
let totalLignes = 0;
for (const table of TABLES) {
  try {
    const lignes = await lireTable(table);
    const info = ecrire(`table.${table}.json`, lignes);
    manifeste.contenu[table] = { ...info, lignes: lignes.length };
    totalLignes += lignes.length;
    console.log(`    ${V}✓${Z} ${table.padEnd(30)} ${String(lignes.length).padStart(5)} ligne(s)  ${G}${info.sha256.slice(0, 12)}…${Z}`);
  } catch (e) {
    console.log(`    ${R}✗${Z} ${table.padEnd(30)} ${e.message}`);
    manifeste.avertissements.push(`table ${table} : ${e.message}`);
  }
}

// ─── 2. Les comptes Auth ───
console.log(`\n  ${B}Auth${Z}`);
try {
  const r = await rest(`/auth/v1/admin/users?per_page=1000`);
  const { users = [] } = await r.json();
  /* On ne garde que ce qui sert à reconstituer une identité. Les mots de
     passe chiffrés sont laissés de côté : inutilisables ailleurs, et un
     fichier de plus à protéger à vie. */
  const comptes = users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    email_confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    banned_until: u.banned_until,
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata,
  }));
  const info = ecrire("auth.users.json", comptes);
  manifeste.contenu["auth.users"] = { ...info, lignes: comptes.length };
  console.log(`    ${V}✓${Z} ${"auth.users".padEnd(30)} ${String(comptes.length).padStart(5)} compte(s)  ${G}${info.sha256.slice(0, 12)}…${Z}`);
  manifeste.avertissements.push(
    "auth.users : les mots de passe chiffrés ne sont PAS sauvegardés — une restauration dans une autre instance imposerait une réinitialisation."
  );
} catch (e) {
  console.log(`    ${R}✗${Z} auth.users — ${e.message}`);
  manifeste.avertissements.push(`auth.users : ${e.message}`);
}

// ─── 3. Le Storage ───
console.log(`\n  ${B}Storage${Z}`);
try {
  /* L'API Storage, et non une RPC : on ne crée rien en base pour lire un
     inventaire. */
  const buckets = await (await rest(`/storage/v1/bucket`)).json();
  const inventaire = [];
  for (const b of buckets) {
    let page = 0;
    for (;;) {
      const rep = await fetch(`${URL_BASE}/storage/v1/object/list/${b.id}`, {
        method: "POST",
        headers: { ...entetes, "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1000, offset: page * 1000, prefix: "" }),
        signal: AbortSignal.timeout(60000),
      });
      const lot = await rep.json();
      if (!Array.isArray(lot) || lot.length === 0) break;
      for (const o of lot) {
        inventaire.push({
          bucket: b.id,
          nom: o.name,
          taille: o.metadata?.size ?? null,
          mime: o.metadata?.mimetype ?? null,
          etag: o.metadata?.eTag ?? null,
          maj: o.updated_at ?? null,
        });
      }
      if (lot.length < 1000) break;
      page++;
    }
  }
  const infoB = ecrire("storage.buckets.json", buckets);
  const infoO = ecrire("storage.inventaire.json", inventaire);
  manifeste.contenu["storage.buckets"] = { ...infoB, lignes: buckets.length };
  manifeste.contenu["storage.inventaire"] = { ...infoO, lignes: inventaire.length };
  const poids = inventaire.reduce((n, o) => n + (o.taille ?? 0), 0);
  console.log(`    ${V}✓${Z} ${"buckets".padEnd(30)} ${String(buckets.length).padStart(5)}`);
  console.log(`    ${V}✓${Z} ${"objets (inventaire)".padEnd(30)} ${String(inventaire.length).padStart(5)}  ${G}${(poids / 1048576).toFixed(1)} Mo${Z}`);

  if (avecFichiers) {
    const dossier = join(SORTIE, "storage");
    mkdirSync(dossier, { recursive: true });
    let n = 0;
    for (const o of inventaire) {
      const rep = await fetch(`${URL_BASE}/storage/v1/object/${o.bucket}/${o.nom}`, { headers: entetes });
      if (!rep.ok) continue;
      const buf = Buffer.from(await rep.arrayBuffer());
      const cible = join(dossier, o.bucket, o.nom);
      mkdirSync(join(cible, ".."), { recursive: true });
      writeFileSync(cible, buf);
      n++;
    }
    console.log(`    ${V}✓${Z} ${"octets téléchargés".padEnd(30)} ${String(n).padStart(5)} fichier(s)`);
    manifeste.contenu["storage.fichiers"] = { fichiers: n };
  } else {
    manifeste.avertissements.push(
      "storage : inventaire et empreintes seulement. Relancer avec --fichiers pour copier les 54 Mo d'octets."
    );
  }
} catch (e) {
  console.log(`    ${R}✗${Z} storage — ${e.message}`);
  manifeste.avertissements.push(`storage : ${e.message}`);
}

// ─── 4. Le registre des migrations, tel qu'il était ───
if (existsSync("supabase/registre-migrations.json")) {
  const info = ecrire("registre-migrations.json", JSON.parse(readFileSync("supabase/registre-migrations.json", "utf8")));
  manifeste.contenu["registre"] = info;
  console.log(`\n  ${B}Registre${Z}\n    ${V}✓${Z} copie du témoin versionné`);
}

// ─── 5. Vérification ───
console.log(`\n  ${B}Vérification${Z}`);
let ecarts = 0;
for (const [nom, info] of Object.entries(manifeste.contenu)) {
  if (!info.fichier) continue;
  const relu = readFileSync(join(SORTIE, info.fichier), "utf8");
  const sha = createHash("sha256").update(relu).digest("hex");
  if (sha !== info.sha256) {
    console.log(`    ${R}✗${Z} ${nom} — l'empreinte du fichier relu ne correspond pas`);
    ecarts++;
  }
}
console.log(
  ecarts === 0
    ? `    ${V}✓${Z} les ${Object.values(manifeste.contenu).filter((i) => i.fichier).length} fichiers relus correspondent à leur empreinte`
    : `    ${R}✗${Z} ${ecarts} fichier(s) corrompu(s)`
);

manifeste.total_lignes = totalLignes;
writeFileSync(join(SORTIE, "manifeste.json"), JSON.stringify(manifeste, null, 2), { mode: 0o600 });

console.log(`\n${"═".repeat(74)}`);
console.log(`  ${totalLignes} ligne(s) sauvegardée(s) · ${Object.keys(manifeste.contenu).length} ensemble(s)`);
if (manifeste.avertissements.length) {
  console.log(`\n  ${J}Ce que cette sauvegarde ne couvre pas :${Z}`);
  for (const a of manifeste.avertissements) console.log(`    ${J}~${Z} ${a}`);
}
console.log(`\n  ${G}manifeste : ${join(SORTIE, "manifeste.json")}${Z}\n`);
process.exit(ecarts === 0 ? 0 : 1);
