/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  RETOUR ARRIÈRE — 20260819100000 (lecteurs monétaires)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CE RETOUR ARRIÈRE RÉOUVRE LE DÉFAUT MONÉTAIRE.
 *
 * Il remet `play_game` dans son état baseline : un minimum décimal redevient
 * « aucun minimum » pour le scanner du restaurateur, alors que le client, lui,
 * continue de le lire sur la roue. C'est exactement ce que la migration 100000
 * ferme.
 *
 * La bonne conduite en cas d'anomalie est donc, dans cet ordre :
 *
 *   1. ARRÊT IMMÉDIAT — ne rien relancer, ne rien « réessayer ».
 *   2. CONSERVER LES PREUVES — sortie observée, empreinte, heure.
 *   3. NEUTRALISER LE PARCOURS si l'émission des tickets devient incohérente.
 *   4. CORRECTION FORWARD en priorité.
 *   5. CE FICHIER EN DERNIER RECOURS, et uniquement sur décision explicite de
 *      Samy, après avoir établi que l'incident vient de CE correctif.
 *
 * ─── CE QU'IL NE DÉFAIT PAS, ET C'EST VOULU ───
 *
 * `register_win` revient à son état POST-HOTFIX — celui du 19/08/2026, qui
 * porte l'isolation lot/jeu. Le retour arrière monétaire ne rouvre JAMAIS la
 * faille du lot d'un autre restaurant : ce sont deux correctifs distincts, et
 * annuler l'un ne doit pas annuler l'autre. Le fichier le VÉRIFIE.
 *
 * ─── CE QU'IL NE TOUCHE PAS ───
 *
 * Aucune donnée. Les colonnes `min_spend_cents` et
 * `min_spend_cents_snapshot` restent en place, et les valeurs déjà écrites
 * dans les snapshots restent écrites : elles sont simplement ignorées par les
 * corps restaurés. Rien n'est effacé.
 *
 * ─── BORNÉ ET IDEMPOTENT ───
 *
 * Refuse tout corps qui n'est ni le corrigé, ni celui d'avant. Rejoué sur un
 * état déjà revenu en arrière : ne fait rien.
 *
 * GÉNÉRÉ depuis 00000000000000_baseline_fideliz.sql — les deux corps ci-dessous
 * ne sont pas recopiés à la main, ils en sont extraits, et leurs empreintes
 * sont vérifiées avant écriture de ce fichier.
 */

do $garde$
declare
  v_h text; v_n int;
  c_play_pre  constant text := 'bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2';
  c_play_post constant text := '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d';
  c_reg_pre   constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_reg_post  constant text := '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd';
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname in ('play_game','register_win');
  if v_n <> 2 then
    raise exception using errcode='P0132',
      message = format('RETOUR ARRIERE : %s fonction(s) play_game/register_win, 2 attendues. Rien n''est modifie.', v_n);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='play_game';
  if v_h not in (c_play_pre, c_play_post) then
    raise exception using errcode='P0132',
      message = format('RETOUR ARRIERE : corps de play_game inconnu (%s). Un etat inconnu ne se recouvre pas.', v_h);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_win';
  if v_h not in (c_reg_pre, c_reg_post) then
    raise exception using errcode='P0132',
      message = format('RETOUR ARRIERE : corps de register_win inconnu (%s). Un etat inconnu ne se recouvre pas.', v_h);
  end if;
end $garde$;

create or replace function public.play_game(
  p_game_id uuid,
  p_email text,
  p_phone text,
  p_first_name text,
  p_marketing_optin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_game games%rowtype;
  v_prize prizes%rowtype;
  v_prize_id uuid;
  v_expires_at timestamptz;
  v_min_spend int;
  v_winner_id uuid;
  v_last timestamptz;
  v_hours_left int;
  v_count int := 0;
  v_seq jsonb; v_len int; v_assigned text;
  v_total int; v_r numeric;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return jsonb_build_object('success', false, 'error', 'game_not_found'); end if;

  v_assigned := v_game.active_action;

  -- Éligibilité (identique à register_win)
  if coalesce(v_game.replay_enabled, false) then
    select max(created_at), count(*) into v_last, v_count from winners
      where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) );
    if v_last is not null and v_last > now() - (coalesce(v_game.replay_delay_hours, 24) || ' hours')::interval then
      v_hours_left := ceil(extract(epoch from (v_last + (coalesce(v_game.replay_delay_hours,24)||' hours')::interval - now())) / 3600.0);
      return jsonb_build_object('success', false, 'error', 'replay_too_soon', 'hours_left', v_hours_left);
    end if;
    v_seq := v_game.action_sequence;
    if v_seq is not null and jsonb_typeof(v_seq) = 'array' and jsonb_array_length(v_seq) > 0 then
      v_len := jsonb_array_length(v_seq);
      v_assigned := (v_seq -> (v_count % v_len)) ->> 'action';
    end if;
  else
    if exists (
      select 1 from winners where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) )
    ) then
      return jsonb_build_object('success', false, 'error', 'already_played');
    end if;
  end if;

  -- TIRAGE PONDÉRÉ CÔTÉ SERVEUR parmi les lots disponibles (stock)
  select coalesce(sum(weight), 0) into v_total from prizes
    where game_id = p_game_id
      and (not coalesce(v_game.is_stock_limit_active, false) or quantity is null or quantity > 0);
  if v_total <= 0 then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;

  v_r := random() * v_total;
  select id into v_prize_id from (
    select id, sum(weight) over (order by id) as cum
    from prizes
    where game_id = p_game_id
      and (not coalesce(v_game.is_stock_limit_active, false) or quantity is null or quantity > 0)
  ) t
  where t.cum >= v_r
  order by t.cum
  limit 1;

  if v_prize_id is null then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;
  select * into v_prize from prizes where id = v_prize_id;

  -- Décrément stock atomique
  if v_game.is_stock_limit_active and v_prize.quantity is not null then
    update prizes set quantity = quantity - 1 where id = v_prize_id and quantity > 0;
    if not found then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;
  end if;

  v_expires_at := now() + ((coalesce(v_game.validity_days, 30)) || ' days')::interval;
  v_min_spend := coalesce((case when v_game.min_spend ~ '^[0-9]+$' then v_game.min_spend::int else 0 end), 0);

  insert into winners (game_id, prize_id, email, phone, first_name, marketing_optin, prize_label_snapshot, expires_at, status, assigned_action)
  values (p_game_id, v_prize_id, p_email, p_phone, p_first_name, p_marketing_optin, coalesce(v_prize.label,'Lot'), v_expires_at, 'available', v_assigned)
  returning id into v_winner_id;

  if v_game.restaurant_id is not null then
    begin
      insert into contacts (restaurant_id, email, phone, first_name, marketing_optin, source_game_id, last_submitted_at)
      values (v_game.restaurant_id, p_email, p_phone, p_first_name, p_marketing_optin, p_game_id, now())
      on conflict (restaurant_id, email) do update
        set first_name = excluded.first_name, marketing_optin = excluded.marketing_optin, last_submitted_at = now();
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('success', true, 'winner_id', v_winner_id, 'qr_code', v_winner_id::text,
    'prize_id', v_prize_id, 'prize_label', coalesce(v_prize.label,'Lot'), 'expires_at', v_expires_at, 'min_spend', v_min_spend);
end;
$fn$;

create or replace function public.register_win(
  p_game_id uuid,
  p_prize_id uuid,
  p_email text,
  p_phone text,
  p_first_name text,
  p_marketing_optin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_game games%rowtype;
  v_prize prizes%rowtype;
  v_expires_at timestamptz;
  v_min_spend int;
  v_winner_id uuid;
  v_last timestamptz;
  v_hours_left int;
  v_count int := 0;
  v_seq jsonb;
  v_len int;
  v_assigned text;
begin
  select * into v_game from games where id = p_game_id;
  if not found then return jsonb_build_object('success', false, 'error', 'game_not_found'); end if;

  v_assigned := v_game.active_action;

  if coalesce(v_game.replay_enabled, false) then
    select max(created_at), count(*) into v_last, v_count from winners
      where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) );
    if v_last is not null and v_last > now() - (coalesce(v_game.replay_delay_hours, 24) || ' hours')::interval then
      v_hours_left := ceil(extract(epoch from (v_last + (coalesce(v_game.replay_delay_hours,24)||' hours')::interval - now())) / 3600.0);
      return jsonb_build_object('success', false, 'error', 'replay_too_soon', 'hours_left', v_hours_left);
    end if;
    -- action assignée = élément (v_count modulo longueur) de la séquence
    v_seq := v_game.action_sequence;
    if v_seq is not null and jsonb_typeof(v_seq) = 'array' and jsonb_array_length(v_seq) > 0 then
      v_len := jsonb_array_length(v_seq);
      v_assigned := (v_seq -> (v_count % v_len)) ->> 'action';
    end if;
  else
    if exists (
      select 1 from winners
      where game_id = p_game_id
        and ( (p_email is not null and p_email <> '' and lower(email) = lower(p_email))
           or (p_phone is not null and p_phone <> '' and phone = p_phone) )
    ) then
      return jsonb_build_object('success', false, 'error', 'already_played');
    end if;
  end if;

  select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;
  if not found then return jsonb_build_object('success', false, 'error', 'prize_not_found'); end if;

  if v_game.is_stock_limit_active and v_prize.quantity is not null then
    update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;
    if not found then return jsonb_build_object('success', false, 'error', 'stock_empty'); end if;
  end if;

  v_expires_at := now() + ((coalesce(v_game.validity_days, 30)) || ' days')::interval;
  v_min_spend := coalesce((case when v_game.min_spend ~ '^[0-9]+$' then v_game.min_spend::int else 0 end), 0);

  insert into winners (game_id, prize_id, email, phone, first_name, marketing_optin, prize_label_snapshot, expires_at, status, assigned_action)
  values (p_game_id, p_prize_id, p_email, p_phone, p_first_name, p_marketing_optin, coalesce(v_prize.label,'Lot'), v_expires_at, 'available', v_assigned)
  returning id into v_winner_id;

  if v_game.restaurant_id is not null then
    begin
      insert into contacts (restaurant_id, email, phone, first_name, marketing_optin, source_game_id, last_submitted_at)
      values (v_game.restaurant_id, p_email, p_phone, p_first_name, p_marketing_optin, p_game_id, now())
      on conflict (restaurant_id, email) do update
        set first_name = excluded.first_name, marketing_optin = excluded.marketing_optin, last_submitted_at = now();
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('success', true, 'winner_id', v_winner_id, 'qr_code', v_winner_id::text, 'expires_at', v_expires_at, 'min_spend', v_min_spend);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'already_played');
end;
$fn$;

revoke all on function public.play_game(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.play_game(uuid, text, text, text, boolean) to service_role;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  r record; v_attendu text;
  c_play_pre constant text := 'bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2';
  c_reg_pre  constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_acl      constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  for r in
    select p.oid, p.proname, encode(digest(p.prosrc,'sha256'),'hex') as h,
           pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
             || ' | secdef=' || p.prosecdef::text
             || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
             || ' | vol=' || p.provolatile::text
             || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                       from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)') as manif
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in ('play_game','register_win')
  loop
    v_attendu := case r.proname when 'play_game' then c_play_pre else c_reg_pre end;
    if r.h is distinct from v_attendu then
      raise exception using errcode='P0132',
        message = format('RETOUR ARRIERE : %s revenu a %s au lieu de %s. Transaction annulee.', r.proname, r.h, v_attendu);
    end if;
    if r.manif not like '% | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
      raise exception using errcode='P0132',
        message = format('RETOUR ARRIERE : manifeste de %s non conforme (%s). Transaction annulee.', r.proname, r.manif);
    end if;
    if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception using errcode='P0132',
        message = format('RETOUR ARRIERE : service_role a PERDU EXECUTE sur %s. Transaction annulee.', r.proname);
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception using errcode='P0132',
        message = format('RETOUR ARRIERE : anon ou authenticated a acquis EXECUTE sur %s. Transaction annulee.', r.proname);
    end if;
  end loop;

  -- Le retour arriere MONETAIRE ne doit jamais rouvrir la faille lot/jeu.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='register_win'
      and position('from prizes where id = p_prize_id and game_id = p_game_id;' in p.prosrc) > 0
      and position('where id = p_prize_id and game_id = p_game_id and quantity > 0;' in p.prosrc) > 0
  ) then
    raise exception using errcode='P0132',
      message = 'RETOUR ARRIERE : l''isolation lot/jeu a DISPARU de register_win. Transaction annulee — ce retour arriere ne doit jamais rouvrir le P0.';
  end if;

  raise notice 'RETOUR ARRIERE 20260819100000 : les deux corps sont revenus, l''isolation lot/jeu est intacte.';
end $verif$;
