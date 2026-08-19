/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  RETOUR ARRIÈRE — 20260819130000_etat_consumed_supprime
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remet les trois choses dans leur état d'avant le 19/08/2026 :
 * la contrainte permissive, la borne en NOT VALID, la branche morte.
 *
 * ⚠️ CE QU'IL RÉOUVRE, ET CE QU'IL NE PEUT PAS DÉFAIRE
 *
 * 1. `check_winner_status` revient. Elle ne rend PAS `consumed` écrivable —
 *    `winners_status_check` continue de l'interdire — elle réintroduit
 *    seulement le piège : deux contraintes qui se contredisent, dont l'une
 *    annonce un état que l'autre refuse.
 *
 * 2. La borne monétaire redevient NOT VALID. Attention : PostgreSQL ne sait
 *    pas « dé-valider » une contrainte. Il faut la SUPPRIMER et la recréer,
 *    ce qui laisse une fenêtre — brève, dans la même transaction — où aucune
 *    borne ne protège la colonne. C'est pourquoi ce fichier la recrée
 *    immédiatement, dans la même transaction, et vérifie qu'elle est là.
 *
 * 3. La branche `or w.status = 'consumed'` revient dans l'archivage. Elle
 *    reste morte : la table refuse toujours cet état.
 *
 * Autrement dit : ce retour arrière ne répare rien et ne protège de rien. Il
 * existe parce qu'une migration sans retour arrière est une migration qu'on
 * n'a pas fini d'écrire. Ne le jouer que si le retrait a cassé quelque chose
 * d'inattendu.
 *
 * ─── LE CORPS RESTAURÉ N'EST PAS UNE RECONSTRUCTION ───
 *
 * C'est le corps qui était en production le 19/08/2026 au matin, relu depuis
 * `pg_proc` et vérifié : bd564337…, 1375 caractères. Il diffère du dépôt
 * (0fca0c96…, 1225 car.) par la seule mise en forme — empreintes normalisées
 * identiques.
 *
 * ─── BORNÉ PAR EMPREINTE, DANS LES DEUX SENS ───
 */

do $garde$
declare
  v_norm text; v_brut text; v_n int;
  c_corrige_norm constant text := '7f78c8f32d6bba8536b89100b17c95dec0973e0dcb0ef4ab838d645a59b3eee2';
  c_origine_norm constant text := '41efb2e1bd688f46f0c7ac610bc1b5381bf0f01f9225ceb23ff109d0b584a322';
begin
  select encode(digest(regexp_replace(p.prosrc,'\s+','','g'),'sha256'),'hex'),
         encode(digest(p.prosrc,'sha256'),'hex')
    into v_norm, v_brut
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='archive_redeemed_winners'
    and pg_get_function_identity_arguments(p.oid) = 'p_days integer, p_batch integer';
  if v_norm is null then
    raise exception using errcode='P0162', message = 'RETOUR ARRIERE CONSUMED : archive_redeemed_winners introuvable ou signature inattendue.';
  end if;
  if v_norm not in (c_corrige_norm, c_origine_norm) then
    raise exception using errcode='P0162',
      message = format('RETOUR ARRIERE CONSUMED : la fonction fait autre chose que la version corrigee ou l''originale (normalisee %s). Ce fichier n''ecrase pas un travail inconnu.', v_norm);
  end if;

  /* La stricte doit etre la : sans elle, remettre la permissive serait pire
     que tout — plus rien ne fermerait consumed. */
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_status_check' and c.convalidated;
  if v_n <> 1 then
    raise exception using errcode='P0162',
      message = 'RETOUR ARRIERE CONSUMED : winners_status_check absente. Remettre la permissive OUVRIRAIT consumed. Arret.';
  end if;
end $garde$;

/* ─── 1. La contrainte permissive revient ─────────────────────────────── */
alter table public.winners drop constraint if exists check_winner_status;
alter table public.winners add constraint check_winner_status
  check (status = any (array['available'::text, 'redeemed'::text, 'consumed'::text]));

/* ─── 2. La borne redevient NOT VALID ─────────────────────────────────
   PostgreSQL ne sait pas de-valider : on supprime et on recree. */
alter table public.winners drop constraint if exists winners_min_spend_cents_borne;
alter table public.winners add constraint winners_min_spend_cents_borne
  check (min_spend_cents_snapshot is null
         or (min_spend_cents_snapshot >= 0 and min_spend_cents_snapshot <= 99999900)) not valid;

/* ─── 3. La branche morte revient dans l'archivage ────────────────────── */
create or replace function public.archive_redeemed_winners(
  p_days integer default 90,
  p_batch integer default 5000
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_cutoff timestamptz := now() - make_interval(days => p_days);
  v_archived int := 0;
begin

  with candidates as (
    select
      w.id,
      w.created_at,
      w.redeemed_at,
      w.game_id,
      w.first_name,
      w.email,
      w.status,
      w.prize_label_snapshot,
      null::text as prize_color_snapshot
    from public.winners w
    where
      (w.status = 'redeemed' or w.status = 'consumed')
      and coalesce(w.redeemed_at, w.created_at) < v_cutoff
    order by coalesce(w.redeemed_at, w.created_at) asc, w.id asc
    limit p_batch
  ),
  inserted as (
    insert into public.winners_archive (
      id,
      archived_at,
      created_at,
      redeemed_at,
      restaurant_id,
      game_id,
      first_name,
      email,
      status,
      prize_label_snapshot,
      prize_color_snapshot
    )
    select
      c.id,
      now(),
      c.created_at,
      c.redeemed_at,
      g.restaurant_id,
      c.game_id,
      c.first_name,
      c.email,
      c.status,
      c.prize_label_snapshot,
      c.prize_color_snapshot
    from candidates c
    left join public.games g on g.id = c.game_id
    on conflict (id) do nothing
    returning id
  ),
  deleted as (
    delete from public.winners w
    where w.id in (select id from inserted)
    returning w.id
  )
  select count(*) into v_archived from deleted;

  return v_archived;
end;
$fn$;

comment on function public.archive_redeemed_winners(integer, integer) is null;

revoke all on function public.archive_redeemed_winners(integer, integer) from public, anon, authenticated;
grant execute on function public.archive_redeemed_winners(integer, integer) to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  v_h text; v_n int; v_args text;
  c_origine constant text := 'bd56433792bfb4921998f1163c1403528b82c0cad98af39a57379a8a1fa59690';
begin
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='check_winner_status';
  if v_n <> 1 then
    raise exception using errcode='P0162', message = 'RETOUR ARRIERE CONSUMED : check_winner_status n''est pas revenue. Transaction annulee.';
  end if;

  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_status_check' and c.convalidated;
  if v_n <> 1 then
    raise exception using errcode='P0162',
      message = 'RETOUR ARRIERE CONSUMED : winners_status_check a disparu — consumed serait ecrivable. Transaction annulee.';
  end if;

  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_min_spend_cents_borne';
  if v_n <> 1 then
    raise exception using errcode='P0162',
      message = 'RETOUR ARRIERE CONSUMED : la borne monetaire a ete supprimee sans etre recreee. Transaction annulee — la colonne serait sans borne du tout.';
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex'), pg_get_function_arguments(p.oid) into v_h, v_args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='archive_redeemed_winners';
  if v_h is distinct from c_origine then
    raise exception using errcode='P0162', message = format('RETOUR ARRIERE CONSUMED : le corps restaure n''est pas l''original (%s). Transaction annulee.', v_h);
  end if;
  if v_args is distinct from 'p_days integer DEFAULT 90, p_batch integer DEFAULT 5000' then
    raise exception using errcode='P0162', message = 'RETOUR ARRIERE CONSUMED : les valeurs par defaut ont change. Transaction annulee.';
  end if;

  raise notice 'RETOUR ARRIERE CONSUMED : contrainte permissive revenue, borne en NOT VALID, branche morte restauree.';
end $verif$;
