/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  RETOUR ARRIÈRE — 20260819120000_replay_sans_compteur
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remet `get_replay_status` dans son état d'avant le 19/08/2026, c'est-à-dire
 * **avec** `play_count` dans la réponse.
 *
 * ⚠️ CE RETOUR ARRIÈRE RÉOUVRE UNE DIVULGATION. Il rend de nouveau, à
 * n'importe qui et sans compte, le nombre de participations d'une adresse
 * e-mail donnée sur un jeu donné. Ne le jouer que si le retrait de ce champ
 * a cassé quelque chose — ce qui supposerait un lecteur inconnu au 19/08/2026,
 * où le dépôt entier n'en comptait aucun.
 *
 * ─── LE CORPS RESTAURÉ N'EST PAS UNE RECONSTRUCTION ───
 *
 * Il est repris **octet pour octet** de `00000000000000_baseline_fideliz.sql`,
 * et son empreinte a été vérifiée avant d'être écrite ici :
 *
 *     300d8bba…  1556 caractères  — identique à la préimage relevée en production
 *
 * ─── BORNÉ PAR EMPREINTE, DANS LES DEUX SENS ───
 *
 * N'accepte que la version corrigée (1e372cca…) ou la version d'origine
 * (300d8bba…, retour déjà joué). Tout autre corps est refusé : si quelqu'un a
 * modifié la fonction entre-temps, ce fichier ne doit pas écraser son travail.
 */

do $garde$
declare
  v_h text; v_n int;
  c_corrige constant text := '1e372ccad530c6225f72eeda6e67b3e14d52830e1785300827f254db2feaaefb';
  c_origine constant text := '300d8bba6241dcc1f497a3f426945eff71f01286024df24453cdcddcc354a4cf';
  c_signature constant text := 'p_game_id uuid, p_email text, p_phone text';
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='get_replay_status';
  if v_n <> 1 then
    raise exception using errcode='P0150',
      message = format('RETOUR ARRIERE REPLAY : %s fonction(s) get_replay_status, 1 attendue.', v_n);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='get_replay_status'
    and pg_get_function_identity_arguments(p.oid) = c_signature;
  if v_h is null then
    raise exception using errcode='P0150',
      message = 'RETOUR ARRIERE REPLAY : signature inattendue. Rien n''est modifie.';
  end if;
  if v_h not in (c_corrige, c_origine) then
    raise exception using errcode='P0150',
      message = format('RETOUR ARRIERE REPLAY : corps inconnu (empreinte %s). Quelqu''un a modifie cette fonction depuis. Ce fichier n''ecrase pas un travail inconnu.', v_h);
  end if;
end $garde$;

create or replace function public.get_replay_status(
  p_game_id uuid,
  p_email text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_game games%rowtype;
  v_last timestamptz;
  v_count int := 0;
  v_seq jsonb;
  v_len int;
  v_action jsonb;
  v_hours_left int;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return jsonb_build_object('error','game_not_found'); end if;
  if not coalesce(v_game.replay_enabled,false) then
     return jsonb_build_object('replay', false);
  end if;

  select max(created_at), count(*) into v_last, v_count from winners
   where game_id = p_game_id
     and ( (p_email is not null and p_email <> '' and lower(email)=lower(p_email))
        or (p_phone is not null and p_phone <> '' and phone = p_phone) );

  if v_last is not null and v_last > now() - (coalesce(v_game.replay_delay_hours,24)||' hours')::interval then
     v_hours_left := ceil(extract(epoch from (v_last + (coalesce(v_game.replay_delay_hours,24)||' hours')::interval - now()))/3600.0);
     return jsonb_build_object('replay', true, 'status','too_soon','hours_left', v_hours_left);
  end if;

  v_seq := v_game.action_sequence;
  if v_seq is not null and jsonb_typeof(v_seq)='array' and jsonb_array_length(v_seq) > 0 then
     v_len := jsonb_array_length(v_seq);
     v_action := v_seq -> (v_count % v_len);
     return jsonb_build_object('replay', true, 'status','ok', 'play_count', v_count,
       'action', v_action->>'action', 'action_url', v_action->>'url');
  else
     return jsonb_build_object('replay', true, 'status','ok', 'play_count', v_count,
       'action', v_game.active_action, 'action_url', v_game.action_url);
  end if;
end;
$fn$;

comment on function public.get_replay_status(uuid, text, text) is null;

revoke all on function public.get_replay_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_replay_status(uuid, text, text) to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  v_h text; v_oid oid; v_manif text;
  c_origine constant text := '300d8bba6241dcc1f497a3f426945eff71f01286024df24453cdcddcc354a4cf';
  c_acl constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='get_replay_status';

  if v_h is distinct from c_origine then
    raise exception using errcode='P0150',
      message = format('RETOUR ARRIERE REPLAY : le corps restaure n''est pas l''original (%s). Transaction annulee.', v_h);
  end if;
  if v_manif is distinct from 'p_game_id uuid, p_email text, p_phone text | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode='P0150',
      message = format('RETOUR ARRIERE REPLAY : manifeste non conforme (%s). Transaction annulee.', v_manif);
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode='P0150',
      message = 'RETOUR ARRIERE REPLAY : service_role a PERDU EXECUTE. Transaction annulee.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode='P0150',
      message = 'RETOUR ARRIERE REPLAY : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;

  raise notice 'RETOUR ARRIERE REPLAY : corps d''origine restaure, play_count est de nouveau rendu.';
end $verif$;
