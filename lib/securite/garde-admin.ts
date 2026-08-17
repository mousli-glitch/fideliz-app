/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LES DEUX DÉCISIONS D'AUTORISATION, ISOLÉES POUR ÊTRE TESTABLES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Deux routes ont laissé passer un appel anonyme : `/api/admin/create-user`
 * fabriquait un compte avec le rôle demandé, `PATCH /api/admin/winners`
 * brûlait un ticket sur son seul UUID — celui-là même qui est imprimé dans
 * le QR du client. Les deux exigent désormais une identité.
 *
 * Le refus ne se prouve pas en lisant le code : il se prouve en l'exécutant.
 * Or on ne peut pas ouvrir une session de restaurateur, de commercial ou de
 * root depuis une suite de tests sans manipuler de vrais mots de passe. La
 * décision est donc séparée du transport : ici, une fonction pure qui reçoit
 * un profil et une charge utile, et rend un verdict. La route se contente de
 * l'appliquer.
 *
 * `fail-closed` partout : toute forme non prévue est un refus, jamais un
 * laissez-passer. Un profil absent, un rôle inconnu, un champ manquant —
 * la réponse par défaut est non.
 */

export type Verdict =
  | { ok: true }
  | { ok: false; statut: 401 | 400 | 403 | 404 | 409 | 410; motif: string; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Volontairement simple : ce n'est pas un validateur d'e-mail, c'est un
   garde-fou contre une chaîne vide ou manifestement fausse. Supabase Auth
   reste l'autorité qui accepte ou refuse l'adresse. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LONGUEUR_MDP_MINIMALE = 8;

/** Les seuls rôles que cette route peut fabriquer. `root` n'en fait pas partie. */
export const ROLES_CREABLES = ["restaurant", "sales"] as const;
export type RoleCreable = (typeof ROLES_CREABLES)[number];

/** Les seuls rôles autorisés à valider un ticket en caisse. */
export const ROLES_VALIDATION = ["restaurant", "root"] as const;

export type Profil = {
  role?: string | null;
  restaurant_id?: string | null;
  is_active?: boolean | null;
} | null;

const refus = (statut: 401 | 400 | 403 | 404 | 409 | 410, motif: string, message: string): Verdict =>
  ({ ok: false, statut, motif, message });

/* ─────────────────────────────────────────────────────────────────────
 * Le socle commun : y a-t-il quelqu'un, et ce quelqu'un existe-t-il ?
 * ───────────────────────────────────────────────────────────────────── */
function identifier(authentifie: boolean, profil: Profil, rolesAdmis: readonly string[]): Verdict {
  if (!authentifie) return refus(401, "NON_AUTHENTIFIE", "Non autorisé");
  if (!profil) return refus(403, "PROFIL_INTROUVABLE", "Profil introuvable");
  if (profil.is_active === false) return refus(403, "COMPTE_DESACTIVE", "Compte désactivé");
  if (!profil.role || !rolesAdmis.includes(profil.role))
    return refus(403, "ROLE_NON_AUTORISE", "Accès refusé");
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────────
 * P0-A — création de compte
 *
 * Seul un root passe. Et même lui ne peut pas fabriquer un root : un compte
 * root se crée à la main, en base, jamais par une requête HTTP. Le rôle
 * arrivant du navigateur n'est jamais cru sur parole — il doit figurer dans
 * la liste blanche, et son périmètre doit être cohérent.
 * ───────────────────────────────────────────────────────────────────── */
export function deciderCreationCompte(entree: {
  authentifie: boolean;
  profil: Profil;
  charge: { email?: unknown; password?: unknown; role?: unknown; restaurant_id?: unknown };
  restaurantExiste?: boolean;
}): Verdict {
  const identite = identifier(entree.authentifie, entree.profil, ["root"]);
  if (!identite.ok) return identite;

  const { email, password, role, restaurant_id } = entree.charge;

  if (typeof email !== "string" || !EMAIL.test(email.trim()))
    return refus(400, "EMAIL_INVALIDE", "Adresse e-mail invalide.");

  if (typeof password !== "string" || password.length < LONGUEUR_MDP_MINIMALE)
    return refus(400, "MDP_TROP_COURT", `Mot de passe : ${LONGUEUR_MDP_MINIMALE} caractères minimum.`);

  if (typeof role !== "string" || !(ROLES_CREABLES as readonly string[]).includes(role))
    return refus(400, "ROLE_INTERDIT", `Rôle invalide. Attendu : ${ROLES_CREABLES.join(" ou ")}.`);

  /* Un compte restaurant sans restaurant est un compte qui verra tout ou
     rien selon la requête — les deux sont mauvais. Un compte commercial
     rattaché à un restaurant, c'est un périmètre qu'on lui invente. */
  if (role === "restaurant") {
    if (typeof restaurant_id !== "string" || !UUID.test(restaurant_id))
      return refus(400, "RESTAURANT_MANQUANT", "Un compte restaurant exige un restaurant_id valide.");
    if (entree.restaurantExiste === false)
      return refus(404, "RESTAURANT_INCONNU", "Ce restaurant n'existe pas.");
  } else if (restaurant_id !== undefined && restaurant_id !== null && restaurant_id !== "") {
    return refus(400, "PERIMETRE_INCOHERENT", "Un compte commercial n'est pas rattaché à un restaurant.");
  }

  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────────
 * P0-B — consommation d'un ticket
 *
 * L'UUID seul n'autorise rien. Il identifie le ticket, il ne prouve pas le
 * droit de le brûler : il est imprimé sur le papier que le client tient en
 * main, et lisible par quiconque voit ce papier.
 *
 * L'étanchéité est le contrôle qui compte vraiment. Sans elle, un
 * restaurateur parfaitement authentifié consommerait les tickets d'un
 * confrère — la session ne dit rien du périmètre.
 *
 * L'expiration ferme un écart entre l'écran et l'API : /verify masque le
 * bouton de validation sur un ticket périmé, mais l'API l'acceptait quand
 * même. On aligne l'API sur ce que la caisse montre déjà. Chez Soukara, un
 * ticket ne vit qu'un jour : l'écart n'était pas théorique.
 * ───────────────────────────────────────────────────────────────────── */
export function deciderValidationTicket(entree: {
  authentifie: boolean;
  profil: Profil;
  identifiantDemande: unknown;
  ticket: { id: string; status?: string | null; game_id?: string | null; created_at?: string | null } | null;
  jeu: { id: string; restaurant_id?: string | null; validity_days?: number | null } | null;
  maintenant: Date;
}): Verdict {
  const identite = identifier(entree.authentifie, entree.profil, ROLES_VALIDATION);
  if (!identite.ok) return identite;

  const id = entree.identifiantDemande;
  if (typeof id !== "string" || !UUID.test(id))
    return refus(400, "IDENTIFIANT_INVALIDE", "Identifiant manquant ou mal formé.");

  if (!entree.ticket) return refus(404, "TICKET_INTROUVABLE", "Ticket introuvable");
  if (!entree.jeu) return refus(404, "JEU_INTROUVABLE", "Jeu introuvable pour ce ticket");

  const profil = entree.profil!;
  if (profil.role !== "root") {
    if (!profil.restaurant_id || profil.restaurant_id !== entree.jeu.restaurant_id)
      return refus(403, "AUTRE_RESTAURANT", "Ce ticket ne correspond pas à votre restaurant");
  }

  if (entree.ticket.status === "redeemed")
    return refus(409, "DEJA_CONSOMME", "Ce ticket a déjà été utilisé.");
  if (entree.ticket.status !== "available")
    return refus(409, "STATUT_INCOMPATIBLE", "L'état de ce ticket ne permet pas la validation.");

  /* validity_days = 0 signifie « sans limite » : c'est la convention déjà
     appliquée à l'écran (app/verify/[id]/page.tsx), on ne l'invente pas ici. */
  const jours = entree.jeu.validity_days ?? 0;
  if (jours > 0 && entree.ticket.created_at) {
    const echeance = new Date(new Date(entree.ticket.created_at).getTime() + jours * 86400000);
    if (entree.maintenant > echeance)
      return refus(410, "TICKET_EXPIRE", `Ticket expiré le ${echeance.toLocaleDateString("fr-FR")}.`);
  }

  return { ok: true };
}
