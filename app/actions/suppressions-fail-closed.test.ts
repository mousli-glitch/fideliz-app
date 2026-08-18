import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LES CHEMINS DESTRUCTIFS S'ARRÊTENT AVANT DE DÉTRUIRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trois défauts réels, signalés le 19/08/2026 et vérifiés dans le code avant
 * correction :
 *
 *   1. `repairOrphansAction` prenait l'héritier d'un résolveur qui rendait
 *      `null` aussi bien pour « aucun root » que pour « lecture impossible »
 *      (son `error` n'était pas lu), puis écrivait ce `null` dans
 *      `owner_id`/`user_id` À LA CLÉ DE SERVICE — et répondait `success`.
 *      Une panne de lecture devenait une perte de données silencieuse.
 *
 *   2. `masterDeleteUser` ignorait les erreurs des deux réattributions ET du
 *      nettoyage du portefeuille, puis supprimait profil et compte Auth. Une
 *      réattribution échouée laissait donc des restaurants rattachés à un
 *      utilisateur qui n'existait plus.
 *
 *   3. `deleteSalesUserAction` vérifiait les réattributions mais ignorait le
 *      nettoyage du portefeuille et la suppression du profil, avant de
 *      supprimer le compte Auth.
 *
 * Ces tests prouvent le comportement, pas la présence d'un motif : ils
 * simulent l'échec de chaque étape et vérifient QUE LES ÉTAPES SUIVANTES
 * N'ONT PAS EU LIEU. Un test lexical n'aurait rien vu.
 */

vi.mock("server-only", () => ({}));

// La garde de rôle passe : ce n'est pas ce qu'on teste ici.
vi.mock("@/lib/securite/garde-action", () => ({
  exigerRole: async () => ({ ok: true, appelant: "root-synthetique" }),
  tracerAction: async () => {},
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/*
 * Journal des opérations réellement tentées, dans l'ordre.
 *
 * Signalé le 19/08 : la version précédente ne retenait que `table:verbe`.
 * Trois `restaurants:update` identiques passaient donc le test même si le
 * code avait mis à jour TROIS FOIS LA MÊME COLONNE — c'est-à-dire même si
 * `user_id`, le lien qui cascade, n'était jamais réattribué. On enregistre
 * désormais la charge utile et le prédicat, et on les vérifie nommément.
 */
let journal: string[] = [];
let operations: { cle: string; payload?: unknown; predicat?: [string, unknown] }[] = [];
/* Erreur à renvoyer pour une opération donnée, sinon succès. */
let echecs: Record<string, { message: string }> = {};
/* Réponse du résolveur d'héritier. */
let heritier: unknown = { ok: true, rootId: "root-synthetique" };
/* Ce que la relecture autoritative d'existence Auth doit répondre. */
let relectureAuth: "present" | "absent" | "erreur" = "present";

function reponsePour(cle: string, payload?: unknown, predicat?: [string, unknown]) {
  journal.push(cle);
  operations.push({ cle, payload, predicat });
  // La clé d'échec peut viser une colonne précise : `restaurants:update:user_id`.
  const colonne = payload && typeof payload === "object" ? Object.keys(payload as object)[0] : undefined;
  const e = echecs[colonne ? `${cle}:${colonne}` : cle] ?? echecs[cle];
  return Promise.resolve({ data: e ? null : [], error: e ?? null });
}

/*
 * Client simulé : chaque terminaison (`update`, `delete`) journalise une clé
 * `table:verbe` et rend l'erreur configurée. Les maillons intermédiaires
 * (`eq`, `is`) se chaînent.
 */
function clientSimule() {
  return {
    from: (table: string) => {
      const chaine: Record<string, unknown> = {};
      let verbe = "";
      let payload: unknown;
      let predicat: [string, unknown] | undefined;
      chaine.update = (v: unknown) => { verbe = "update"; payload = v; return chaine; };
      chaine.delete = () => { verbe = "delete"; return chaine; };
      chaine.select = () => chaine;
      chaine.eq = (col: string, val: unknown) => { predicat = [col, val]; return chaine; };
      chaine.is = (col: string, val: unknown) => { predicat = [col, val]; return chaine; };
      chaine.then = (r: (v: unknown) => unknown) =>
        reponsePour(`${table}:${verbe}`, payload, predicat).then(r);
      return chaine;
    },
    auth: {
      admin: {
        deleteUser: async () => {
          journal.push("auth:deleteUser");
          const e = echecs["auth:deleteUser"];
          return { error: e ?? null };
        },
        // Relecture autoritative apres un echec de deleteUser.
        getUserById: async () => {
          journal.push("auth:getUserById");
          if (relectureAuth === "erreur") {
            return { data: null, error: { message: "transport indisponible", status: 503 } };
          }
          if (relectureAuth === "absent") {
            return { data: null, error: { message: "User not found", status: 404 } };
          }
          return { data: { user: { id: "cible" } }, error: null };
        },
      },
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => clientSimule() }));

vi.mock("@/lib/securite/root", () => ({
  resoudreRootHeritier: async () => heritier,
  cibleEstProtegee: async () => false,
}));

const { repairOrphansAction } = await import("./repair-orphans");
const { deleteSalesUserAction } = await import("./delete-sales-user");
const { masterDeleteUser } = await import("./admin-actions");

beforeEach(() => {
  journal = [];
  operations = [];
  echecs = {};
  heritier = { ok: true, rootId: "root-synthetique" };
  relectureAuth = "present";
});

describe("repairOrphansAction — aucune écriture sans héritier positivement identifié", () => {
  it("erreur de lecture : refuse, et n'écrit RIEN", async () => {
    heritier = { ok: false, cause: "erreur_lecture" };
    const r = await repairOrphansAction();
    expect(r.success).toBe(false);
    expect(journal, "aucune opération ne doit avoir été tentée").toEqual([]);
  });

  it("aucun root : refuse, et n'écrit RIEN", async () => {
    heritier = { ok: false, cause: "aucun_root" };
    const r = await repairOrphansAction();
    expect(r.success).toBe(false);
    expect(journal).toEqual([]);
  });

  it("root trouvé : la réparation a lieu", async () => {
    const r = await repairOrphansAction();
    expect(r.success).toBe(true);
    expect(journal).toEqual(["restaurants:update"]);
  });

  it("erreur de l'UPDATE : signalée, jamais annoncée comme un succès", async () => {
    echecs["restaurants:update"] = { message: "panne" };
    const r = await repairOrphansAction();
    expect(r.success).toBe(false);
  });
});

describe("deleteSalesUserAction — arrêt avant chaque étape destructive", () => {
  it("héritier illisible : rien n'est touché", async () => {
    heritier = { ok: false, cause: "erreur_lecture" };
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect(journal).toEqual([]);
  });

  it("réattribution échouée : ni profil ni Auth supprimés", async () => {
    echecs["restaurants:update"] = { message: "panne" };
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("profiles:delete");
    expect(journal).not.toContain("auth:deleteUser");
  });

  it("nettoyage du portefeuille échoué : ni profil ni Auth supprimés", async () => {
    echecs["sales_restaurants:delete"] = { message: "panne" };
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("profiles:delete");
    expect(journal).not.toContain("auth:deleteUser");
  });

  it("P0 : les TROIS colonnes distinctes sont réattribuées, chacune sur son prédicat", async () => {
    // Un simple compte de trois `restaurants:update` passerait même si le
    // code mettait trois fois à jour la même colonne — donc même si
    // `user_id`, le lien qui CASCADE, était oublié. On vérifie nommément.
    await deleteSalesUserAction("cible");
    const majRestaurants = operations.filter((o) => o.cle === "restaurants:update");
    expect(majRestaurants.map((o) => o.payload)).toEqual([
      { created_by: "root-synthetique" },
      { owner_id: "root-synthetique" },
      { user_id: "root-synthetique" },
    ]);
    expect(majRestaurants.map((o) => o.predicat)).toEqual([
      ["created_by", "cible"],
      ["owner_id", "cible"],
      ["user_id", "cible"],
    ]);
  });

  for (const colonne of ["created_by", "owner_id", "user_id"] as const) {
    it(`échec de la réattribution \`${colonne}\` -> aucune suppression Auth`, async () => {
      echecs[`restaurants:update:${colonne}`] = { message: "panne" };
      const r = await deleteSalesUserAction("cible");
      expect(r.success).toBe(false);
      expect(journal, "l'Auth aurait pu emporter le restaurant en cascade").not.toContain("auth:deleteUser");
      expect(journal).not.toContain("profiles:delete");
    });
  }

  it("P0 : `user_id` échoue APRÈS le succès des deux premières -> arrêt net", async () => {
    // Le cas le plus tardif des trois : les deux premières réattributions
    // ont abouti, la troisième échoue. Rien de destructif ne doit suivre.
    echecs["restaurants:update:user_id"] = { message: "panne" };
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect(operations.filter((o) => o.cle === "restaurants:update").length).toBe(3);
    expect(journal).not.toContain("sales_restaurants:delete");
    expect(journal).not.toContain("auth:deleteUser");
  });

  it("chemin nominal : l'ordre va du moins destructif au plus destructif", async () => {
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(true);
    expect(journal).toEqual([
      "restaurants:update",   // created_by
      "restaurants:update",   // owner_id
      "restaurants:update",   // user_id — le lien qui CASCADE
      "sales_restaurants:delete",
      "auth:deleteUser",      // le profil part par cascade, volontairement
    ]);
  });
});

describe("masterDeleteUser — arrêt avant chaque étape destructive", () => {
  it("héritier illisible : rien n'est touché", async () => {
    heritier = { ok: false, cause: "erreur_lecture" };
    const r = await masterDeleteUser("cible");
    expect(r.success).toBe(false);
    expect(journal).toEqual([]);
  });

  it("réattribution échouée : ni profil ni Auth supprimés", async () => {
    echecs["restaurants:update"] = { message: "panne" };
    const r = await masterDeleteUser("cible");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("profiles:delete");
    expect(journal).not.toContain("auth:deleteUser");
  });

  it("nettoyage du portefeuille échoué : ni profil ni Auth supprimés", async () => {
    echecs["sales_restaurants:delete"] = { message: "panne" };
    const r = await masterDeleteUser("cible");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("profiles:delete");
    expect(journal).not.toContain("auth:deleteUser");
  });

  it("P0 : les trois colonnes sont réattribuées avant la suppression Auth", async () => {
    await masterDeleteUser("cible");
    expect(journal.filter((o) => o === "restaurants:update").length).toBe(3);
    expect(journal.indexOf("auth:deleteUser")).toBeGreaterThan(journal.lastIndexOf("restaurants:update"));
  });

  it("le profil n'est JAMAIS supprimé explicitement (il part par cascade)", async () => {
    await masterDeleteUser("cible");
    expect(journal, "le supprimer avant l'Auth rendrait le rejeu impossible").not.toContain("profiles:delete");
  });

  it("chemin nominal : l'ordre va du moins destructif au plus destructif", async () => {
    const r = await masterDeleteUser("cible");
    expect(r.success).toBe(true);
    expect(journal).toEqual([
      "restaurants:update",   // created_by
      "restaurants:update",   // owner_id
      "restaurants:update",   // user_id — le lien qui CASCADE
      "sales_restaurants:delete",
      "auth:deleteUser",      // le profil part par cascade, volontairement
    ]);
  });
});

const SEQUENCE_NOMINALE = [
  "restaurants:update",   // created_by
  "restaurants:update",   // owner_id
  "restaurants:update",   // user_id — le lien qui CASCADE vers auth.users
  "sales_restaurants:delete",
  "auth:deleteUser",      // le profil part par cascade, volontairement
];

describe("rejeu après échec partiel — y compris le cas le plus tardif", () => {
  it("P0 : échec de l'appel Auth, puis rejeu qui aboutit", async () => {
    /*
     * Le cas que l'ancien test ne couvrait pas : réattributions faites,
     * puis `auth.admin.deleteUser` échoue. L'ancienne séquence avait DÉJÀ
     * supprimé le profil à ce stade — au rejeu, `cibleEstProtegee` traite
     * (à raison) un profil absent comme protégé et refuse. La suppression
     * ne pouvait donc plus jamais être terminée : un compte Auth orphelin,
     * indéfiniment. L'ancien test simulait l'échec du profil, c'est-à-dire
     * précisément le cas qui, lui, fonctionnait.
     *
     * Depuis que le profil part par cascade, il survit à cet échec et le
     * rejeu converge vers le même état final.
     */
    echecs["auth:deleteUser"] = { message: "panne transitoire" };
    const premier = await deleteSalesUserAction("cible");
    expect(premier.success).toBe(false);
    expect(journal, "le profil doit avoir survécu à l'échec Auth").not.toContain("profiles:delete");

    journal = [];
    echecs = {};
    const second = await deleteSalesUserAction("cible");
    expect(second.success).toBe(true);
    expect(journal).toEqual(SEQUENCE_NOMINALE);
  });

  it("un second appel après un échec de portefeuille converge au même état", async () => {
    echecs["sales_restaurants:delete"] = { message: "panne transitoire" };
    expect((await masterDeleteUser("cible")).success).toBe(false);
    journal = [];
    echecs = {};
    expect((await masterDeleteUser("cible")).success).toBe(true);
    expect(journal).toEqual(SEQUENCE_NOMINALE);
  });
});

describe("issue Auth ambiguë — l'erreur ne prouve pas l'absence de suppression", () => {
  /*
   * Une erreur rendue par `deleteUser` peut suivre une suppression RÉUSSIE
   * côté serveur (coupure sur la réponse, délai dépassé). Conclure « erreur
   * donc rien n'a été supprimé » serait une supposition : le profil aurait
   * déjà disparu par cascade, et un rejeu refuserait (profil absent =
   * protégé), laissant la suppression inachevée pour toujours.
   */

  it("erreur Auth + compte ENCORE PRÉSENT : échec franc, rejouable", async () => {
    echecs["auth:deleteUser"] = { message: "panne" };
    relectureAuth = "present";
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect((r as { ambigu?: boolean }).ambigu).toBeFalsy();
    expect(journal, "la relecture doit avoir eu lieu").toContain("auth:getUserById");
  });

  it("erreur Auth + compte CONFIRMÉ ABSENT : succès idempotent", async () => {
    // Le serveur avait réussi ; l'erreur portait sur la réponse, pas sur
    // l'effet. L'état final visé est atteint.
    echecs["auth:deleteUser"] = { message: "coupure sur la réponse" };
    relectureAuth = "absent";
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(true);
  });

  it("erreur Auth + relecture ELLE-MÊME en erreur : état AUTH_OUTCOME_AMBIGUOUS", async () => {
    echecs["auth:deleteUser"] = { message: "panne" };
    relectureAuth = "erreur";
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect((r as { etat?: string }).etat).toBe("AUTH_OUTCOME_AMBIGUOUS");
    // Aucune destruction supplémentaire n'est tentée après l'indéterminé.
    expect(journal.filter((o) => o === "auth:deleteUser").length).toBe(1);
  });

  it("une erreur de transport n'est JAMAIS repliée sur « absent »", async () => {
    // Replier un 503 sur « absent » ferait conclure au succès sur une panne.
    echecs["auth:deleteUser"] = { message: "panne" };
    relectureAuth = "erreur";
    const r = await deleteSalesUserAction("cible");
    expect(r.success, "une panne ne doit jamais devenir un succès").toBe(false);
  });

  it("masterDeleteUser applique la même règle — la primitive est partagée", async () => {
    echecs["auth:deleteUser"] = { message: "coupure" };
    relectureAuth = "absent";
    expect((await masterDeleteUser("cible")).success).toBe(true);
  });
});
