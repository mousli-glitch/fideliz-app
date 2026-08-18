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

/* Journal des opérations réellement tentées, dans l'ordre. */
let journal: string[] = [];
/* Erreur à renvoyer pour une opération donnée, sinon succès. */
let echecs: Record<string, { message: string }> = {};
/* Réponse du résolveur d'héritier. */
let heritier: unknown = { ok: true, rootId: "root-synthetique" };

function reponsePour(cle: string) {
  journal.push(cle);
  const e = echecs[cle];
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
      chaine.update = () => { verbe = "update"; return chaine; };
      chaine.delete = () => { verbe = "delete"; return chaine; };
      chaine.select = () => chaine;
      chaine.eq = () => chaine;
      chaine.is = () => chaine;
      chaine.then = (r: (v: unknown) => unknown) =>
        reponsePour(`${table}:${verbe}`).then(r);
      return chaine;
    },
    auth: {
      admin: {
        deleteUser: async () => {
          journal.push("auth:deleteUser");
          const e = echecs["auth:deleteUser"];
          return { error: e ?? null };
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
  echecs = {};
  heritier = { ok: true, rootId: "root-synthetique" };
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

  it("suppression du profil échouée : le compte Auth SURVIT", async () => {
    echecs["profiles:delete"] = { message: "panne" };
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(false);
    expect(journal, "supprimer l'Auth ici laisserait un profil fantôme").not.toContain("auth:deleteUser");
  });

  it("chemin nominal : l'ordre va du moins destructif au plus destructif", async () => {
    const r = await deleteSalesUserAction("cible");
    expect(r.success).toBe(true);
    expect(journal).toEqual([
      "restaurants:update",
      "restaurants:update",
      "sales_restaurants:delete",
      "profiles:delete",
      "auth:deleteUser",
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

  it("suppression du profil échouée : le compte Auth SURVIT", async () => {
    echecs["profiles:delete"] = { message: "panne" };
    const r = await masterDeleteUser("cible");
    expect(r.success).toBe(false);
    expect(journal).not.toContain("auth:deleteUser");
  });

  it("chemin nominal : l'ordre va du moins destructif au plus destructif", async () => {
    const r = await masterDeleteUser("cible");
    expect(r.success).toBe(true);
    expect(journal).toEqual([
      "restaurants:update",
      "restaurants:update",
      "sales_restaurants:delete",
      "profiles:delete",
      "auth:deleteUser",
    ]);
  });
});

describe("rejeu après échec partiel", () => {
  it("un second appel après un échec de profil aboutit sans effet de bord", async () => {
    echecs["profiles:delete"] = { message: "panne transitoire" };
    const premier = await deleteSalesUserAction("cible");
    expect(premier.success).toBe(false);

    // La panne cesse ; on rejoue. Les étapes déjà faites sont idempotentes
    // (`update ... eq` sur des lignes déjà réattribuées ne change rien).
    journal = [];
    echecs = {};
    const second = await deleteSalesUserAction("cible");
    expect(second.success).toBe(true);
    expect(journal).toEqual([
      "restaurants:update",
      "restaurants:update",
      "sales_restaurants:delete",
      "profiles:delete",
      "auth:deleteUser",
    ]);
  });
});
