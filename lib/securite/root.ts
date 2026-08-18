import "server-only";
import { createClient } from "@supabase/supabase-js";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  QUI EST ROOT — résolu, jamais codé en dur
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trois fichiers portaient l'UUID du compte root en constante, sous deux
 * natures qu'il fallait distinguer :
 *
 *   — dans la page de vérification de ticket, il servait de CONTRÔLE
 *     D'AUTORISATION. Mesuré : ce compte porte déjà `role = 'root'`, déjà
 *     présent dans les rôles autorisés. La clause était strictement
 *     redondante. Retirée, pas remplacée.
 *
 *   — dans les deux actions de suppression, il désigne l'HÉRITIER des
 *     restaurants d'un commercial supprimé. Aucune session n'intervient dans
 *     le choix d'un héritier : ce n'est pas une autorisation, c'est une règle
 *     d'attribution. Ce qu'il fallait, c'est cesser de figer QUI est root.
 *
 * ─── La règle, alignée sur ce qui est DÉPLOYÉ ───
 *
 * La fonction Postgres `handle_deleted_commercial` en production choisit
 * « le root le plus ancien », SANS filtre sur `is_active` — vérifié sur la
 * base, pas supposé.
 *
 * Une version antérieure de ce fichier filtrait sur `is_active` et prétendait
 * appliquer « la même règle ». C'était faux : deux règles différentes des deux
 * côtés auraient pu désigner deux héritiers différents pour un même événement.
 * On s'aligne donc sur la règle réellement déployée.
 *
 * Si le filtre `is_active` est souhaité, c'est une modification de règle : elle
 * doit se faire des DEUX côtés, dans une couche séparée, avec sa preuve et son
 * rollback. Pas ici.
 *
 * ─── Échouer fermé ───
 *
 * Une erreur de lecture n'est pas « aucun root ». Confondre les deux ferait
 * attribuer des restaurants au hasard le jour où la base hoquette. Les deux
 * cas refusent, avec des causes distinctes.
 */

export type Heritier =
  | { ok: true; rootId: string }
  | { ok: false; cause: "aucun_root" | "erreur_lecture" };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Rend le compte root qui hérite des restaurants orphelins.
 *
 * L'ordre est totalement déterministe : `created_at` puis `id` en cas
 * d'égalité. Deux comptes créés dans la même milliseconde désigneraient sinon
 * un héritier différent d'un appel à l'autre.
 */
export async function resoudreRootHeritier(): Promise<Heritier> {
  const { data, error } = await admin()
    .from("profiles")
    .select("id")
    .eq("role", "root")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  if (error) return { ok: false, cause: "erreur_lecture" };

  const ligne = (data as { id: string }[] | null)?.[0];
  if (!ligne) return { ok: false, cause: "aucun_root" };

  return { ok: true, rootId: ligne.id };
}

/*
 * ─── LIRE LE PROFIL DE LA CIBLE : QUATRE ISSUES, PAS DEUX ───
 *
 * `cibleEstProtegee()` replie quatre situations distinctes sur un booléen.
 * C'est ce qu'il faut pour une garde — dans le doute, on refuse — mais c'est
 * exactement ce qui bloquait la CONVERGENCE d'une suppression reprise :
 * « profil absent » y devient « protégé », donc un refus définitif, alors
 * qu'un profil absent peut signifier que la suppression a DÉJÀ abouti.
 *
 * L'appelant qui a besoin de distinguer lit donc l'état brut ; celui qui
 * veut seulement une autorisation garde le booléen, construit dessus, avec
 * exactement le même comportement qu'avant.
 */
export type LectureRole =
  | { etat: "present"; role: string }
  | { etat: "absent" }
  | { etat: "ambigu" }
  | { etat: "erreur" };

export async function lireRoleCible(userId: string): Promise<LectureRole> {
  if (!userId) return { etat: "erreur" };

  const { data, error } = await admin()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .limit(2);

  if (error) return { etat: "erreur" };
  const lignes = (data as { role: string }[] | null) ?? [];
  if (lignes.length === 0) return { etat: "absent" };
  if (lignes.length > 1) return { etat: "ambigu" };
  return { etat: "present", role: lignes[0].role };
}

/**
 * Le compte visé est-il un super-admin ? Protège la suppression.
 *
 * Rend `true` si la cible EST root, mais aussi si son profil est introuvable
 * ou illisible : dans le doute, on refuse de supprimer. Un compte qu'on ne
 * sait pas lire n'est pas un compte qu'on peut supprimer sans risque.
 */
export async function cibleEstProtegee(userId: string): Promise<boolean> {
  const lecture = await lireRoleCible(userId);
  if (lecture.etat !== "present") return true;  // absent, ambigu, illisible → on refuse
  return lecture.role === "root";
}
