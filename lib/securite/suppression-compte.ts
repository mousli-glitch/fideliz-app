import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resoudreRootHeritier, cibleEstProtegee } from "./root";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SUPPRIMER UN COMPTE SANS EMPORTER UN RESTAURANT AVEC LUI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `masterDeleteUser` et `deleteSalesUserAction` répétaient presque à
 * l'identique la même séquence. Deux copies, c'est deux endroits où un
 * correctif futur peut n'être appliqué qu'une fois. La séquence vit
 * désormais ici, en un seul exemplaire.
 *
 * ─── P0 : LA CASCADE POUVAIT DÉTRUIRE UN RESTAURANT ENTIER ───
 *
 * Inventaire des clés étrangères relevé sur la base (19/08/2026), pas
 * supposé :
 *
 *   public.restaurants.user_id    -> auth.users(id)  ON DELETE CASCADE
 *   public.restaurants.owner_id   -> auth.users(id)  NO ACTION
 *   public.restaurants.created_by -> public.profiles ON DELETE SET NULL
 *   public.profiles.id            -> auth.users(id)  ON DELETE CASCADE
 *
 * Et ce que `restaurants` entraîne à son tour, toujours en CASCADE :
 * `games`, `contacts`, `avis`, `sales_restaurants`, `activity_logs_legacy`.
 *
 * Les deux actions réattribuaient `created_by` et `owner_id`, JAMAIS
 * `user_id`. Si la cible figurait dans cette troisième colonne,
 * `auth.admin.deleteUser()` supprimait donc le restaurant en cascade — puis
 * ses jeux, ses clients, ses avis. Le commentaire « on conserve le
 * propriétaire réel » ne protégeait pas ce lien-là.
 *
 * `user_id` est traité comme une colonne de propriété par le seul code qui
 * l'écrit (`repairOrphansAction` la pose avec `owner_id`). On la réattribue
 * donc à l'héritier, exactement comme `owner_id`.
 *
 * ─── P0 : LE REJEU APRÈS ÉCHEC AUTH ÉTAIT IMPOSSIBLE ───
 *
 * L'ancienne séquence supprimait le profil PUIS le compte Auth. Si l'appel
 * Auth échouait, le profil était déjà parti — et au rejeu,
 * `cibleEstProtegee()` traite (à raison) un profil absent comme protégé et
 * refuse. La suppression ne pouvait plus être terminée : un compte Auth
 * orphelin, indéfiniment.
 *
 * Corrigé en s'appuyant sur `profiles_id_fkey ON DELETE CASCADE` : on ne
 * supprime plus le profil explicitement, c'est la suppression Auth qui
 * l'emporte. Échec Auth => le profil est toujours là => l'action reste
 * rejouable et converge vers le même état final.
 *
 * Le trigger `tr_on_commercial_deleted` (BEFORE DELETE sur `profiles`,
 * vérifié) se déclenche bien par cette cascade. Comme les réattributions
 * ont déjà eu lieu, son propre `update` ne trouve aucune ligne — et s'il
 * n'existait aucun root, il refuserait (`P0102`), ce qui ferait échouer la
 * suppression sans rien détruire. Fail-closed de bout en bout.
 */

export type ResultatSuppression =
  | { success: true }
  | { success: false; error: string; ambigu?: false }
  /*
   * État distinct, et non un échec ordinaire : l'appel Auth a échoué ET la
   * relecture d'existence n'a pas pu trancher. On ne sait donc pas si le
   * compte a été supprimé. Aucune destruction supplémentaire n'est tentée,
   * et l'appelant doit traiter ce cas comme « à reprendre », pas comme
   * « rien ne s'est passé ».
   */
  | { success: false; error: string; ambigu: true; etat: "AUTH_OUTCOME_AMBIGUOUS" };

/*
 * Le vrai type de la bibliotheque, pas une forme ecrite a la main : un type
 * maison finit toujours par diverger du client, et c'est un `as any` au
 * point d'appel qui masque alors la divergence. Les deux actions passent
 * desormais leur client sans aucun cast.
 */
type ClientAdmin = SupabaseClient<any, any, any, any, any>;

/**
 * Supprime un compte : réattribue tout ce qui pend, puis laisse la
 * suppression Auth emporter le profil par cascade.
 *
 * Chaque étape vérifie son erreur et s'arrête AVANT l'étape destructive
 * suivante. Aucune transaction n'est possible — `auth.admin.deleteUser` est
 * un appel d'API, hors de la transaction SQL — d'où l'ordre : du réversible
 * vers l'irréversible, et des étapes idempotentes pour que le rejeu
 * converge.
 */
export async function supprimerCompteEtReattribuer(
  admin: ClientAdmin,
  userId: string,
): Promise<ResultatSuppression> {
  if (!userId) return { success: false, error: "ID utilisateur manquant." };

  // 🔒 Ne jamais supprimer un super-admin. Refuse aussi si le profil est
  // absent ou ambigu : un compte qu'on ne sait pas lire ne se supprime pas.
  if (await cibleEstProtegee(userId)) {
    return { success: false, error: "Ce compte super-admin est protégé." };
  }

  const heritier = await resoudreRootHeritier();
  if (!heritier.ok) {
    return {
      success: false,
      error:
        heritier.cause === "aucun_root"
          ? "Aucun compte root : réattribution impossible."
          : "Lecture des profils impossible : réattribution annulée.",
    };
  }
  const root = heritier.rootId;

  // 1. Restaurants APPORTÉS par la cible -> créateur = root.
  const { error: eCreateur } = await admin
    .from("restaurants").update({ created_by: root }).eq("created_by", userId);
  if (eCreateur) return { success: false, error: "Réattribution (créateur) échouée : " + eCreateur.message };

  // 2. Restaurants POSSÉDÉS par la cible -> propriété au root.
  const { error: eProprietaire } = await admin
    .from("restaurants").update({ owner_id: root }).eq("owner_id", userId);
  if (eProprietaire) return { success: false, error: "Réattribution (propriétaire) échouée : " + eProprietaire.message };

  // 3. LE LIEN QUI CASCADE. Sans cette réattribution, la suppression Auth
  //    détruirait le restaurant et tout ce qui en dépend.
  const { error: eUserId } = await admin
    .from("restaurants").update({ user_id: root }).eq("user_id", userId);
  if (eUserId) return { success: false, error: "Réattribution (user_id) échouée : " + eUserId.message };

  /*
   * 4. Portefeuille commercial.
   *
   * Le commentaire d'origine affirmait « pas de FK côté commercial ».
   * C'est FAUX, mesuré sur la base le 19/08/2026 :
   * `sales_restaurants.sales_user_id -> auth.users(id) ON DELETE CASCADE`.
   * La suppression Auth emporterait donc ces lignes de toute façon. On les
   * retire quand même explicitement, en amont : une étape vérifiable qui
   * échoue AVANT l'irréversible vaut mieux qu'un effet de bord implicite —
   * et si la cascade disparaissait un jour, ce nettoyage resterait juste.
   */
  const { error: ePortefeuille } = await admin
    .from("sales_restaurants").delete().eq("sales_user_id", userId);
  if (ePortefeuille) return { success: false, error: "Nettoyage du portefeuille échoué : " + ePortefeuille.message };

  /*
   * 5. Suppression Auth. Le profil part par cascade — volontairement, pour
   *    que l'action reste rejouable si cet appel échoue.
   *
   * ─── L'ERREUR NE PROUVE PAS L'ABSENCE DE SUPPRESSION ───
   *
   * Signalé le 19/08/2026, et c'est juste : une erreur rendue par
   * `deleteUser` peut suivre une suppression RÉUSSIE côté serveur (coupure
   * réseau sur la réponse, délai dépassé). Conclure « erreur donc rien
   * n'a été supprimé » serait une supposition, pas une observation — et
   * dans ce cas le profil a déjà disparu par cascade, donc un rejeu
   * naïf refuserait (profil absent = protégé) et la suppression resterait
   * inachevée pour toujours.
   *
   * On ne suppose donc rien : on RELIT l'existence du compte, de façon
   * autoritative et bornée, et on distingue trois issues.
   */
  const { error: eAuth } = await admin.auth.admin.deleteUser(userId);
  if (!eAuth) return { success: true };

  const verdict = await relireExistenceAuth(admin, userId);

  if (verdict === "absent") {
    // Le serveur avait réussi ; l'erreur portait sur la réponse, pas sur
    // l'effet. L'état final visé est atteint : succès idempotent.
    return { success: true };
  }
  if (verdict === "present") {
    // Rien n'a été supprimé : échec franc, et l'action reste rejouable
    // puisque le profil est intact.
    return { success: false, error: eAuth.message };
  }
  return {
    success: false,
    ambigu: true,
    etat: "AUTH_OUTCOME_AMBIGUOUS",
    error:
      "Suppression Auth au résultat indéterminé : la relecture d'existence a elle-même échoué. " +
      "Aucune autre destruction n'a été tentée. Vérifier l'état du compte avant de rejouer.",
  };
}

/*
 * Relecture autoritative de l'existence d'un compte Auth.
 *
 * `getUserById` est la lecture officielle du SDK admin. Trois issues, et
 * l'indéterminé n'est pas replié sur l'un des deux autres :
 *
 *   "absent"      — le compte n'existe plus (la suppression avait abouti) ;
 *   "present"     — il existe encore (la suppression n'a rien fait) ;
 *   "indetermine" — la lecture elle-même a échoué : on ne sait pas.
 *
 * Le SDK signale l'absence par une erreur, pas par un `data` vide : on
 * distingue donc « erreur qui signifie absent » (statut 404, ou message
 * explicite) de « erreur de transport ». Une erreur non reconnue tombe
 * délibérément dans "indetermine" — jamais dans "absent", qui autoriserait
 * à conclure au succès sur une panne.
 */
async function relireExistenceAuth(
  admin: ClientAdmin,
  userId: string,
): Promise<"absent" | "present" | "indetermine"> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error) return data?.user ? "present" : "absent";

    const statut = (error as { status?: number }).status;
    if (statut === 404) return "absent";
    if (/not.?found/i.test(error.message ?? "")) return "absent";
    return "indetermine";
  } catch {
    return "indetermine";
  }
}
