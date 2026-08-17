import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LE CHEMIN RÉELLEMENT EXÉCUTÉ
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `deciderValidationTicket` est testée à part, et c'est nécessaire — mais
 * insuffisant. Une décision juste appelée avec les mauvais arguments refuse
 * ou accepte n'importe quoi. Ce qui compte, c'est ce que fait l'action que
 * la caisse déclenche réellement.
 *
 * Ces tests exercent donc `validateWinAction` de bout en bout, avec une
 * fausse base : on vérifie le verdict rendu à l'écran, mais aussi ce qui a
 * été ÉCRIT — la mise à jour conditionnelle, et la ligne de journal.
 *
 * La base est fausse, jamais clonée depuis la production : aucun ticket
 * réel, aucun prénom réel, aucun identifiant réel.
 */

// ───────────────────────────────────────────────── la fausse base

type Ligne = Record<string, unknown>;

const base = {
  session: null as { id: string; email: string } | null,
  profils: new Map<string, Ligne>(),
  tickets: new Map<string, Ligne>(),
  jeux: new Map<string, Ligne>(),
  journal: [] as Ligne[],
  /* Simule la course entre deux caisses : quand c'est vrai, la mise à jour
     conditionnelle ne touche aucune ligne, comme si l'autre était passée
     entre la lecture et l'écriture. */
  courseperdue: false,
};

function table(nom: string) {
  const filtres: Ligne = {};
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      filtres[col] = val;
      return api;
    },
    single: async () => lire(nom, filtres),
    maybeSingle: async () => lire(nom, filtres),
    insert: async (l: Ligne) => {
      if (nom === "system_logs") base.journal.push(l);
      return { data: null, error: null };
    },
    update: (patch: Ligne) => ({
      eq: (col: string, val: unknown) => {
        filtres[col] = val;
        return {
          eq: (col2: string, val2: unknown) => {
            filtres[col2] = val2;
            return {
              select: async () => {
                const t = base.tickets.get(filtres.id as string);
                if (!t || base.courseperdue || t.status !== filtres.status)
                  return { data: [], error: null };
                Object.assign(t, patch);
                return { data: [{ id: t.id, status: t.status, redeemed_at: t.redeemed_at }], error: null };
              },
            };
          },
        };
      },
    }),
  };
  return api;
}

function lire(nom: string, f: Ligne) {
  const source =
    nom === "profiles" ? base.profils : nom === "winners" ? base.tickets : nom === "games" ? base.jeux : new Map();
  const l = source.get(f.id as string);
  return { data: l ?? null, error: l ? null : { message: "introuvable" } };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (n: string) => table(n) }),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: base.session } }) },
    from: (n: string) => table(n),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { validateWinAction } = await import("./validate-win");

// ───────────────────────────────────────────────── le décor

const RESTO_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const RESTO_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const JEU_A = "dddddddd-0000-4000-8000-00000000000d";
const TICKET = "cccccccc-0000-4000-8000-00000000000c";

const GERANT_A = { id: "1111aaaa-0000-4000-8000-000000000001", email: "gerant-a@essai.invalid" };
const GERANT_B = { id: "2222bbbb-0000-4000-8000-000000000002", email: "gerant-b@essai.invalid" };
const ROOT = { id: "3333cccc-0000-4000-8000-000000000003", email: "root@essai.invalid" };
const BLOQUE = { id: "4444dddd-0000-4000-8000-000000000004", email: "bloque@essai.invalid" };

beforeEach(() => {
  base.session = GERANT_A;
  base.courseperdue = false;
  base.journal = [];

  base.profils = new Map([
    [GERANT_A.id, { id: GERANT_A.id, role: "restaurant", restaurant_id: RESTO_A, is_active: true }],
    [GERANT_B.id, { id: GERANT_B.id, role: "restaurant", restaurant_id: RESTO_B, is_active: true }],
    [ROOT.id, { id: ROOT.id, role: "root", restaurant_id: null, is_active: true }],
    [BLOQUE.id, { id: BLOQUE.id, role: "restaurant", restaurant_id: RESTO_A, is_active: false }],
  ]);

  base.jeux = new Map([[JEU_A, { id: JEU_A, restaurant_id: RESTO_A, validity_days: 7 }]]);

  base.tickets = new Map([
    [
      TICKET,
      {
        id: TICKET,
        status: "available",
        redeemed_at: null,
        game_id: JEU_A,
        created_at: new Date().toISOString(),
        prizes: { label: "1 Café", color: "#000000" },
      },
    ],
  ]);
});

const journalDe = (action: string) => base.journal.filter((l) => l.action_type === action);
const ticket = () => base.tickets.get(TICKET)!;

// ───────────────────────────────────────────────── les cas

describe("validateWinAction — le chemin de la caisse", () => {
  it("l'anonyme est refusé, et rien n'est écrit", async () => {
    base.session = null;
    const r = await validateWinAction(TICKET);
    expect(r.success).toBe(false);
    expect(r.message).toContain("Connexion au dashboard");
    expect(ticket().status).toBe("available");
    expect(base.journal).toHaveLength(0); // pas de session : rien à imputer à personne
  });

  it("le mauvais restaurant est refusé, et le refus est journalisé", async () => {
    base.session = GERANT_B;
    const r = await validateWinAction(TICKET);
    expect(r.success).toBe(false);
    expect(r.message).toContain("ne correspond pas à votre restaurant");
    expect(ticket().status).toBe("available");

    const [trace] = journalDe("winner.validation_refus");
    expect(trace).toMatchObject({ user_id: GERANT_B.id, level: "warn" });
    expect((trace.details as Ligne).motif).toBe("AUTRE_RESTAURANT");
  });

  it("le compte désactivé est refusé", async () => {
    base.session = BLOQUE;
    const r = await validateWinAction(TICKET);
    expect(r.success).toBe(false);
    expect(r.message).toContain("Compte désactivé");
    expect(ticket().status).toBe("available");
  });

  it("le ticket déjà consommé est refusé, avec sa date et son lot", async () => {
    Object.assign(ticket(), { status: "redeemed", redeemed_at: "2026-08-10T12:00:00.000Z" });
    const r = await validateWinAction(TICKET) as { alreadyUsed?: boolean; message: string; prize?: unknown };
    expect(r.alreadyUsed).toBe(true);
    expect(r.message).toContain("DÉJÀ UTILISÉ");
    expect(r.prize).toMatchObject({ label: "1 Café" });
  });

  it("le ticket inconnu est refusé", async () => {
    const r = await validateWinAction("9999ffff-0000-4000-8000-00000000000f");
    expect(r.success).toBe(false);
    expect(r.message).toContain("invalide ou introuvable");
  });

  it("le parcours normal : le gérant valide un ticket de son restaurant", async () => {
    const r = await validateWinAction(TICKET) as { success: boolean; prizeLabel?: string };
    expect(r.success).toBe(true);
    expect(r.prizeLabel).toBe("1 Café");
    expect(ticket().status).toBe("redeemed");
    expect(ticket().redeemed_at).toBeTruthy();

    const [trace] = journalDe("winner.validation");
    expect(trace).toMatchObject({ level: "info", user_id: GERANT_A.id, restaurant_id: RESTO_A });
    expect((trace.details as Ligne).perime).toBe(false);
  });

  it("le root valide dans n'importe quelle enseigne", async () => {
    base.session = ROOT;
    base.jeux.set(JEU_A, { id: JEU_A, restaurant_id: RESTO_B, validity_days: 7 });
    const r = await validateWinAction(TICKET);
    expect(r.success).toBe(true);
  });

  /*
   * Le geste que Samy a confirmé le 18/08/2026 : « Valider quand même ».
   * Un ticket périmé reste validable par le restaurateur autorisé, sur SON
   * restaurant, et l'opération laisse une trace nominative distincte.
   */
  describe("« Valider quand même » sur un ticket périmé", () => {
    beforeEach(() => {
      Object.assign(ticket(), { created_at: "2026-01-01T12:00:00.000Z" });
    });

    it("le restaurateur autorisé peut le valider", async () => {
      const r = await validateWinAction(TICKET);
      expect(r.success).toBe(true);
      expect(ticket().status).toBe("redeemed");
    });

    it("la trace le dit explicitement", async () => {
      await validateWinAction(TICKET);
      const [trace] = journalDe("winner.validation");
      expect(trace.message).toBe("Ticket périmé validé quand même");
      expect((trace.details as Ligne).perime).toBe(true);
    });

    it("un autre restaurant ne le peut toujours pas", async () => {
      base.session = GERANT_B;
      const r = await validateWinAction(TICKET);
      expect(r.success).toBe(false);
      expect(ticket().status).toBe("available");
    });

    it("un anonyme ne le peut toujours pas", async () => {
      base.session = null;
      const r = await validateWinAction(TICKET);
      expect(r.success).toBe(false);
      expect(ticket().status).toBe("available");
    });

    it("il ne peut pas être validé deux fois pour autant", async () => {
      expect((await validateWinAction(TICKET)).success).toBe(true);
      const second = await validateWinAction(TICKET) as { alreadyUsed?: boolean };
      expect(second.alreadyUsed).toBe(true);
    });
  });

  /*
   * Deux caisses scannent le même ticket au même instant. Les deux passent
   * la décision — elle lit un ticket « available » dans les deux cas. C'est
   * l'écriture conditionnelle qui départage : une seule touche une ligne.
   */
  it("le double appel concurrent ne valide qu'une fois", async () => {
    const premier = await validateWinAction(TICKET);
    expect(premier.success).toBe(true);

    /* La seconde caisse avait lu le ticket avant l'écriture de la première :
       sa décision dit oui, son écriture ne trouve plus rien. */
    Object.assign(ticket(), { status: "available" });
    base.courseperdue = true;

    const second = await validateWinAction(TICKET);
    expect(second.success).toBe(false);
    expect(second.message).toContain("Aucune ligne validée");

    const [perdue] = journalDe("winner.validation_refus");
    expect((perdue.details as Ligne).motif).toBe("COURSE_PERDUE");
  });

  it("chaque trace nomme son canal — l'action, pas l'API", async () => {
    await validateWinAction(TICKET);
    expect((journalDe("winner.validation")[0].details as Ligne).canal).toBe("action");
  });
});
