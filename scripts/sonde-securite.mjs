/*
 * ═══════════════════════════════════════════════════════════════════════
 *  SONDE DE SÉCURITÉ — les deux P0, vus de l'extérieur
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La matrice des rôles est testée hors ligne (lib/securite/garde-admin.test.ts) :
 * on ne peut pas ouvrir une session de root ou de restaurateur depuis une
 * suite de tests sans manipuler de vrais mots de passe.
 *
 * Ce que cette sonde prouve, c'est l'autre moitié — celle qu'aucun test
 * unitaire ne peut prouver : que le serveur RÉELLEMENT DÉPLOYÉ refuse
 * l'inconnu. C'est exactement la position de l'attaquant : aucune session,
 * juste l'URL et, pour le ticket, l'UUID imprimé sur le papier du client.
 *
 * ─── ELLE N'ÉCRIT RIEN ───
 *
 * Les charges utiles sont choisies pour être inertes. Le corps vide envoyé
 * à create-user ne peut créer aucun compte même si la garde tombait : il
 * n'y a ni e-mail ni mot de passe. L'UUID envoyé à winners est celui d'un
 * ticket qui n'existe pas.
 *
 * Usage :
 *   node scripts/sonde-securite.mjs
 *   BASE=https://<preview>.vercel.app node scripts/sonde-securite.mjs
 */

const BASE = process.env.BASE ?? "https://app.fideliz-app.fr";

/* Un UUID valide dans sa forme, mais qui ne désigne aucun ticket. Si la
   garde tombait, la route ne trouverait rien à consommer. */
const TICKET_INEXISTANT = "00000000-0000-4000-8000-000000000000";

const V = "\x1b[32m", R = "\x1b[31m", G = "\x1b[2m", Z = "\x1b[0m";
const echecs = [];

async function sonder({ nom, methode, chemin, corps, attendus, pourquoi }) {
  let statut, texte;
  try {
    const r = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: { "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    statut = r.status;
    texte = (await r.text()).slice(0, 200);
  } catch (e) {
    console.log(`  ${R}✗ ${nom}${Z} — injoignable : ${e.message}`);
    echecs.push(nom);
    return;
  }

  const ok = attendus.includes(statut);
  console.log(`  ${ok ? V + "✓" : R + "✗"}${Z} ${nom} ${G}— HTTP ${statut}${Z}`);
  console.log(`      ${G}${pourquoi}${Z}`);
  if (!ok) {
    console.log(`      ${R}attendu ${attendus.join(" ou ")}, reçu ${statut}${Z}`);
    console.log(`      ${G}corps : ${texte}${Z}`);
    echecs.push(nom);
  }
}

console.log(`\n${"═".repeat(70)}\n  SONDE DE SÉCURITÉ — appels anonymes sur ${BASE}\n${"═".repeat(70)}\n`);

// ─── P0-A : création de compte ───
console.log("P0-A — création de compte\n");

await sonder({
  nom: "POST /api/admin/create-user, corps vide",
  methode: "POST",
  chemin: "/api/admin/create-user",
  corps: {},
  attendus: [401],
  pourquoi: "L'identité est exigée AVANT de regarder la charge utile — un 400 ici signifierait que la validation passe en premier, donc qu'un anonyme est déjà entré.",
});

await sonder({
  nom: "POST /api/admin/create-user, tentative de fabriquer un root",
  methode: "POST",
  chemin: "/api/admin/create-user",
  corps: { email: "intrus@exemple.invalid", password: "motdepasse-long", role: "root" },
  attendus: [401],
  pourquoi: "La faille d'origine, mot pour mot : un rôle arbitraire dans le corps de la requête.",
});

// ─── P0-B : consommation de ticket ───
console.log("\nP0-B — consommation d'un ticket\n");

await sonder({
  nom: "PATCH /api/admin/winners, UUID seul",
  methode: "PATCH",
  chemin: "/api/admin/winners",
  corps: { id: TICKET_INEXISTANT },
  attendus: [401],
  pourquoi: "L'UUID est imprimé dans le QR que le client montre : il identifie le ticket, il n'autorise pas à le brûler.",
});

await sonder({
  nom: "PATCH /api/admin/winners, corps vide",
  methode: "PATCH",
  chemin: "/api/admin/winners",
  corps: {},
  attendus: [401],
  pourquoi: "Même exigence : l'identité passe avant la charge utile.",
});

await sonder({
  nom: "POST /api/admin/winners (méthode non exposée)",
  methode: "POST",
  chemin: "/api/admin/winners",
  corps: { id: TICKET_INEXISTANT },
  attendus: [405],
  pourquoi: "Seul PATCH est exporté. Une autre méthode ne doit pas trouver de porte dérobée.",
});

// ─── Les Server Actions, protégées par l'aiguillage ───
console.log("\nCréation de comptes par Server Action — couverture du middleware\n");

for (const chemin of [
  "/super-admin/root/new-restaurant",
  "/super-admin/root/sales-management",
  "/super-admin/sales/new-restaurant",
]) {
  await sonder({
    nom: `POST ${chemin}`,
    methode: "POST",
    chemin,
    corps: {},
    attendus: [307, 302],
    pourquoi: "Ces pages portent des Server Actions qui créent des comptes sans garde interne. Elles ne tiennent que par le matcher du middleware : si ce redirect disparaît, elles s'ouvrent.",
  });
}

// ─── Minimisation du prénom sur /verify ───
console.log("\n/verify — minimisation des données personnelles\n");

await sonder({
  nom: "GET /verify/<uuid inexistant>",
  methode: "GET",
  chemin: `/verify/${TICKET_INEXISTANT}`,
  attendus: [200],
  pourquoi: "La page répond toujours : les tickets déjà imprimés doivent continuer d'ouvrir la même URL.",
});

console.log(`\n${"═".repeat(70)}`);
if (echecs.length) {
  console.log(`${R}${echecs.length} sonde(s) en échec :${Z}`);
  for (const e of echecs) console.log(`  ✗ ${e}`);
  console.log("");
  process.exit(1);
}
console.log(`${V}Toutes les sondes sont conformes : l'inconnu est refusé partout.${Z}\n`);
