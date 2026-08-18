import "server-only";
import { exigerRestaurantParSlug } from "@/lib/securite/garde-action";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LA GARDE DES PAGES D'ADMINISTRATION D'UN RESTAURANT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ─── Ce qu'elle répare ───
 *
 * Trois pages serveur lisaient avec la clé de service — qui contourne la RLS
 * par construction — puis résolvaient le restaurant par le SLUG DE L'URL,
 * sans jamais vérifier à qui il appartient.
 *
 * Mesuré le 18/08 avec trois sessions réelles sur la page d'un autre tenant :
 * restaurateur A, root, et un compte sans aucun rattachement obtenaient la
 * même page, octet pour octet, même empreinte SHA. `/customers` livrait les
 * contacts clients. Et les slugs ne sont pas des secrets : ils sont imprimés
 * sur les QR codes.
 *
 * ─── Pourquoi la garde va ICI et pas dans le middleware ───
 *
 * Le middleware contrôle déjà la session, le compte actif, le blocage et le
 * rôle. Il ne suffit pas, pour deux raisons.
 *
 * D'abord parce qu'il ne comparait pas le slug au rattachement — c'est le
 * défaut. Ensuite, et c'est plus important : sous Next.js, une page et ses
 * composants serveur sont évalués indépendamment. Une garde posée uniquement
 * en amont laisse chaque chargeur libre de lire ce qu'il veut si on l'appelle
 * autrement. La règle sûre est que **le chemin qui lit soit le chemin qui
 * autorise**, et qu'il ne reçoive jamais un slug brut non vérifié.
 *
 * D'où la forme retenue : cette fonction ne rend pas un booléen, elle rend
 * l'IDENTIFIANT DU RESTAURANT AUTORISÉ. Une page qui l'appelle ne peut pas
 * oublier de s'en servir : c'est sa seule source pour interroger la base.
 *
 * ─── Ce qu'elle ne révèle pas ───
 *
 * `exigerRestaurantParSlug` distingue « introuvable » de « pas le vôtre ».
 * Utile dans une action, dangereux dans une page : la différence dirait à un
 * curieux quels slugs existent. On rend donc un refus unique et muet.
 *
 * ─── Le cas du commercial ───
 *
 * Il n'est pas dans la liste des rôles. Le middleware le renvoie déjà hors de
 * `/admin`, mais un garde qui dépend d'un autre garde n'en est pas un. Le
 * dashboard restaurateur et les contacts clients ne le concernent pas : la
 * matrice du 18/08 a confirmé qu'il ne voit aucun contact, et cette page ne
 * doit pas lui en ouvrir par la bande.
 */

export type AccesRestaurant =
  | { autorise: true; restaurantId: string; slug: string }
  | { autorise: false };

/** Rôles admis sur le tableau de bord d'un restaurant. Jamais `sales`. */
const ROLES_DASHBOARD = ["root", "restaurant"] as const;

/**
 * Autorise l'utilisateur de la SESSION sur le restaurant désigné par le slug,
 * et rend son identifiant. À appeler **avant toute lecture** de données.
 *
 * L'utilisateur vient de `auth.getUser()` côté serveur, jamais d'un paramètre :
 * aucun appelant ne peut se faire passer pour un autre.
 */
export async function autoriserRestaurant(
  slug: string,
  action: string,
): Promise<AccesRestaurant> {
  const garde = await exigerRestaurantParSlug(slug, ROLES_DASHBOARD, action);
  if (!garde.ok || !garde.restaurant) return { autorise: false };
  return {
    autorise: true,
    restaurantId: garde.restaurant.id,
    slug: garde.restaurant.slug,
  };
}
