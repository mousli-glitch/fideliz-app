import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * FILET ANTI-RÉGRESSION
 * ═════════════════════
 *
 * Une Server Action qui instancie `service_role` contourne RLS : la base ne la
 * rattrapera pas. Son autorisation ne peut donc venir que de son propre code.
 *
 * Ce test lit le dossier et refuse toute action `service_role` sans garde. Une
 * nouvelle action non gardée fait échouer la suite le jour où elle est écrite,
 * pas le jour où elle est exploitée.
 *
 * Ni l'identifiant d'une Server Action ni le middleware ne comptent comme une
 * garde : le premier est extractible du bundle, le second ne connaît pas
 * l'objet visé.
 */

const DOSSIER = join(process.cwd(), "app/actions");

/*
 * Le vocabulaire doit couvrir TOUTES les formes de garde réellement employées,
 * pas seulement les helpers récents. Une liste trop étroite crée des faux
 * positifs — `validate-win.ts` et `get-winner-info.ts` sont gardés à la main,
 * par `auth.getUser()` puis comparaison du restaurant, et un filet ignorant
 * cette forme les aurait signalés à tort.
 */
const GARDES = [
  "exigerRole", "exigerRestaurant", "exigerRestaurantParSlug",
  "autoriserParJeu", "autoriserRestaurant",
  "garderResto", "garderRoot",
  "auth.getUser", "createAuthClient", "identiteRecevable", "deciderValidationTicket",
];

/*
 * Publiques par conception : le jeu que le client scanne. Leur protection est
 * ailleurs — RPC `security definer` et limitation par IP — et un contrôle de
 * session les casserait.
 */
const PUBLIQUES = new Set(["play-game.ts", "register-winner.ts", "check-replay.ts"]);

/*
 * DORMANTS — injoignables, donc hors du hotfix de production
 * ═════════════════════════════════════════════════════════
 *
 * Ces quatre fichiers ouvrent `service_role` sans garde, mais aucun n'apparaît
 * dans `server-reference-manifest.json` : le build ne leur attribue aucun
 * identifiant de dispatch, et Next.js ne route une Server Action que par cet
 * identifiant. Sans importateur, pas d'entrée au manifeste ; sans entrée, pas
 * de point d'entrée.
 *
 * `get-winners-page.ts` mérite sa mention : un composant l'importe bien, mais
 * ce composant n'est monté nulle part. Un import ne prouve pas qu'un fichier
 * vit — il faut que l'importateur vive aussi.
 *
 * Ils ne sont donc pas durcis ici : le candidat de production reste limité à
 * la surface réellement atteignable. Leur durcissement attend sur une branche
 * séparée. Ce qui les tient fermés, c'est leur absence d'appelant — et c'est
 * précisément ce que le test suivant surveille.
 */
const DORMANTS = new Set<string>([]);   // durcis sur cette branche : plus aucune dispense

const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("Server Actions en service_role", () => {
  it("le dossier est bien lu", () => {
    expect(fichiers.length).toBeGreaterThan(5);
  });

  it.each(fichiers)("%s : service_role implique une garde", (nom) => {
    const src = readFileSync(join(DOSSIER, nom), "utf8");

    const serviceRole = src.includes("SUPABASE_SERVICE_ROLE_KEY");
    const exporteUneAction = /export async function/.test(src);
    if (!serviceRole || !exporteUneAction || PUBLIQUES.has(nom) || DORMANTS.has(nom)) return;

    const garde = GARDES.some((g) => src.includes(g));
    expect(garde, `${nom} ouvre service_role sans aucune garde d'autorisation`).toBe(true);
  });

  /*
   * Le verrou du choix ci-dessus : un dormant n'est sûr que tant qu'AUCUNE
   * route ne l'atteint. Le test suit les imports de proche en proche depuis
   * les routes réelles (`page`, `layout`, `route`) — pas seulement les imports
   * directs, sinon `get-winners-page.ts` passerait pour vivant alors que son
   * unique importateur n'est lui-même monté nulle part.
   */
  it.each([...DORMANTS])("%s reste inatteignable depuis toute route", (nom) => {
    const fichiers = new Map<string, string>();
    const parcourir = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const chemin = join(d, e.name);
        if (e.isDirectory()) { if (!["node_modules", ".next"].includes(e.name)) parcourir(chemin); }
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) {
          fichiers.set(chemin, readFileSync(chemin, "utf8"));
        }
      }
    };
    for (const racine of ["app", "components", "lib", "utils"]) {
      try { parcourir(join(process.cwd(), racine)); } catch {}
    }

    // Résout un alias "@/x/y" vers le fichier réel.
    const resoudre = (spec: string) => {
      if (!spec.startsWith("@/")) return null;
      const base = join(process.cwd(), spec.slice(2));
      for (const suf of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (fichiers.has(base + suf)) return base + suf;
      }
      return null;
    };

    const cible = join(process.cwd(), "app/actions", nom);
    const vus = new Set<string>();
    const file = [...fichiers.keys()].filter((f) =>
      /\/(page|layout|route|template|default|error|loading|not-found)\.tsx?$/.test(f));

    while (file.length) {
      const f = file.pop()!;
      if (vus.has(f)) continue;
      vus.add(f);
      for (const m of (fichiers.get(f) ?? "").matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
        const r = resoudre(m[1]);
        if (r && !vus.has(r)) file.push(r);
      }
    }

    /* Contre-témoin : un graphe cassé rendrait TOUT inatteignable et ce test
     * passerait sans rien vérifier. `update-game.ts` doit y être trouvé. */
    expect(vus.has(join(process.cwd(), "app/actions/update-game.ts")),
      "le graphe d'imports est cassé : même update-game.ts semble inatteignable").toBe(true);

    expect(vus.has(cible),
      `${nom} est devenu atteignable depuis une route : le durcir avant de l'utiliser`).toBe(false);
  });

  it("les actions vivantes corrigées portent leur garde", () => {
    const attendu = [
      "update-game.ts", "create-game.ts",
      "get-sales-data.ts", "log-system-error.ts", "google-business.ts",
    ];
    for (const nom of attendu) {
      const src = readFileSync(join(DOSSIER, nom), "utf8");
      expect(GARDES.some((g) => src.includes(g)), `${nom} a perdu sa garde`).toBe(true);
    }
  });

  it("update-game n'écrit jamais avec un identifiant venu du client", () => {
    const src = readFileSync(join(DOSSIER, "update-game.ts"), "utf8");

    // `data.restaurant_id` était le cœur de la faille : il ne doit plus servir.
    expect(src).not.toMatch(/eq\(\s*["']id["']\s*,\s*data\.restaurant_id/);
    // Et le gameId reçu ne doit plus filtrer ni remplir une écriture.
    expect(src).not.toMatch(/eq\(\s*["']game_?[iI]d["']\s*,\s*gameId/);
    expect(src).not.toMatch(/game_id:\s*gameId/);
  });
});
