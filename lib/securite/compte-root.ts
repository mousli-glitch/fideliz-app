/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LE COMPTE ROOT — cherché, jamais écrit en dur
 * ═══════════════════════════════════════════════════════════════════════
 *
 * L'identifiant du root était recopié dans trois fichiers, sous le nom
 * `ROOT_ID`. Deux usages s'y mélangeaient, et ils n'ont rien à voir :
 *
 *   AUTORISATION — « cette personne a le droit ». Se corrige par le RÔLE.
 *                  Un droit attaché à une identité s'éteint le jour où le
 *                  compte change, et rend le parcours root intestable avec
 *                  un compte synthétique.
 *
 *   VALEUR        — « les restaurants orphelins reviennent à ce compte ».
 *                  Ici l'identifiant ne donne aucun droit, il désigne un
 *                  destinataire. Se corrige par une RECHERCHE.
 *
 * Ce module ne couvre que le second cas. Pour le premier, la garde de rôle
 * existe déjà : `lib/securite/garde-action.ts`.
 */

/*
 * ─── `idDuCompteRoot` A ÉTÉ RETIRÉ LE 19/08/2026 ───
 *
 * Il rendait `null` AUSSI BIEN pour « aucun root » que pour « lecture
 * impossible » — son `error` n'était même pas déstructuré. Son seul
 * appelant, `repairOrphansAction`, transmettait ce `null` à un `update`
 * mené à la clé de service : une simple panne de lecture écrivait donc
 * `user_id = null` sur les restaurants concernés, puis retournait un
 * succès. Un résolveur qui confond « je ne sais pas » et « il n'y en a
 * pas » n'est pas réparable par un test : il fallait le supprimer.
 *
 * Un SEUL résolveur subsiste désormais côté application :
 * `lib/securite/root.ts::resoudreRootHeritier()`, qui rend un résultat
 * discriminé (`ok` / `aucun_root` / `erreur_lecture`) et porte le
 * départage `created_at, id`. Trois résolveurs coexistaient, c'était
 * déjà deux de trop.
 */

/**
 * Ce compte est-il protégé contre la suppression ?
 *
 * La question n'est plus « est-ce CETTE personne » mais « est-ce un root ».
 * Un second root créé demain sera protégé sans qu'on ait à y penser.
 */
export function estCompteProtege(role: string | null | undefined): boolean {
  return role === "root";
}
