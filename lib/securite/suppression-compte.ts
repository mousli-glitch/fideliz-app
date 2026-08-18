import "server-only";
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

export type ResultatSuppression = { success: true } | { success: false; error: string };

type ClientAdmin = {
  from: (table: string) => any;
  auth: { admin: { deleteUser: (id: string) => Promise<{ error: { message: string } | null }> } };
};

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

  // 4. Portefeuille commercial (pas de FK côté commercial).
  const { error: ePortefeuille } = await admin
    .from("sales_restaurants").delete().eq("sales_user_id", userId);
  if (ePortefeuille) return { success: false, error: "Nettoyage du portefeuille échoué : " + ePortefeuille.message };

  // 5. Suppression Auth. Le profil part par cascade — volontairement, pour
  //    que l'action reste rejouable si cet appel échoue.
  const { error: eAuth } = await admin.auth.admin.deleteUser(userId);
  if (eAuth) return { success: false, error: eAuth.message };

  return { success: true };
}
