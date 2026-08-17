import { timingSafeEqual } from "node:crypto";

/*
 * Comparaison du secret de cron, à temps constant.
 *
 * Les trois routes `/api/cron/*` comparaient le secret avec `!==`. Cet
 * opérateur s'arrête au premier caractère qui diffère, et cette durée se
 * mesure : en répétant l'appel, on retrouve le secret caractère par
 * caractère. C'est lent, bruyant, et parfaitement faisable sur un endpoint
 * public qui répond en quelques millisecondes.
 *
 * Deux formes sont acceptées, comme avant : `Authorization: Bearer <secret>`
 * — celle que Vercel Cron envoie — et `x-cron-secret: <secret>`.
 *
 * Rien de ce qui touche au secret ne part au journal : ni celui reçu, ni
 * celui attendu, ni leur longueur.
 */
function egal(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni, "utf8");
  const b = Buffer.from(attendu, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function cronAutorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false; // pas de secret configuré : personne ne passe

  const entete = requete.headers.get("authorization") ?? "";
  const direct = requete.headers.get("x-cron-secret") ?? "";

  const porteur = entete.startsWith("Bearer ") ? entete.slice(7) : "";

  return (porteur !== "" && egal(porteur, attendu)) || (direct !== "" && egal(direct, attendu));
}
