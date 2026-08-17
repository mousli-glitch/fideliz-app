"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/utils/supabase/server";
import { journaliser } from "./journal";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  LA GARDE D'UNE SERVER ACTION
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Aujourd'hui, aucune action d'administration n'est joignable par un
 * inconnu : son identifiant n'existe dans aucun bundle de page publique, et
 * le matcher du middleware couvre les routes qui le portent. C'est vrai, et
 * c'est vérifié à chaque build (scripts/surface-actions.mjs).
 *
 * Ce n'est pas suffisant.
 *
 * Cette protection tient à un graphe d'imports, pas à un contrôle. Le jour
 * où un composant partagé importera `set-subscription`, l'identifiant
 * entrera dans un bundle public et l'action deviendra joignable — sans
 * erreur, sans alerte, sans que rien ne change à l'écran. Un identifiant
 * de Server Action n'est pas une autorisation : c'est un nom.
 *
 * Et le matcher ne dit rien du PÉRIMÈTRE. Un restaurateur parfaitement
 * authentifié est derrière le middleware ; ça ne lui donne pas le droit de
 * supprimer le restaurant d'un confrère. C'est l'action, et elle seule, qui
 * sait quel objet elle touche.
 *
 * Donc : chaque action sensible se garde elle-même, ici, en une ligne.
 *
 *     const g = await exigerRole(["root"], "restaurant.suppression");
 *     if (!g.ok) return { success: false, error: g.error };
 *
 * Fail-closed : toute forme non prévue est un refus. Pas de session, pas de
 * profil, compte désactivé, rôle absent — non.
 */

const ROLES_CONNUS = ["root", "sales", "restaurant"] as const;

export type Appelant = {
  userId: string;
  email: string | null;
  role: (typeof ROLES_CONNUS)[number];
  restaurantId: string | null;
};

export type Garde = { ok: true; appelant: Appelant } | { ok: false; error: string };

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Exige une session dont le rôle figure parmi `roles`.
 *
 * `action` sert au journal : un refus anonyme n'y va pas — ils sont légion
 * et noieraient les seuls qui apprennent quelque chose, ceux d'un compte
 * identifié qui tente ce qu'il n'a pas le droit de faire.
 */
export async function exigerRole(roles: readonly string[], action: string): Promise<Garde> {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) return { ok: false, error: "Connexion requise." };

  const { data } = await admin()
    .from("profiles")
    .select("role, restaurant_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const p = data as { role?: string; restaurant_id?: string | null; is_active?: boolean } | null;

  const refuser = async (motif: string, message: string): Promise<Garde> => {
    await journaliser(admin(), {
      action: `${action}.refus`,
      accepte: false,
      message: `Refusé : ${motif}`,
      userId: user.id,
      userEmail: user.email,
      details: { motif, action },
    });
    return { ok: false, error: message };
  };

  if (!p) return refuser("PROFIL_INTROUVABLE", "Profil introuvable.");
  if (p.is_active === false) return refuser("COMPTE_DESACTIVE", "Compte désactivé.");
  if (!p.role || !ROLES_CONNUS.includes(p.role as never))
    return refuser("ROLE_INCONNU", "Accès refusé.");
  if (!roles.includes(p.role)) return refuser("ROLE_NON_AUTORISE", "Accès refusé.");

  return {
    ok: true,
    appelant: {
      userId: user.id,
      email: user.email ?? null,
      role: p.role as Appelant["role"],
      restaurantId: p.restaurant_id ?? null,
    },
  };
}

/**
 * Exige, en plus du rôle, que l'objet visé appartienne bien à l'appelant.
 *
 * Le root passe toutes les enseignes — c'est le seul qui le peut. Pour tout
 * autre, le restaurant visé doit être exactement le sien : c'est le contrôle
 * qui empêche un restaurateur authentifié d'agir chez son voisin, et c'est
 * celui qu'aucun middleware ne peut faire à sa place, puisqu'il dépend de
 * l'objet et pas de l'URL.
 */
export async function exigerRestaurant(
  restaurantId: string | null | undefined,
  roles: readonly string[],
  action: string
): Promise<Garde> {
  const g = await exigerRole(roles, action);
  if (!g.ok) return g;
  if (g.appelant.role === "root") return g;

  if (!restaurantId || !g.appelant.restaurantId || g.appelant.restaurantId !== restaurantId) {
    await journaliser(admin(), {
      action: `${action}.refus`,
      accepte: false,
      message: "Refusé : AUTRE_RESTAURANT",
      userId: g.appelant.userId,
      userEmail: g.appelant.email,
      details: { motif: "AUTRE_RESTAURANT", vise: restaurantId ?? null, action },
    });
    return { ok: false, error: "Ce restaurant n'est pas le vôtre." };
  }
  return g;
}

/**
 * Même contrôle, mais à partir du slug ou de l'identifiant que la page a
 * transmis.
 *
 * Plusieurs actions du tableau de bord reçoivent un `slug` depuis le
 * navigateur et s'en servent directement — c'est le paramètre d'URL de
 * /admin/[slug]/…, donc quelque chose que l'appelant écrit lui-même. Il
 * désigne un restaurant ; il ne prouve pas qu'on y a droit. On le résout
 * ici, puis on compare le restaurant obtenu à celui de la session.
 */
export async function exigerRestaurantParSlug(
  slugOuId: string | null | undefined,
  roles: readonly string[],
  action: string
): Promise<Garde & { restaurant?: { id: string; slug: string } }> {
  const g = await exigerRole(roles, action);
  if (!g.ok) return g;

  if (!slugOuId) return { ok: false, error: "Restaurant manquant." };

  const estUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOuId);
  const requete = admin().from("restaurants").select("id, slug");
  const { data } = await (estUuid ? requete.eq("id", slugOuId) : requete.eq("slug", slugOuId)).maybeSingle();
  const resto = data as { id: string; slug: string } | null;

  if (!resto) return { ok: false, error: "Restaurant introuvable." };

  if (g.appelant.role !== "root" && g.appelant.restaurantId !== resto.id) {
    await journaliser(admin(), {
      action: `${action}.refus`,
      accepte: false,
      message: "Refusé : AUTRE_RESTAURANT",
      userId: g.appelant.userId,
      userEmail: g.appelant.email,
      details: { motif: "AUTRE_RESTAURANT", vise: resto.id, action },
    });
    return { ok: false, error: "Ce restaurant n'est pas le vôtre." };
  }

  return { ...g, restaurant: resto };
}

/** Trace une action sensible acceptée. Le refus est déjà tracé par la garde. */
export async function tracerAction(
  appelant: Appelant,
  action: string,
  message: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  await journaliser(admin(), {
    action,
    accepte: true,
    message,
    userId: appelant.userId,
    userEmail: appelant.email,
    restaurantId: (details.restaurantId as string) ?? appelant.restaurantId,
    details,
  });
}
