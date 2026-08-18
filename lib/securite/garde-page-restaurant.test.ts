import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  TOUTE PAGE QUI LIT AVEC LA CLÉ DE SERVICE DOIT AUTORISER D'ABORD
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Le défaut du 18/08 n'était pas une faute de raisonnement : c'était une
 * ligne absente, dans trois fichiers sur quarante et un. Rien ne la
 * réclamait, rien ne signalait son absence, et la matrice RLS ne pouvait pas
 * la voir puisque ces pages contournent la RLS par construction.
 *
 * Ce test la réclame. Il ne vérifie pas une intention : il vérifie que tout
 * fichier combinant la clé de service et un identifiant venu de l'URL appelle
 * une garde d'autorisation.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (["node_modules", ".next", ".git"].includes(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

function sansCommentaires(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/*
 * Les routes délibérément publiques. Elles sont nommées une par une, jamais
 * par un motif : une exemption qui s'élargit toute seule finit par couvrir la
 * page qu'on voulait protéger.
 *
 *   play/[slug]   la page de jeu, ouverte par le QR
 *   scan/[slug]   l'entrée du QR, qui redirige vers le jeu actif
 *   verify/[id]   la vérification publique d'un ticket
 *
 * Les trois exposent volontairement des informations d'établissement à un
 * visiteur non connecté. Aucune ne sert de données d'un AUTRE tenant à un
 * compte connecté, qui est le défaut traité ici.
 */
const PUBLIQUES = new Set([
  "app/play/[slug]/page.tsx",
  "app/scan/[slug]/page.tsx",
  "app/verify/[id]/page.tsx",
]);

/*
 * Ce qui compte n'est pas le NOM de la garde mais le fait qu'elle établisse
 * l'identité de l'appelant CÔTÉ SERVEUR avant de lire. `auth.getUser()` est
 * la forme canonique — elle vérifie le jeton auprès du serveur Auth au lieu
 * de faire confiance au cookie. Les fonctions `decider*` et `exiger*` en
 * dépendent toutes.
 *
 * Ma première version de cette liste ne retenait que les helpers maison. Elle
 * signalait quatre routes API parfaitement gardées, qui appellent simplement
 * `getUser()` puis contrôlent le rôle. Une détection trop étroite crie au
 * loup, et on finit par ne plus l'écouter.
 */
const GARDES = [
  "autoriserRestaurant",
  "exigerRestaurantParSlug",
  "exigerRestaurant",
  "exigerRole",
  "cronAutorise",
  "autoriserGoogle",
  "deciderCreationCompte",
  "deciderValidationTicket",
  "auth.getUser",
];

describe("surface service_role — autorisation avant lecture", () => {
  const suspects = fichiers(join(RACINE, "app"))
    .map((f) => ({ chemin: f.replace(RACINE + "/", ""), src: sansCommentaires(readFileSync(f, "utf8")) }))
    .filter((f) => /SERVICE_ROLE_KEY|createAdminClient/.test(f.src))
    /* Un identifiant qui vient du client : params d'URL, query, corps. */
    .filter((f) => /await params|searchParams|req\.json\(\)|request\.json\(\)|formData/.test(f.src))
    .filter((f) => !PUBLIQUES.has(f.chemin));

  it("il y a bien des chemins à contrôler", () => {
    expect(suspects.length).toBeGreaterThan(0);
  });

  it("aucun ne lit avec la clé de service sans garde d'autorisation", () => {
    const nus = suspects
      .filter((f) => !GARDES.some((g) => f.src.includes(g)))
      .map((f) => f.chemin);

    expect(
      nus,
      `Ces fichiers lisent avec la clé de service — qui contourne la RLS — à partir\n` +
        `d'un identifiant fourni par le client, sans autoriser d'abord :\n  ${nus.join("\n  ")}\n\n` +
        `C'est le défaut exact du 18/08 : trois sessions différentes obtenaient la même\n` +
        `page d'un autre tenant, contacts clients compris.\n` +
        `Emploie autoriserRestaurant(slug, action) et repars de l'identifiant qu'elle rend.`,
    ).toEqual([]);
  });

  it("les trois pages du P0 autorisent avant de lire", () => {
    for (const p of [
      "app/admin/[slug]/page.tsx",
      "app/admin/[slug]/customers/page.tsx",
      "app/admin/[slug]/winners/page.tsx",
    ]) {
      const src = sansCommentaires(readFileSync(join(RACINE, p), "utf8"));
      expect(src, `${p} n'appelle pas la garde`).toContain("autoriserRestaurant");

      /* L'ordre compte autant que la présence : autoriser après avoir lu ne
         protège rien. La garde doit précéder la première requête. */
      const garde = src.indexOf("autoriserRestaurant(");
      const premiereLecture = src.search(/\.from\(["'`]/);
      expect(garde, `${p} : garde absente`).toBeGreaterThan(-1);
      expect(
        premiereLecture === -1 || garde < premiereLecture,
        `${p} : une lecture précède la garde`,
      ).toBe(true);
    }
  });

  it("aucune de ces pages ne résout plus le restaurant par le slug brut", () => {
    for (const p of [
      "app/admin/[slug]/page.tsx",
      "app/admin/[slug]/customers/page.tsx",
      "app/admin/[slug]/winners/page.tsx",
    ]) {
      const src = sansCommentaires(readFileSync(join(RACINE, p), "utf8"));
      expect(src, `${p} interroge encore par slug`).not.toMatch(/\.eq\(\s*["'`]slug["'`]/);
      expect(src, `${p} n'emploie pas l'identifiant autorisé`).toContain("acces.restaurantId");
    }
  });

  it("la garde n'admet pas le rôle commercial sur le dashboard", () => {
    const src = sansCommentaires(
      readFileSync(join(RACINE, "lib", "securite", "garde-page-restaurant.ts"), "utf8"),
    );
    expect(src).toMatch(/ROLES_DASHBOARD\s*=\s*\[\s*["']root["']\s*,\s*["']restaurant["']\s*\]/);
    expect(src).not.toMatch(/["']sales["']/);
  });

  it("le refus ne distingue pas « introuvable » de « pas le vôtre »", () => {
    /* Sinon la page dirait à un curieux quels slugs existent. */
    const src = sansCommentaires(
      readFileSync(join(RACINE, "lib", "securite", "garde-page-restaurant.ts"), "utf8"),
    );
    expect(src).toMatch(/return \{ autorise: false \}/);
    expect(src).not.toMatch(/introuvable/i);
  });
});
