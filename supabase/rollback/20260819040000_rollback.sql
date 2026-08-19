/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — jeton de propriété de la fenêtre de suppression
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule `20260819040000_jeton_de_fenetre_suppression.sql` en REVENANT aux
 * signatures de la migration 20260819020000 : `ouvrir_fenetre_suppression`
 * à deux arguments, `fermer_fenetre_suppression` à un seul, pas de fonction
 * de réparation, pas de colonne `jeton`.
 *
 * ─── CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * La course suppression ↔ suppression, en entier : deux suppressions du même
 * compte ouvrent la même fenêtre, et la première à finir referme celle de
 * l'autre — rouvrant les rattachements avant son irréversible. La barrière
 * écrivain ↔ suppression, elle, reste en place.
 *
 * Le code appelle `ouvrir_fenetre_suppression` à TROIS arguments et attend un
 * jeton en retour : après ce rollback, l'appel échoue et la primitive refuse
 * avant toute mutation. Reculer le code dans le même mouvement, ou ne pas
 * jouer ce rollback.
 *
 * ─── FENÊTRES OUVERTES ───
 *
 * Refus tant qu'il en reste : retirer la colonne `jeton` sous une opération
 * en cours lui ferait perdre son propriétaire, et personne ne pourrait plus
 * dire à qui la fenêtre appartenait.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare v_ouvertes int;
begin
  if to_regclass('public.comptes_en_suppression') is null then
    raise notice 'ROLLBACK : la table n''existe pas — rien à annuler.';
    return;
  end if;
  select count(*) into v_ouvertes from public.comptes_en_suppression;
  if v_ouvertes > 0 then
    raise exception 'ROLLBACK REFUSÉ : % fenêtre(s) de suppression ouverte(s). Retirer le jeton maintenant leur ferait perdre leur propriétaire.', v_ouvertes;
  end if;
end $$;

drop function if exists public.forcer_fermeture_fenetre(uuid);
drop function if exists public.ouvrir_fenetre_suppression(uuid, uuid, uuid);
drop function if exists public.fermer_fenetre_suppression(uuid, uuid);

-- Restauration des signatures de 20260819020000, à l'identique.
create or replace function public.ouvrir_fenetre_suppression(p_user_id uuid, p_demandeur uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then
    raise exception using errcode = 'P0104', message = 'Compte cible manquant : fenêtre non ouverte.';
  end if;

  insert into public.comptes_en_suppression (user_id, demandeur)
  values (p_user_id, p_demandeur)
  on conflict (user_id) do update set ouvert_le = now(), demandeur = excluded.demandeur;

  lock table public.restaurants in exclusive mode;
end;
$$;

create or replace function public.fermer_fenetre_suppression(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then
    return;
  end if;
  delete from public.comptes_en_suppression where user_id = p_user_id;
end;
$$;

alter table public.comptes_en_suppression drop column if exists jeton;

revoke all on function public.ouvrir_fenetre_suppression(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fermer_fenetre_suppression(uuid) from public, anon, authenticated;
grant execute on function public.ouvrir_fenetre_suppression(uuid, uuid) to service_role;
grant execute on function public.fermer_fenetre_suppression(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
