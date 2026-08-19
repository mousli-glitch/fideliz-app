/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  L'ÉTAT FANTÔME `consumed` DISPARAÎT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Décision de Samy le 19/08/2026 : option P-a — `consumed` n'existe pas.
 *
 * ─── CE QUI A ÉTÉ MESURÉ ───
 *
 * `winners.status` portait DEUX contraintes CHECK, toutes deux validées :
 *
 *     check_winner_status    available, redeemed, consumed
 *     winners_status_check   available, redeemed
 *
 * PostgreSQL les applique ensemble. L'ensemble réellement écrivable est leur
 * intersection : {available, redeemed}. La première est entièrement absorbée
 * par la seconde — elle annonce un état que l'autre interdit.
 *
 * En base, le 19/08/2026 :
 *
 *     winners available ........... 129
 *     winners redeemed ............ 368
 *     winners consumed ............   0   ← et c'était impossible autrement
 *     winners_archive redeemed ....  37
 *
 * Ce n'est donc pas un défaut de données. C'est un PIÈGE : quelqu'un lit
 * `check_winner_status`, croit l'état légal, écrit du code, et prend un 23514
 * en production. Vérifié : la notion n'existe pas non plus côté Cartiz, la
 * fusion n'impose donc rien.
 *
 * ─── CE QUE CETTE MIGRATION FAIT ───
 *
 * 1. Supprime `check_winner_status`, la permissive et redondante. Le contrat
 *    devient univoque : {available, redeemed}, dit à un seul endroit.
 *
 * 2. Valide `winners_min_spend_cents_borne`, restée NOT VALID depuis le lot 3
 *    — les lignes existantes n'avaient jamais été contrôlées. Mesuré :
 *    0 ligne la viole sur 497. La garantie devient totale au lieu d'être
 *    seulement prospective.
 *
 * 3. Retire de `archive_redeemed_winners` la branche `or w.status =
 *    'consumed'`, qui ne pouvait jamais se déclencher. Une branche morte qui
 *    nomme un état impossible est un mensonge dans le code.
 *
 * ⚠️ La colonne `consumed_at` n'est PAS supprimée. Supprimer une colonne est
 * destructif et n'a pas été décidé. Elle reste, vide et inutile — c'est une
 * décision distincte.
 *
 * ─── BORNÉE PAR EMPREINTE NORMALISÉE, ET POURQUOI ───
 *
 * Le corps de `archive_redeemed_winners` diffère entre la production
 * (bd564337…, 1375 car.) et le dépôt (0fca0c96…, 1225 car.). Vérifié : les
 * deux ont la MÊME empreinte normalisée — 962 caractères hors espaces,
 * 41efb2e1… — donc le même code, mis en forme autrement. Aucun changement non
 * tracé, contrairement à ce que l'écart brut laissait craindre.
 *
 * La garde porte donc sur l'empreinte NORMALISÉE : elle accepte les deux mises
 * en forme et refuse tout corps qui ferait autre chose. Après application, les
 * deux environnements convergent sur un corps unique (ff8c11cf…) — la dérive
 * cosmétique s'arrête ici.
 *
 * ─── CE QUE LE BANC A ATTRAPE ───
 *
 * Premier essai : `42P13, cannot remove parameter defaults`. La fonction porte
 * `p_days integer DEFAULT 90, p_batch integer DEFAULT 5000`, et le
 * `create or replace` les omettait. PostgreSQL a refuse, la transaction a ete
 * annulee, rien n'a bouge — c'est exactement pour ca qu'on passe par le banc.
 *
 * Enseignement conserve dans le bloc de verification : le manifeste habituel
 * s'appuie sur `pg_get_function_identity_arguments`, qui MASQUE les defauts.
 * Il aurait laisse passer l'ajout d'un defaut sans rien dire.
 *
 * MIGRATION ADDITIVE au sens du chantier : aucune table créée ou supprimée,
 * aucune colonne, aucune donnée touchée. Une contrainte redondante en moins,
 * une contrainte promue, un corps de fonction nettoyé.
 */

do $garde$
declare
  v_n int; v_def text; v_norm text; v_brut text;
  c_preimage_norm constant text := '41efb2e1bd688f46f0c7ac610bc1b5381bf0f01f9225ceb23ff109d0b584a322';
  c_postimage     constant text := 'ff8c11cfdfa940ebcde16aa99b11c705c47d950546af1ee24eb7b533963dc51e';
begin
  /* 1. La contrainte stricte doit EXISTER et être validée — c'est elle qui
        porte le contrat une fois l'autre partie. Sans elle, supprimer la
        permissive OUVRIRAIT consumed au lieu de le fermer. */
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_status_check' and c.convalidated;
  if v_def is distinct from 'CHECK ((status = ANY (ARRAY[''available''::text, ''redeemed''::text])))' then
    raise exception using errcode='P0160',
      message = format('ETAT CONSUMED : winners_status_check absente, non validee ou differente (%s). Rien n''est modifie — supprimer l''autre OUVRIRAIT consumed.', coalesce(v_def,'ABSENTE'));
  end if;

  /* 2. La permissive doit être celle qu'on a auditée — ou déjà partie. */
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='check_winner_status';
  if v_n = 1 then
    select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='winners' and c.conname='check_winner_status';
    if v_def is distinct from 'CHECK ((status = ANY (ARRAY[''available''::text, ''redeemed''::text, ''consumed''::text])))' then
      raise exception using errcode='P0160',
        message = format('ETAT CONSUMED : check_winner_status a une definition inattendue (%s). Un etat inconnu ne se supprime pas.', v_def);
    end if;
  elsif v_n > 1 then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : plusieurs check_winner_status. Rien n''est modifie.';
  end if;

  /* 3. Aucune ligne ne doit porter l'état qu'on déclare impossible. */
  if exists (select 1 from public.winners where status = 'consumed')
     or exists (select 1 from public.winners_archive where status = 'consumed') then
    raise exception using errcode='P0160',
      message = 'ETAT CONSUMED : des lignes portent consumed. La decision P-a ne s''applique pas telle quelle — arret.';
  end if;

  /* 4. La borne monétaire : présente, et sans violation à valider de force. */
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_min_spend_cents_borne';
  if v_n <> 1 then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : winners_min_spend_cents_borne introuvable. Rien n''est modifie.';
  end if;
  if exists (select 1 from public.winners
             where min_spend_cents_snapshot is not null
               and (min_spend_cents_snapshot < 0 or min_spend_cents_snapshot > 99999900)) then
    raise exception using errcode='P0160',
      message = 'ETAT CONSUMED : des lignes violent la borne monetaire. On ne valide pas une contrainte en la forcant — arret.';
  end if;

  /* 5. La fonction d'archivage doit faire ce qu'on croit, quelle que soit sa
        mise en forme. D'où l'empreinte normalisée. */
  select encode(digest(regexp_replace(p.prosrc,'\s+','','g'),'sha256'),'hex'),
         encode(digest(p.prosrc,'sha256'),'hex')
    into v_norm, v_brut
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='archive_redeemed_winners'
    and pg_get_function_identity_arguments(p.oid) = 'p_days integer, p_batch integer';
  if v_norm is null then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : archive_redeemed_winners introuvable ou signature inattendue.';
  end if;
  if v_norm is distinct from c_preimage_norm and v_brut is distinct from c_postimage then
    raise exception using errcode='P0160',
      message = format('ETAT CONSUMED : archive_redeemed_winners fait autre chose que la version auditee (normalisee %s). Un etat inconnu ne se recouvre pas.', v_norm);
  end if;
end $garde$;

/* ─── 1. La contrainte redondante s'en va ─────────────────────────────── */
alter table public.winners drop constraint if exists check_winner_status;

/* ─── 2. La borne monétaire devient une garantie totale ───────────────── */
alter table public.winners validate constraint winners_min_spend_cents_borne;

/* ─── 3. La branche morte quitte la fonction d'archivage ──────────────── */
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
      w.status = 'redeemed'
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

comment on function public.archive_redeemed_winners(integer, integer) is
  'Archive les tickets consommes au-dela de p_days, par lots de p_batch. N''archive que le statut redeemed : c''est le seul etat terminal que la table autorise.';

revoke all on function public.archive_redeemed_winners(integer, integer) from public, anon, authenticated;
grant execute on function public.archive_redeemed_winners(integer, integer) to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  v_h text; v_oid oid; v_manif text; v_n int;
  c_postimage constant text := 'ff8c11cfdfa940ebcde16aa99b11c705c47d950546af1ee24eb7b533963dc51e';
  c_acl constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  /* La permissive est partie. */
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='check_winner_status';
  if v_n <> 0 then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : check_winner_status est toujours la. Transaction annulee.';
  end if;

  /* La stricte est toujours la, et validee. Sans elle, on aurait OUVERT consumed. */
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_status_check' and c.convalidated;
  if v_n <> 1 then
    raise exception using errcode='P0160',
      message = 'ETAT CONSUMED : winners_status_check a disparu ou n''est plus validee — consumed serait devenu ecrivable. Transaction annulee.';
  end if;

  /* La borne est desormais validee. */
  select count(*) into v_n from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='winners' and c.conname='winners_min_spend_cents_borne' and c.convalidated;
  if v_n <> 1 then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : la borne monetaire n''est pas validee. Transaction annulee.';
  end if;

  /* La fonction : corps exact, manifeste, droits. */
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='archive_redeemed_winners';

  if v_h is distinct from c_postimage then
    raise exception using errcode='P0160', message = format('ETAT CONSUMED : postimage inattendu (%s). Transaction annulee.', v_h);
  end if;
  if v_manif is distinct from 'p_days integer, p_batch integer | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode='P0160', message = format('ETAT CONSUMED : manifeste non conforme (%s). Transaction annulee.', v_manif);
  end if;

  /*
   * Les VALEURS PAR DEFAUT, verifiees a part.
   *
   * `pg_get_function_identity_arguments` les MASQUE : le manifeste ci-dessus
   * serait identique avec ou sans elles. PostgreSQL refuse de les retirer par
   * `create or replace` (42P13), mais rien ne l'empeche d'en AJOUTER une —
   * et une signature qui gagne un defaut change son contrat en silence.
   * D'ou cette assertion sur `pg_get_function_arguments`, qui les montre.
   */
  if (select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='archive_redeemed_winners')
     is distinct from 'p_days integer DEFAULT 90, p_batch integer DEFAULT 5000' then
    raise exception using errcode='P0160',
      message = 'ETAT CONSUMED : les valeurs par defaut de la signature ont change. Transaction annulee.';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : service_role a PERDU EXECUTE — le cron d''archivage serait casse. Transaction annulee.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;

  /* Ce que la fonction doit encore savoir faire — on retire une branche morte,
     pas une regle. */
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='archive_redeemed_winners'
                   and position('w.status = ''redeemed''' in p.prosrc) > 0
                   and position('coalesce(w.redeemed_at, w.created_at) < v_cutoff' in p.prosrc) > 0
                   and position('limit p_batch' in p.prosrc) > 0
                   and position('on conflict (id) do nothing' in p.prosrc) > 0) then
    raise exception using errcode='P0160',
      message = 'ETAT CONSUMED : la fonction a perdu une de ses regles (redeemed, fenetre, lot, anti-doublon). Transaction annulee.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='archive_redeemed_winners'
               and position('consumed' in p.prosrc) > 0) then
    raise exception using errcode='P0160', message = 'ETAT CONSUMED : la branche morte est encore la. Transaction annulee.';
  end if;

  raise notice 'ETAT CONSUMED : contrainte redondante retiree, borne validee, branche morte supprimee.';
end $verif$;
