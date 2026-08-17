"use server";

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { exigerRestaurantParSlug } from "./garde-action";
import { journaliser } from "./journal";

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  DEUX CHEMINS D'AUTORISATION, JAMAIS UNE CONDITION FLOUE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Les actions Google servent deux appelants qui n'ont rien en commun :
 *
 *   · le tableau de bord — un gérant connecté règle ses réponses
 *     automatiques ou publie une réponse à un avis ;
 *   · deux crons — la synchronisation nocturne des avis et les réponses
 *     automatiques, qui tournent sans aucun utilisateur.
 *
 * La tentation serait d'écrire « s'il y a une session, on vérifie le rôle,
 * sinon c'est sûrement le cron ». Ce serait ouvrir la porte à tout appel
 * anonyme : l'absence de preuve deviendrait la preuve.
 *
 * Ici, l'appelant DÉCLARE lequel il est, et doit le prouver. Sans
 * déclaration recevable, c'est non. Un utilisateur connecté ne peut pas se
 * faire passer pour le cron : il lui manque le secret. Le cron n'a besoin
 * d'aucune session.
 *
 * La comparaison du secret est à temps constant : un `!==` sur des chaînes
 * s'arrête au premier caractère différent, et cette durée se mesure.
 */

export type Appel = "session" | { cron: string };

export type Autorisation = { ok: true; via: "session" | "cron" } | { ok: false; error: string };

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Comparaison à temps constant. Les longueurs différentes sortent tout de suite — c'est une fuite d'un bit, sans valeur. */
function memeSecret(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni, "utf8");
  const b = Buffer.from(attendu, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Autorise une action Google sur un restaurant donné.
 *
 * `restaurantId` doit être l'identifiant du restaurant visé : le chemin
 * session vérifie qu'il appartient bien à l'appelant, le chemin cron se
 * contente du secret — un cron traite tous les restaurants, c'est son
 * office.
 */
export async function autoriserGoogle(
  restaurantId: string | null | undefined,
  appel: Appel,
  action: string
): Promise<Autorisation> {
  // ─── Chemin 2 : appel interne d'un cron ───
  if (typeof appel === "object" && appel !== null && "cron" in appel) {
    const attendu = process.env.CRON_SECRET;
    if (!attendu) return { ok: false, error: "Cron non configuré." };
    if (typeof appel.cron !== "string" || !memeSecret(appel.cron, attendu)) {
      /* Jamais le secret, ni celui reçu, ni celui attendu — un journal se
         relit, se copie et s'exporte. */
      await journaliser(admin(), {
        action: `${action}.refus`,
        accepte: false,
        message: "Refusé : SECRET_CRON_INVALIDE",
        restaurantId: restaurantId ?? null,
        details: { motif: "SECRET_CRON_INVALIDE", action },
      });
      return { ok: false, error: "Accès refusé." };
    }
    return { ok: true, via: "cron" };
  }

  // ─── Chemin 1 : session du tableau de bord ───
  if (appel !== "session") return { ok: false, error: "Accès refusé." };

  const g = await exigerRestaurantParSlug(restaurantId, ["restaurant", "root"], action);
  if (!g.ok) return { ok: false, error: g.error };
  return { ok: true, via: "session" };
}
