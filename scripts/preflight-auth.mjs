/*
 * ═══════════════════════════════════════════════════════════════════════
 *  PRÉFLIGHT — la configuration Auth ne vit dans aucune migration
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `disable_signup` est un réglage du tableau de bord Supabase. Aucune
 * migration PostgreSQL ne le porte, aucun fichier du dépôt ne le garantit,
 * et rien n'empêche qu'il soit rebasculé un jour pour débloquer un écran.
 *
 * Le 18/08/2026, il était à `false` sur la production Fideliz, avec la
 * confirmation d'e-mail désactivée. `handle_new_user_profile()` lisait alors
 * le rôle dans les métadonnées du client : une inscription portant
 * `{"role":"root"}` donnait un compte root immédiatement utilisable.
 *
 * Le trigger est corrigé et l'inscription publique fermée. Ce script vérifie
 * que les deux le restent — c'est la moitié qu'aucun test du dépôt ne peut
 * voir.
 *
 * ─── AUCUN SECRET ───
 *
 * Il lit `/auth/v1/settings`, qui répond avec la clé *publiable* — celle qui
 * part déjà dans le navigateur de chaque visiteur. Elle est prise dans
 * l'environnement, jamais écrite ici, et rien de ce qui est lu n'est affiché
 * au-delà des booléens de configuration.
 *
 * Usage :
 *   node scripts/preflight-auth.mjs
 *   URL_SUPABASE=… CLE_PUBLIABLE=… node scripts/preflight-auth.mjs
 *
 * Sortie : 0 conforme · 1 NON CONFORME (critère de NO-GO) · 2 indéterminé.
 */

const URL_BASE = process.env.URL_SUPABASE ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.CLE_PUBLIABLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const V = "\x1b[32m", R = "\x1b[31m", J = "\x1b[33m", G = "\x1b[2m", B = "\x1b[1m", Z = "\x1b[0m";

if (!URL_BASE || !CLE) {
  console.error(
    `\n${J}INDÉTERMINÉ${Z} — il manque l'URL du projet ou la clé publiable.\n` +
      `  Elles vivent dans .env.local (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY),\n` +
      `  ou se passent en clair : URL_SUPABASE=… CLE_PUBLIABLE=…\n`
  );
  process.exit(2);
}

/*
 * L'état exigé. Chaque entrée porte sa raison : une valeur figée sans
 * explication finit par être « corrigée » par quelqu'un qui la croit
 * arbitraire.
 */
const EXIGE = [
  {
    cle: "disable_signup",
    attendu: true,
    quoi: "l'inscription publique est fermée",
    pourquoi:
      "En V1, personne ne s'inscrit depuis une page publique. Les comptes sont créés par " +
      "les parcours protégés — root crée les commerciaux, root ou un commercial crée un " +
      "restaurant — et le rôle est posé côté serveur. Rouvrir ceci pour débloquer un écran " +
      "est un NO-GO.",
  },
  {
    cle: "external.email",
    attendu: true,
    quoi: "le fournisseur e-mail reste actif",
    pourquoi:
      "Il porte la connexion des comptes existants ET la récupération de mot de passe. " +
      "Le couper enfermerait dehors les neuf comptes de la plateforme.",
  },
];

let reponse;
try {
  const r = await fetch(`${URL_BASE.replace(/\/$/, "")}/auth/v1/settings`, {
    headers: { apikey: CLE },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  reponse = await r.json();
} catch (e) {
  console.error(`\n${J}INDÉTERMINÉ${Z} — configuration Auth injoignable : ${e.message}\n`);
  process.exit(2);
}

const lire = (chemin) => chemin.split(".").reduce((o, k) => o?.[k], reponse);

console.log(`\n${"═".repeat(70)}\n  PRÉFLIGHT — configuration Auth\n${"═".repeat(70)}\n`);

const echecs = [];
for (const e of EXIGE) {
  const vu = lire(e.cle);
  const ok = vu === e.attendu;
  console.log(`  ${ok ? V + "✓" : R + "✗"}${Z} ${e.quoi} ${G}(${e.cle} = ${vu})${Z}`);
  if (!ok) {
    console.log(`      ${G}${e.pourquoi}${Z}`);
    echecs.push(e);
  }
}

/* Signalé, pas exigé : la confirmation d'e-mail n'est plus une barrière
   depuis que l'inscription est fermée, mais elle redeviendrait décisive le
   jour où quelqu'un rouvrirait celle-ci. */
const autoconfirm = lire("mailer_autoconfirm");
if (autoconfirm === true) {
  console.log(
    `  ${J}~${Z} la confirmation d'e-mail est désactivée ${G}(mailer_autoconfirm = true)${Z}`
  );
  console.log(
    `      ${G}Sans conséquence tant que l'inscription publique est fermée. Le jour où elle`
  );
  console.log(`      rouvrirait, ce réglage devrait rebasculer en même temps.${Z}`);
}

const autres = Object.entries(reponse.external ?? {})
  .filter(([k, v]) => v === true && k !== "email")
  .map(([k]) => k);
if (autres.length) {
  console.log(`  ${R}✗${Z} d'autres fournisseurs publics sont actifs : ${autres.join(", ")}`);
  console.log(
    `      ${G}Chacun est une porte d'inscription que disable_signup ne ferme pas forcément.${Z}`
  );
  echecs.push({ cle: "external.*" });
}

console.log(`\n${"═".repeat(70)}`);
if (echecs.length) {
  console.log(`${R}${B}NON CONFORME — critère de NO-GO${Z}\n`);
  console.log(`  La création de comptes en V1 passe uniquement par les parcours protégés.`);
  console.log(`  Une inscription self-service est un chantier à part : rôle non privilégié`);
  console.log(`  imposé, confirmation d'e-mail, anti-abus, limite de débit, et une décision`);
  console.log(`  explicite de Samy.\n`);
  process.exit(1);
}
console.log(`${V}Conforme — les comptes ne se créent que par les parcours protégés.${Z}\n`);
