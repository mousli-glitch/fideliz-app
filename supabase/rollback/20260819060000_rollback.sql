/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — contrat monétaire en centimes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule `20260819060000_contrat_monetaire_centimes.sql` : les deux colonnes
 * additives, leurs bornes, les trois fonctions.
 *
 * ─── CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * Le défaut mesuré du 19/08/2026 : un minimum d'achat avec des centimes est
 * affiché au client et appliqué comme zéro, parce que `play_game` et
 * `register_win` n'acceptent que `^[0-9]+$`. Un jeu actif et 127 tickets
 * étaient dans ce cas en production au moment de la mesure.
 *
 * ─── CE QU'IL DÉTRUIT ───
 *
 * Les snapshots déjà figés sur des tickets. Un ticket dont la condition avait
 * été gelée à l'émission repart lire le jeu COURANT : modifier le jeu
 * redevient rétroactif. Le script REFUSE s'il en reste, plutôt que de faire
 * disparaître la garantie avec la colonne.
 *
 * Reculer le code dans le même mouvement : le nouveau code écrit les deux
 * représentations et lit `snapshot → canonique → texte`. Sans les colonnes,
 * ses écritures échouent.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare v_figes int;
begin
  if to_regclass('public.winners') is null then
    raise notice 'ROLLBACK : table absente — rien à annuler.';
    return;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='winners'
                    and column_name='min_spend_cents_snapshot') then
    raise notice 'ROLLBACK : colonne absente — rien à annuler.';
    return;
  end if;

  select count(*) into v_figes
  from public.winners where min_spend_cents_snapshot is not null;

  if v_figes > 0 then
    raise exception 'ROLLBACK REFUSÉ : % ticket(s) portent un minimum figé. Les retirer rendrait leur condition à nouveau rétroactive.', v_figes;
  end if;
end $$;

alter table public.games   drop constraint if exists games_min_spend_cents_borne;
alter table public.winners drop constraint if exists winners_min_spend_cents_borne;

drop function if exists public.minimum_effectif_du_ticket(uuid);
drop function if exists public.minimum_effectif_centimes(integer, integer, text);
drop function if exists public.centimes_depuis_saisie(text);

alter table public.winners drop column if exists min_spend_cents_snapshot;
alter table public.games   drop column if exists min_spend_cents;

notify pgrst, 'reload schema';

commit;
