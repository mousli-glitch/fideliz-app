/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  L'ORACLE DE PARTICIPATION CESSE DE COMPTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LE DÉFAUT, MESURÉ LE 19/08/2026 ───
 *
 * `checkReplayStatusAction` est l'une des quatre Server Actions joignables
 * **sans compte** — c'est sa raison d'être : un joueur n'en a pas. Elle porte
 * la clé de service et appelle `get_replay_status`.
 *
 * Cette fonction répond, à n'importe qui :
 *
 *     { replay: true, status: 'too_soon', hours_left: N }
 *     { replay: true, status: 'ok', play_count: N, action, action_url }
 *
 * Les identifiants de jeu sont publics — ils sont dans la page. Un visiteur
 * peut donc demander, pour une adresse e-mail quelconque, **si cette personne
 * a joué chez ce restaurant, et combien de fois**.
 *
 * ─── CE QUE CETTE MIGRATION RETIRE, ET CE QU'ELLE GARDE ───
 *
 * Elle retire `play_count` de la réponse. **Rien ne le lit** : vérifié sur tout
 * le dépôt, le navigateur n'utilise que `status`, `hours_left`, `action` et
 * `action_url`. Ce qui n'est pas rendu ne fuit pas.
 *
 * Le compteur reste CALCULÉ — `v_count` sert à choisir l'action du moment dans
 * la séquence (`v_count % v_len`). On cesse de le publier, on ne cesse pas de
 * s'en servir.
 *
 * `hours_left` RESTE, et c'est délibéré : c'est la fonctionnalité même. Un
 * joueur qui revient trop tôt doit savoir quand revenir. La divulgation
 * résiduelle — « cette adresse a joué récemment » — est bornée par la limite
 * d'IP posée en parallèle dans l'action.
 *
 * ─── AUJOURD'HUI, C'EST INERTE ───
 *
 * Mesuré : **0 jeu sur 9** a la rejouabilité active. La fonction court-circuite
 * sur `replay: false` avant toute lecture de `winners`. Le défaut est latent —
 * il s'ouvre le jour où un restaurateur active la rejouabilité — et le
 * correctif ne change donc rien à l'arrivée.
 *
 * ─── BORNÉE PAR EMPREINTE ───
 *
 * Préimage attendue, relevée le 19/08/2026 sur la production ET sur le banc,
 * strictement identiques :
 *
 *     300d8bba…  1556 caractères
 *
 * MIGRATION ADDITIVE : aucune table, aucune colonne, aucune donnée. Un seul
 * corps de fonction change, et ses droits sont reposés à l'identique.
 */

do $garde$
declare
  v_h text; v_n int;
  c_preimage  constant text := '300d8bba6241dcc1f497a3f426945eff71f01286024df24453cdcddcc354a4cf';
  c_postimage constant text := '1e372ccad530c6225f72eeda6e67b3e14d52830e1785300827f254db2feaaefb';
  c_signature constant text := 'p_game_id uuid, p_email text, p_phone text';
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='get_replay_status';
  if v_n <> 1 then
    raise exception using errcode='P0150',
      message = format('REPLAY SANS COMPTEUR : %s fonction(s) get_replay_status, 1 attendue.', v_n);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='get_replay_status'
    and pg_get_function_identity_arguments(p.oid) = c_signature;
  if v_h is null then
    raise exception using errcode='P0150',
      message = 'REPLAY SANS COMPTEUR : signature inattendue. Rien n''est modifie.';
  end if;
  if v_h not in (c_preimage, c_postimage) then
    raise exception using errcode='P0150',
      message = format('REPLAY SANS COMPTEUR : corps inconnu (empreinte %s). Ni la version auditee, ni la corrigee. Un etat inconnu ne se recouvre pas.', v_h);
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

  /*
   * `v_count` reste CALCULÉ — il choisit l'action du moment dans la séquence.
   * Il n'est simplement plus RENDU : personne ne le lit, et publié, il
   * répondait « combien de fois cette adresse a joué ici » à quiconque connaît
   * un e-mail et un identifiant de jeu, tous deux faciles à obtenir.
   */
  v_seq := v_game.action_sequence;
  if v_seq is not null and jsonb_typeof(v_seq)='array' and jsonb_array_length(v_seq) > 0 then
     v_len := jsonb_array_length(v_seq);
     v_action := v_seq -> (v_count % v_len);
     return jsonb_build_object('replay', true, 'status','ok',
       'action', v_action->>'action', 'action_url', v_action->>'url');
  else
     return jsonb_build_object('replay', true, 'status','ok',
       'action', v_game.active_action, 'action_url', v_game.action_url);
  end if;
end;
$fn$;

comment on function public.get_replay_status(uuid, text, text) is
  'Statut de rejouabilité d''un joueur pour un jeu. Ne rend PAS le nombre de participations : la fonction est joignable sans compte, et ce compteur répondait « combien de fois cette adresse a joué ici » à quiconque.';

revoke all on function public.get_replay_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_replay_status(uuid, text, text) to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  v_h text; v_oid oid; v_manif text;
  c_postimage constant text := '1e372ccad530c6225f72eeda6e67b3e14d52830e1785300827f254db2feaaefb';
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

  if v_h is distinct from c_postimage then
    raise exception using errcode='P0150',
      message = format('REPLAY SANS COMPTEUR : postimage inattendu (%s). Transaction annulee.', v_h);
  end if;
  if v_manif is distinct from 'p_game_id uuid, p_email text, p_phone text | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode='P0150',
      message = format('REPLAY SANS COMPTEUR : manifeste non conforme (%s). Transaction annulee.', v_manif);
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode='P0150',
      message = 'REPLAY SANS COMPTEUR : service_role a PERDU EXECUTE. Transaction annulee — le parcours joueur serait casse.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode='P0150',
      message = 'REPLAY SANS COMPTEUR : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;

  /* Le compteur ne doit plus etre RENDU, mais doit rester CALCULE. */
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname='public' and p.proname='get_replay_status'
               and position('''play_count''' in p.prosrc) > 0) then
    raise exception using errcode='P0150',
      message = 'REPLAY SANS COMPTEUR : play_count est encore rendu. Transaction annulee.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname='public' and p.proname='get_replay_status'
                   and position('v_count % v_len' in p.prosrc) > 0) then
    raise exception using errcode='P0150',
      message = 'REPLAY SANS COMPTEUR : le compteur ne sert plus a choisir l''action de la sequence. Transaction annulee — on cesse de le publier, pas de s''en servir.';
  end if;

  /* Les deux reponses qui font la fonctionnalite doivent survivre. */
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname='public' and p.proname='get_replay_status'
                   and position('''hours_left''' in p.prosrc) > 0
                   and position('''too_soon''' in p.prosrc) > 0) then
    raise exception using errcode='P0150',
      message = 'REPLAY SANS COMPTEUR : le retour « trop tot » a disparu. Transaction annulee.';
  end if;

  raise notice 'REPLAY SANS COMPTEUR : corps, manifeste, droits et fonctionnalite verifies dans la transaction.';
end $verif$;
