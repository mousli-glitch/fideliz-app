/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — fenêtre de suppression de compte
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule intégralement `20260819020000_fenetre_de_suppression_compte.sql` :
 * le trigger, sa fonction, les deux fonctions de fenêtre, la table marqueur.
 *
 * ─── CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * La course décrite dans l'en-tête de la migration : une transaction déjà
 * ouverte peut committer un rattachement vers un compte en cours de
 * suppression, entre les réattributions et l'appel Auth, et la cascade
 * l'emporte. Ce n'est pas atteignable par le code d'aujourd'hui — c'était
 * mesuré au moment de la migration — mais plus rien ne l'empêche.
 *
 * Le code appelle `ouvrir_fenetre_suppression` : après ce rollback, il
 * refusera d'ouvrir la fenêtre et s'arrêtera AVANT toute mutation. Aucune
 * suppression de compte ne passera plus. Reculer le code dans le même
 * mouvement, ou ne pas jouer ce rollback.
 *
 * ─── FENÊTRES RESTÉES OUVERTES ───
 *
 * Une ligne dans `comptes_en_suppression` signale une séquence commencée et
 * pas terminée. Le script refuse s'il en reste : retirer le marqueur, ce
 * serait rouvrir silencieusement les rattachements vers un compte qu'on est
 * en train de détruire.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare
  v_ouvertes int;
begin
  if to_regclass('public.comptes_en_suppression') is null then
    raise notice 'ROLLBACK : la table n''existe pas — rien à annuler.';
    return;
  end if;

  select count(*) into v_ouvertes from public.comptes_en_suppression;

  if v_ouvertes > 0 then
    raise exception 'ROLLBACK REFUSÉ : % fenêtre(s) de suppression encore ouverte(s). Terminer ou fermer ces séquences d''abord : retirer le marqueur rouvrirait les rattachements vers un compte en cours de destruction.', v_ouvertes;
  end if;
end $$;

drop trigger if exists fenetre_de_suppression on public.restaurants;
drop function if exists public.refuser_rattachement_a_un_compte_en_suppression();
drop function if exists public.ouvrir_fenetre_suppression(uuid, uuid);
drop function if exists public.fermer_fenetre_suppression(uuid);
drop table if exists public.comptes_en_suppression;

notify pgrst, 'reload schema';

commit;
