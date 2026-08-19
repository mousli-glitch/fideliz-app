import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resoudreRootHeritier, lireRoleCible } from "./root";

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
 *
 * ─── P0 : LE REJEU NE CONVERGEAIT TOUJOURS PAS DANS UN CAS ───
 *
 * Signalé le 19/08/2026, et c'était juste. J'avais écrit au tour précédent
 * que « la relecture couvre les trois cas mesurables » : c'était FAUX pour
 * celui-ci.
 *
 * La correction ci-dessus rend le rejeu possible quand `deleteUser` échoue
 * VRAIMENT (profil intact). Elle ne le rend pas possible quand `deleteUser`
 * réussit côté serveur, rend quand même une erreur, ET que la relecture
 * échoue elle aussi. Le profil est alors parti par cascade, l'issue est
 * `AUTH_OUTCOME_AMBIGUOUS` — et au SECOND appel, la première ligne du code
 * (`cibleEstProtegee`, qui traite un profil absent comme protégé) refusait
 * avant même de regarder Auth. L'opération ne convergeait jamais.
 *
 * D'où le PRÉFLIGHT ci-dessous : quand le profil est absent, on ne conclut
 * plus « protégé » sans avoir demandé à Auth. Quatre issues, aucune repliée
 * sur une autre :
 *
 *   profil présent, rôle root ......... refus (protection inchangée)
 *   profil présent, autre rôle ........ on procède
 *   profil absent + Auth absent ....... état visé DÉJÀ atteint : succès
 *                                       idempotent, AUCUNE mutation
 *   profil absent + Auth présent ...... refus : compte orphelin, on ne sait
 *                                       plus prouver qu'il n'est pas root
 *   profil absent + Auth indéterminé .. refus
 *   profil ambigu ou illisible ........ refus
 *
 * Seule la troisième ligne est nouvelle, et c'est exactement celle que la
 * séquence peut produire elle-même. Les autres restent fermées.
 *
 * Réserve honnête : dans ce cas de convergence, `restaurants.created_by`
 * pointait vers `public.profiles` en ON DELETE SET NULL — la cascade a donc
 * mis ces lignes à NULL avant qu'on puisse les réattribuer. Ce n'est pas une
 * destruction (le restaurant et ses données sont intacts) mais un
 * rattachement perdu, que `repairOrphansAction` sait recoller. On ne
 * prétend pas ici que l'état est parfait : on prétend qu'il est atteint et
 * qu'aucune donnée n'a été détruite.
 */

/*
 * Borne d'attente de la relecture d'existence.
 *
 * Ce que cette borne fait, exactement : elle empêche la primitive de rester
 * suspendue indéfiniment sur une réponse qui ne vient pas, et fait tomber ce
 * cas dans "indetermine" — donc dans le refus. Ce qu'elle NE fait PAS :
 * annuler la requête HTTP. `GoTrueAdminApi.getUserById` n'accepte pas de
 * signal d'annulation dans la version installée (auth-js 2.89.0, vérifié) ;
 * la requête peut donc aboutir après coup, sans effet — c'est une lecture.
 * Le commentaire précédent disait « bornée » sans que rien ne le borne.
 */
const DELAI_RELECTURE_MS = 8_000;

export type ResultatSuppression =
  /*
   * `idempotent` : l'état visé était DÉJÀ atteint, aucune mutation n'a été
   * tentée. L'appelant qui veut distinguer « j'ai supprimé » de « c'était
   * déjà fait » le peut ; celui qui n'en a pas besoin lit `success` comme
   * avant.
   */
  | { success: true; idempotent?: boolean; avertissement?: string }
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
  demandeur?: string | null,
): Promise<ResultatSuppression> {
  if (!userId) return { success: false, error: "ID utilisateur manquant." };

  /*
   * ── PRÉFLIGHT ──────────────────────────────────────────────────────────
   *
   * 🔒 Ne jamais supprimer un super-admin. Refuse aussi si le profil est
   * ambigu ou illisible : un compte qu'on ne sait pas lire ne se supprime
   * pas.
   *
   * Le cas « absent » est le seul qui ne se conclut plus tout seul : il
   * demande à Auth avant de trancher, sinon un second appel légitime reste
   * bloqué pour toujours (voir l'en-tête).
   */
  const profil = await lireRoleCible(userId);

  if (profil.etat === "erreur") {
    return { success: false, error: "Lecture du profil de la cible impossible : suppression annulée." };
  }
  if (profil.etat === "ambigu") {
    return { success: false, error: "Profil de la cible ambigu : suppression annulée." };
  }
  if (profil.etat === "absent") {
    const dejaFait = await relireExistenceAuth(admin, userId);
    if (dejaFait === "absent") {
      // Profil ET compte Auth absents : l'état visé est atteint. On ne
      // tente RIEN — pas de réattribution, pas de suppression.
      return { success: true, idempotent: true };
    }
    if (dejaFait === "present") {
      return {
        success: false,
        error:
          "Compte Auth sans profil : impossible de prouver qu'il n'est pas un super-admin. " +
          "Suppression refusée — traiter cet orphelin explicitement.",
      };
    }
    return {
      success: false,
      ambigu: true,
      etat: "AUTH_OUTCOME_AMBIGUOUS",
      error:
        "Profil absent et existence du compte Auth indéterminée : suppression refusée. " +
        "Aucune mutation n'a été tentée.",
    };
  }
  if (profil.role === "root") {
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

  /*
   * 0. LA FENÊTRE. Voir `20260819020000_fenetre_de_suppression_compte.sql`.
   *
   * Poser le marqueur ne suffit pas : une transaction d'écriture déjà
   * ouverte, dont le trigger a lu le marqueur avant qu'il n'existe, pourrait
   * committer un rattachement APRÈS nos réattributions — et la cascade
   * l'emporterait. L'appel ci-dessous pose le marqueur ET prend un verrou
   * exclusif sur `restaurants` dans la même transaction : à sa sortie, les
   * écritures en vol sont terminées (donc visibles des réattributions) et
   * les suivantes voient le marqueur (donc sont refusées).
   *
   * L'échec est un refus : sans la fenêtre, l'ordre séquentiel de ce fichier
   * est la seule protection, et il n'en est pas une.
   */
  const { error: eFenetre } = await admin.rpc("ouvrir_fenetre_suppression", {
    p_user_id: userId,
    p_demandeur: demandeur ?? null,
  });
  if (eFenetre) {
    return {
      success: false,
      error:
        "Impossible d'ouvrir la fenêtre de suppression : " + eFenetre.message +
        " — aucune mutation n'a été tentée.",
    };
  }

  // Toute sortie après ce point referme la fenêtre, SAUF quand l'issue est
  // indéterminée : là, le marqueur doit rester, il protège un compte dont on
  // ne sait pas s'il va disparaître.
  const echouer = async (error: string): Promise<ResultatSuppression> => {
    await admin.rpc("fermer_fenetre_suppression", { p_user_id: userId });
    return { success: false, error };
  };

  /*
   * Sur succès, la fermeture ne doit pas transformer un compte supprimé en
   * échec — mais elle ne doit pas non plus disparaître en silence : un
   * marqueur resté en place interdit tout rattachement futur à cet
   * identifiant. On le dit.
   */
  const terminer = async (r: { success: true; idempotent?: boolean }): Promise<ResultatSuppression> => {
    const { error } = await admin.rpc("fermer_fenetre_suppression", { p_user_id: userId });
    if (!error) return r;
    return {
      ...r,
      avertissement:
        "Compte supprimé, mais la fenêtre de suppression n'a pas pu être refermée : " +
        error.message + " — retirer la ligne de `comptes_en_suppression` à la main.",
    };
  };

  // 1. Restaurants APPORTÉS par la cible -> créateur = root.
  const { error: eCreateur } = await admin
    .from("restaurants").update({ created_by: root }).eq("created_by", userId);
  if (eCreateur) return echouer("Réattribution (créateur) échouée : " + eCreateur.message);

  // 2. Restaurants POSSÉDÉS par la cible -> propriété au root.
  const { error: eProprietaire } = await admin
    .from("restaurants").update({ owner_id: root }).eq("owner_id", userId);
  if (eProprietaire) return echouer("Réattribution (propriétaire) échouée : " + eProprietaire.message);

  // 3. LE LIEN QUI CASCADE. Sans cette réattribution, la suppression Auth
  //    détruirait le restaurant et tout ce qui en dépend.
  const { error: eUserId } = await admin
    .from("restaurants").update({ user_id: root }).eq("user_id", userId);
  if (eUserId) return echouer("Réattribution (user_id) échouée : " + eUserId.message);

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
  if (ePortefeuille) return echouer("Nettoyage du portefeuille échoué : " + ePortefeuille.message);

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
  /*
   * 4bis. DERNIER CONTRÔLE AVANT L'IRRÉVERSIBLE.
   *
   * La fenêtre garantit qu'aucune référence nouvelle n'a pu apparaître. Ce
   * contrôle ne la remplace pas : il vérifie que les réattributions ont
   * effectivement vidé les trois colonnes. Une réattribution qui aurait
   * silencieusement porté sur zéro ligne — filtre erroné, colonne renommée —
   * ne se voit pas dans son `error`, elle se voit ici. Et ce qu'on y verrait,
   * ce serait un restaurant sur le point d'être détruit.
   */
  const { count: restant, error: eRestant } = await admin
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .or(`user_id.eq.${userId},owner_id.eq.${userId},created_by.eq.${userId}`);

  if (eRestant || restant === null || restant === undefined) {
    return echouer(
      "Impossible de vérifier qu'aucun restaurant ne dépend encore du compte : " +
        "suppression annulée avant l'irréversible.",
    );
  }
  if (restant > 0) {
    return echouer(
      `${restant} restaurant(s) référencent encore ce compte après réattribution : ` +
        "suppression annulée. La cascade en aurait détruit au moins un.",
    );
  }

  const { error: eAuth } = await admin.auth.admin.deleteUser(userId);
  if (!eAuth) return terminer({ success: true });

  const verdict = await relireExistenceAuth(admin, userId);

  if (verdict === "absent") {
    // Le serveur avait réussi ; l'erreur portait sur la réponse, pas sur
    // l'effet. L'état final visé est atteint : succès idempotent.
    return terminer({ success: true });
  }
  if (verdict === "present") {
    // Rien n'a été supprimé : échec franc, et l'action reste rejouable
    // puisque le profil est intact.
    return echouer(eAuth.message);
  }
  /*
   * Issue indéterminée : la fenêtre reste OUVERTE, délibérément. On ne sait
   * pas si le compte va disparaître ; rouvrir les rattachements maintenant
   * reviendrait à autoriser qu'on accroche un restaurant à un compte
   * peut-être condamné. Le marqueur se referme à la reprise.
   */
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
 * distingue donc « erreur qui signifie absent » d'une erreur de transport.
 * Une erreur non reconnue tombe délibérément dans "indetermine" — jamais
 * dans "absent", qui autoriserait à conclure au succès sur une panne.
 *
 * ─── CLASSER PAR CONTRAT, PAS PAR TEXTE ───
 *
 * La version précédente reconnaissait l'absence sur `/not.?found/i` appliqué
 * au MESSAGE. Le message d'une API n'est pas un contrat : il change de
 * formulation, il se traduit, il se reformate — et le jour où il change,
 * cette branche classe silencieusement un compte encore vivant en « absent »
 * ou l'inverse. Pire, le motif matcherait aussi `session_not_found` ou
 * `identity_not_found`, qui ne disent rien de l'existence du compte.
 *
 * `AuthApiError` porte un `code` typé (auth-js 2.89.0, vérifié dans
 * `lib/error-codes.d.ts` : `user_not_found` y figure nommément) et un
 * `status` HTTP. Ce sont les deux seuls signaux structurés, et ce sont les
 * deux seuls qu'on accepte. Le motif textuel est retiré, pas conservé « au
 * cas où » : une classification qui a deux sources dont une non fiable est
 * une classification non fiable.
 */
async function relireExistenceAuth(
  admin: ClientAdmin,
  userId: string,
): Promise<"absent" | "present" | "indetermine"> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const DEPASSEMENT = Symbol("delai");
    const borne = new Promise<typeof DEPASSEMENT>((resoudre) => {
      minuteur = setTimeout(() => resoudre(DEPASSEMENT), DELAI_RELECTURE_MS);
      // Ne pas retenir la boucle d'événements si la lecture répond d'abord.
      (minuteur as { unref?: () => void }).unref?.();
    });

    const issue = await Promise.race([admin.auth.admin.getUserById(userId), borne]);
    if (issue === DEPASSEMENT) return "indetermine";

    const { data, error } = issue as {
      data: { user?: unknown } | null;
      error: { status?: number; code?: string } | null;
    };
    if (!error) return data?.user ? "present" : "absent";

    if (error.code === "user_not_found") return "absent";
    if (error.status === 404) return "absent";
    return "indetermine";
  } catch {
    return "indetermine";
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}
