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

import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Le client attendu est celui à clé de service. On garde le type réel de la
 * bibliothèque plutôt qu'une forme écrite à la main : un type maison finit
 * toujours par diverger du client, et c'est le compilateur qui le découvre.
 */
type ClientAdmin = SupabaseClient<any, any, any, any, any>;

/**
 * L'identifiant du compte root, ou `null` s'il n'en existe aucun.
 *
 * `order by created_at, id` rend la réponse TOTALEMENT déterministe s'il en
 * existait plusieurs. Le `null` n'est pas un cas d'erreur : il produit des
 * lignes orphelines, exactement ce que faisait déjà l'UUID en dur le jour où
 * il pointait vers un compte supprimé — en moins silencieux.
 *
 * ⚠ Exige un client à clé de service : la RLS de `profiles` ne montre à
 * personne le profil d'un autre, root compris.
 *
 * ─── LE DÉPARTAGE `id`, AJOUTÉ LE 19/08/2026 ───
 *
 * `created_at` seul ne départage pas deux comptes créés dans la même
 * milliseconde : PostgreSQL rend alors une ligne arbitraire, et deux appels
 * successifs peuvent désigner deux héritiers différents. Trois résolveurs
 * coexistaient dans le système — cette fonction, `lib/securite/root.ts`, et
 * le trigger Postgres `handle_deleted_commercial()` — dont deux seulement
 * portaient le départage. Les trois appliquent désormais EXACTEMENT
 * `created_at ASC, id ASC` (migration `20260819000000_heritier_ordre_total.sql`
 * pour le côté SQL). Aucun filtre `is_active` d'aucun côté : ce serait un
 * changement de règle, pas un alignement.
 */
export async function idDuCompteRoot(admin: ClientAdmin): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "root")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Ce compte est-il protégé contre la suppression ?
 *
 * La question n'est plus « est-ce CETTE personne » mais « est-ce un root ».
 * Un second root créé demain sera protégé sans qu'on ait à y penser.
 */
export function estCompteProtege(role: string | null | undefined): boolean {
  return role === "root";
}
