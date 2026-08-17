import { describe, it, expect } from "vitest";
import { deciderCreationCompte, deciderValidationTicket } from "./garde-admin";

/*
 * Deux routes ont laissé un inconnu créer un compte et brûler un ticket.
 * Ces tests ne vérifient pas qu'elles fonctionnent : ils vérifient
 * qu'elles REFUSENT. C'est le seul sens dans lequel une faille se prouve
 * fermée.
 *
 * Chaque cas nommé ici correspond à une manière réelle de s'y prendre —
 * pas de session, une session d'un autre rôle, une session légitime mais
 * d'un autre restaurant, un ticket déjà brûlé, un ticket périmé.
 */

const ROOT = { role: "root", restaurant_id: null, is_active: true };
const RESTAURATEUR = { role: "restaurant", restaurant_id: "aaaaaaaa-0000-4000-8000-000000000001", is_active: true };
const COMMERCIAL = { role: "sales", restaurant_id: null, is_active: true };
const STAFF = { role: "staff", restaurant_id: "aaaaaaaa-0000-4000-8000-000000000001", is_active: true };

const RESTO_A = "aaaaaaaa-0000-4000-8000-000000000001";
const RESTO_B = "bbbbbbbb-0000-4000-8000-000000000002";

const chargeValide = {
  email: "gerant@exemple.fr",
  password: "motdepasse-long",
  role: "restaurant",
  restaurant_id: RESTO_A,
};

// ═══════════════════════════════════════════════════ P0-A — création de compte

describe("P0-A — création de compte", () => {
  const creer = (p: Partial<Parameters<typeof deciderCreationCompte>[0]>) =>
    deciderCreationCompte({
      authentifie: true,
      profil: ROOT,
      charge: chargeValide,
      restaurantExiste: true,
      ...p,
    });

  describe("refuse", () => {
    it("l'appel anonyme — la faille d'origine", () => {
      const v = creer({ authentifie: false, profil: null });
      expect(v).toMatchObject({ ok: false, statut: 401, motif: "NON_AUTHENTIFIE" });
    });

    it("le restaurateur authentifié", () => {
      expect(creer({ profil: RESTAURATEUR })).toMatchObject({ statut: 403, motif: "ROLE_NON_AUTORISE" });
    });

    it("le staff", () => {
      expect(creer({ profil: STAFF })).toMatchObject({ statut: 403, motif: "ROLE_NON_AUTORISE" });
    });

    it("le commercial", () => {
      expect(creer({ profil: COMMERCIAL })).toMatchObject({ statut: 403, motif: "ROLE_NON_AUTORISE" });
    });

    it("le commercial qui tente de fabriquer un root", () => {
      const v = creer({ profil: COMMERCIAL, charge: { ...chargeValide, role: "root" } });
      // Il tombe sur le rôle AVANT même qu'on regarde ce qu'il demande.
      expect(v).toMatchObject({ statut: 403, motif: "ROLE_NON_AUTORISE" });
    });

    it("le root lui-même, s'il tente de fabriquer un root", () => {
      const v = creer({ charge: { ...chargeValide, role: "root" } });
      expect(v).toMatchObject({ statut: 400, motif: "ROLE_INTERDIT" });
    });

    it("un rôle inconnu", () => {
      expect(creer({ charge: { ...chargeValide, role: "superviseur" } })).toMatchObject({
        motif: "ROLE_INTERDIT",
      });
    });

    it("un compte désactivé, fût-il root", () => {
      expect(creer({ profil: { ...ROOT, is_active: false } })).toMatchObject({
        statut: 403,
        motif: "COMPTE_DESACTIVE",
      });
    });

    it("un profil introuvable", () => {
      expect(creer({ profil: null })).toMatchObject({ statut: 403, motif: "PROFIL_INTROUVABLE" });
    });

    it("un restaurant hors périmètre — inexistant en base", () => {
      expect(creer({ restaurantExiste: false })).toMatchObject({ statut: 404, motif: "RESTAURANT_INCONNU" });
    });

    it("un compte restaurant sans restaurant", () => {
      expect(creer({ charge: { ...chargeValide, restaurant_id: undefined } })).toMatchObject({
        motif: "RESTAURANT_MANQUANT",
      });
    });

    it("un restaurant_id qui n'est pas un UUID", () => {
      expect(creer({ charge: { ...chargeValide, restaurant_id: "la-ruche" } })).toMatchObject({
        motif: "RESTAURANT_MANQUANT",
      });
    });

    it("un commercial rattaché à un restaurant — périmètre inventé", () => {
      const v = creer({ charge: { ...chargeValide, role: "sales", restaurant_id: RESTO_A } });
      expect(v).toMatchObject({ motif: "PERIMETRE_INCOHERENT" });
    });

    it("une charge utile falsifiée — corps vide", () => {
      expect(creer({ charge: {} })).toMatchObject({ statut: 400, motif: "EMAIL_INVALIDE" });
    });

    it("une charge utile falsifiée — types inattendus", () => {
      const v = creer({ charge: { email: { toString: () => "x@y.fr" }, password: 12345678, role: ["root"] } });
      expect(v).toMatchObject({ ok: false });
    });

    it("un e-mail manifestement faux", () => {
      expect(creer({ charge: { ...chargeValide, email: "pas-une-adresse" } })).toMatchObject({
        motif: "EMAIL_INVALIDE",
      });
    });

    it("un mot de passe trop court", () => {
      expect(creer({ charge: { ...chargeValide, password: "court" } })).toMatchObject({
        motif: "MDP_TROP_COURT",
      });
    });
  });

  describe("accepte", () => {
    it("le root qui crée un compte restaurant en bonne et due forme", () => {
      expect(creer({})).toEqual({ ok: true });
    });

    it("le root qui crée un commercial sans restaurant", () => {
      const v = creer({ charge: { email: "com@exemple.fr", password: "motdepasse-long", role: "sales" } });
      expect(v).toEqual({ ok: true });
    });

    it("le root qui crée un commercial avec restaurant_id vide", () => {
      const v = creer({
        charge: { email: "com@exemple.fr", password: "motdepasse-long", role: "sales", restaurant_id: "" },
      });
      expect(v).toEqual({ ok: true });
    });
  });
});

// ══════════════════════════════════════════════ P0-B — consommation d'un ticket

describe("P0-B — consommation d'un ticket", () => {
  const LE_15 = new Date("2026-08-15T12:00:00Z");
  const MAINTENANT = new Date("2026-08-18T12:00:00Z");

  const ticketNeuf = {
    id: "cccccccc-0000-4000-8000-000000000003",
    status: "available",
    game_id: "dddddddd-0000-4000-8000-000000000004",
    created_at: MAINTENANT.toISOString(),
  };
  const jeuA = { id: "dddddddd-0000-4000-8000-000000000004", restaurant_id: RESTO_A, validity_days: 7 };

  const valider = (p: Partial<Parameters<typeof deciderValidationTicket>[0]>) =>
    deciderValidationTicket({
      authentifie: true,
      profil: RESTAURATEUR,
      identifiantDemande: ticketNeuf.id,
      ticket: ticketNeuf,
      jeu: jeuA,
      maintenant: MAINTENANT,
      ...p,
    });

  describe("refuse", () => {
    it("l'appel anonyme muni du seul UUID — la faille d'origine", () => {
      const v = valider({ authentifie: false, profil: null });
      expect(v).toMatchObject({ ok: false, statut: 401, motif: "NON_AUTHENTIFIE" });
    });

    it("le mauvais restaurant — un restaurateur qui brûle le ticket d'un confrère", () => {
      const v = valider({ jeu: { ...jeuA, restaurant_id: RESTO_B } });
      expect(v).toMatchObject({ statut: 403, motif: "AUTRE_RESTAURANT" });
    });

    it("un restaurateur sans restaurant rattaché", () => {
      const v = valider({ profil: { ...RESTAURATEUR, restaurant_id: null } });
      expect(v).toMatchObject({ statut: 403, motif: "AUTRE_RESTAURANT" });
    });

    it("un rôle non habilité à la caisse", () => {
      expect(valider({ profil: COMMERCIAL })).toMatchObject({ statut: 403, motif: "ROLE_NON_AUTORISE" });
      expect(valider({ profil: STAFF })).toMatchObject({ statut: 403, motif: "ROLE_NON_AUTORISE" });
    });

    it("un compte désactivé", () => {
      expect(valider({ profil: { ...RESTAURATEUR, is_active: false } })).toMatchObject({
        motif: "COMPTE_DESACTIVE",
      });
    });

    it("un ticket inconnu", () => {
      expect(valider({ ticket: null })).toMatchObject({ statut: 404, motif: "TICKET_INTROUVABLE" });
    });

    it("un ticket dont le jeu a disparu", () => {
      expect(valider({ jeu: null })).toMatchObject({ statut: 404, motif: "JEU_INTROUVABLE" });
    });

    it("un ticket déjà consommé", () => {
      const v = valider({ ticket: { ...ticketNeuf, status: "redeemed" } });
      expect(v).toMatchObject({ statut: 409, motif: "DEJA_CONSOMME" });
    });

    it("un ticket dans un état imprévu", () => {
      const v = valider({ ticket: { ...ticketNeuf, status: "annule" } });
      expect(v).toMatchObject({ statut: 409, motif: "STATUT_INCOMPATIBLE" });
    });

    it("un ticket périmé — l'écart entre l'écran et l'API", () => {
      const v = valider({ ticket: { ...ticketNeuf, created_at: "2026-08-01T12:00:00Z" } });
      expect(v).toMatchObject({ statut: 410, motif: "TICKET_EXPIRE" });
    });

    it("un ticket périmé d'un jour — la validité d'un jour de Soukara", () => {
      const v = valider({
        ticket: { ...ticketNeuf, created_at: LE_15.toISOString() },
        jeu: { ...jeuA, validity_days: 1 },
      });
      expect(v).toMatchObject({ statut: 410, motif: "TICKET_EXPIRE" });
    });

    it("un UUID falsifié — chaîne qui n'en est pas un", () => {
      expect(valider({ identifiantDemande: "'; drop table winners; --" })).toMatchObject({
        statut: 400,
        motif: "IDENTIFIANT_INVALIDE",
      });
    });

    it("un identifiant absent", () => {
      expect(valider({ identifiantDemande: undefined })).toMatchObject({ motif: "IDENTIFIANT_INVALIDE" });
    });

    it("un identifiant qui n'est pas une chaîne", () => {
      expect(valider({ identifiantDemande: { id: 1 } })).toMatchObject({ motif: "IDENTIFIANT_INVALIDE" });
    });
  });

  describe("accepte", () => {
    it("le parcours réel en caisse : le restaurateur valide un ticket de SON restaurant", () => {
      expect(valider({})).toEqual({ ok: true });
    });

    it("le root, qui passe toutes les enseignes", () => {
      expect(valider({ profil: ROOT, jeu: { ...jeuA, restaurant_id: RESTO_B } })).toEqual({ ok: true });
    });

    it("un ticket sans limite de validité (validity_days = 0)", () => {
      const v = valider({
        ticket: { ...ticketNeuf, created_at: "2024-01-01T00:00:00Z" },
        jeu: { ...jeuA, validity_days: 0 },
      });
      expect(v).toEqual({ ok: true });
    });

    it("un ticket émis à l'instant, le dernier jour de sa validité", () => {
      const v = valider({
        ticket: { ...ticketNeuf, created_at: "2026-08-11T13:00:00Z" },
        jeu: { ...jeuA, validity_days: 7 },
      });
      expect(v).toEqual({ ok: true });
    });
  });

  /*
   * Le double appel concurrent ne se décide pas ici : les deux requêtes
   * voient le même ticket « available » et reçoivent toutes deux un feu
   * vert. C'est l'écriture conditionnelle `.eq('status','available')` qui
   * tranche, dans Postgres — une seule des deux mises à jour touche une
   * ligne, l'autre en touche zéro et repart en 409.
   *
   * Ce test fige l'attendu pour qu'on ne croie pas, un jour, que la
   * décision suffit à garantir l'unicité.
   */
  it("deux appels simultanés reçoivent tous deux un feu vert — l'unicité est l'affaire de Postgres", () => {
    expect(valider({})).toEqual({ ok: true });
    expect(valider({})).toEqual({ ok: true });
  });
});
