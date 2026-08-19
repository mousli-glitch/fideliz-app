/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LES LECTEURS APPLIQUENT ENFIN LE MINIMUM QU'ILS AFFICHENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── CE QUI RESTAIT OUVERT ───
 *
 * Les migrations 060000 / 070000 / 090000 ont fermé le contrat monétaire du
 * côté ÉCRITURE : grammaire stricte, colonnes canoniques en centimes, double
 * écriture. Elles n'ont rien changé du côté APPLICATION.
 *
 * `play_game` et `register_win` lisent toujours :
 *
 *     v_min_spend := coalesce((case when v_game.min_spend ~ '^[0-9]+$'
 *                              then v_game.min_spend::int else 0 end), 0);
 *
 * Un jeu réglé à 5,90 € porte `min_spend = '5,90'`. Cette valeur ne satisfait
 * pas `^[0-9]+$`. Le `else 0` en fait « aucun minimum » — et c'est ce zéro
 * que le scanner du restaurateur affiche au moment de valider le ticket :
 *
 *     Minimum de commande        Aucun
 *
 * Pendant que le client, lui, a bien lu « Présenter un ticket de consommation
 * de 5,90 € minimum » sur la roue. La condition existe pour celui qui la
 * subit et disparaît pour celui qui l'applique.
 *
 * Mesuré en production le 19/08/2026 : un jeu actif dans ce cas.
 *
 * ─── CE QUE CETTE MIGRATION CHANGE ───
 *
 * 1. Les deux fonctions lisent par `minimum_effectif_centimes` — l'ordre
 *    canonique, le même pour tous les lecteurs : snapshot, puis champ
 *    canonique, puis texte historique lu STRICTEMENT.
 *
 * 2. Elles ÉCRIVENT `winners.min_spend_cents_snapshot`. Le minimum d'un
 *    ticket est désormais figé à l'émission, comme l'est déjà le libellé du
 *    lot : modifier le jeu ne réécrit plus rétroactivement la condition d'un
 *    ticket déjà remis à un client.
 *
 * 3. Elles rendent `min_spend_cents` — la valeur canonique — en plus de
 *    `min_spend`.
 *
 * ─── L'UNITÉ DE `min_spend` NE CHANGE PAS ───
 *
 * C'est la règle qui a fait de ce basculement un lot à part : ne jamais
 * changer silencieusement l'unité d'un champ existant.
 *
 * `min_spend` valait des EUROS dans la charge JSON rendue. Il vaut toujours
 * des EUROS. Ce qui change, c'est qu'il cesse d'être FAUX : un jeu à 5,90 €
 * rendait `0`, il rend maintenant `5.90`. La précision passe d'entier à
 * décimal — dans la MÊME unité. Un consommateur qui affichait « X € » affiche
 * désormais le bon X.
 *
 * `min_spend_cents` est ajouté à côté, et c'est lui la référence.
 *
 * ─── INDÉTERMINÉ N'EST PAS ZÉRO ───
 *
 * Si le minimum est illisible, les deux champs valent `null`, jamais `0`.
 * Zéro veut dire « aucun minimum » ; `null` veut dire « on ne sait pas ».
 * Confondre les deux est exactement le défaut qu'on ferme ici — il serait
 * absurde de le réintroduire dans le correctif.
 *
 * ─── POURQUOI UN REMPLACEMENT COMPLET, ET NON UN PATCH CHIRURGICAL ───
 *
 * Le hotfix d'isolation lot/jeu remplaçait deux fragments : un patch borné y
 * était le bon outil. Ici le corps change en plusieurs endroits — variables,
 * lecture, `insert`, valeur de retour. Substituer des chaînes dans un texte
 * inconnu serait fragile.
 *
 * Le corps est donc écrit ICI, en entier, et c'est lui qui est déployé. Mais
 * la prudence du patch borné est conservée : la migration REFUSE de s'exécuter
 * si le corps déployé n'est pas l'un des deux qu'elle connaît — celui d'avant,
 * ou le sien. Elle ne recouvre jamais un état qu'elle n'a pas audité.
 *
 * ─── PRÉIMAGES ATTENDUES ───
 *
 *   play_game     bd472a31…  4227 caractères  (baseline, lecture `^[0-9]+$`)
 *   register_win  32a32389…  3600 caractères  (après le hotfix isolation
 *                                              lot/jeu du 19/08/2026)
 *
 * Ces deux empreintes ont été relevées le 19/08/2026 sur la production ET sur
 * la branche synthétique : elles coïncident.
 *
 * ─── CE QUE CETTE MIGRATION NE FAIT PAS ───
 *
 * Elle ne touche AUCUNE donnée. Aucun `insert`, `update` ou `delete` sur une
 * table métier ; ni jeu, ni lot, ni ticket, ni contact. Les tickets déjà émis
 * gardent `min_spend_cents_snapshot` à `null` et continuent d'être lus sur le
 * jeu, exactement comme avant. La reprise de ces tickets est un migrateur
 * séparé, en dry-run, non joué.
 *
 * Elle ne touche pas non plus le tirage, l'anti-rejeu, le stock ou le rate
 * limit : seules les lignes qui portent le montant changent.
 *
 * ─── DÉPENDANCE D'ORDRE ───
 *
 * Exige 20260819060000 (colonnes canoniques + `minimum_effectif_centimes`).
 * La migration le VÉRIFIE et refuse sinon — sans cette garde, un déploiement
 * dans le désordre casserait `play_game`, donc le parcours joueur.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer et prouver, puis ATTENDRE son accord
 * explicite avant toute application réelle.
 *
 * MIGRATION ADDITIVE : aucune table, aucune colonne, aucune donnée. Seuls
 * deux corps de fonction changent, et leurs droits sont reposés à l'identique.
 */

-- ═══════════════════════════════════════════════════════════════════════════
--  GARDE D'ORDRE ET DE PRÉIMAGE — AVANT LA MOINDRE MUTATION
-- ═══════════════════════════════════════════════════════════════════════════

do $garde$
declare
  v_manquant text := '';
  v_h        text;
  v_n        int;

  c_play_pre  constant text := 'bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2';
  c_play_post constant text := '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d';
  c_reg_pre   constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_reg_post  constant text := '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd';

  c_play_sig constant text := 'p_game_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_reg_sig  constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
begin
  -- ── Dépendance d'ordre : 20260819060000 doit être passée ──
  if to_regprocedure('public.minimum_effectif_centimes(integer,integer,text)') is null then
    v_manquant := v_manquant || ' minimum_effectif_centimes';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='games' and column_name='min_spend_cents') then
    v_manquant := v_manquant || ' games.min_spend_cents';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then
    v_manquant := v_manquant || ' winners.min_spend_cents_snapshot';
  end if;
  if v_manquant <> '' then
    raise exception using errcode = 'P0131',
      message = 'LECTEURS MONETAIRES : dependance manquante ->' || v_manquant
             || '. La migration 20260819060000 doit etre appliquee AVANT celle-ci. Rien n''est modifie.';
  end if;

  -- ── play_game : une seule, la bonne signature, un corps connu ──
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='play_game';
  if v_n <> 1 then
    raise exception using errcode = 'P0131',
      message = format('LECTEURS MONETAIRES : %s fonction(s) public.play_game, 1 attendue.', v_n);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='play_game'
    and pg_get_function_identity_arguments(p.oid) = c_play_sig;
  if v_h is null then
    raise exception using errcode = 'P0131',
      message = 'LECTEURS MONETAIRES : signature de play_game inattendue. Rien n''est modifie.';
  end if;
  if v_h not in (c_play_pre, c_play_post) then
    raise exception using errcode = 'P0131',
      message = format('LECTEURS MONETAIRES : corps de play_game inconnu (empreinte %s). Ni la version auditee, ni la corrigee. Un etat inconnu ne se recouvre pas.', v_h);
  end if;

  -- ── register_win : idem ──
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_win';
  if v_n <> 1 then
    raise exception using errcode = 'P0131',
      message = format('LECTEURS MONETAIRES : %s fonction(s) public.register_win, 1 attendue.', v_n);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_win'
    and pg_get_function_identity_arguments(p.oid) = c_reg_sig;
  if v_h is null then
    raise exception using errcode = 'P0131',
      message = 'LECTEURS MONETAIRES : signature de register_win inattendue. Rien n''est modifie.';
  end if;
  if v_h not in (c_reg_pre, c_reg_post) then
    raise exception using errcode = 'P0131',
      message = format('LECTEURS MONETAIRES : corps de register_win inconnu (empreinte %s). Ni la version post-hotfix auditee, ni la corrigee. Un etat inconnu ne se recouvre pas.', v_h);
  end if;
end $garde$;

-- ═══════════════════════════════════════════════════════════════════════════
--  play_game
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_min_cents int;
  v_min_euros numeric;
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

  -- Le minimum, dans l'ordre canonique. Illisible rend NULL, jamais zéro.
  v_min_cents := minimum_effectif_centimes(null, v_game.min_spend_cents, v_game.min_spend);
  v_min_euros := case when v_min_cents is null then null else round(v_min_cents / 100.0, 2) end;

  insert into winners (game_id, prize_id, email, phone, first_name, marketing_optin, prize_label_snapshot, min_spend_cents_snapshot, expires_at, status, assigned_action)
  values (p_game_id, v_prize_id, p_email, p_phone, p_first_name, p_marketing_optin, coalesce(v_prize.label,'Lot'), v_min_cents, v_expires_at, 'available', v_assigned)
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
    'prize_id', v_prize_id, 'prize_label', coalesce(v_prize.label,'Lot'), 'expires_at', v_expires_at,
    'min_spend', v_min_euros, 'min_spend_cents', v_min_cents);
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
--  register_win  (l'isolation lot/jeu du hotfix est CONSERVÉE à l'identique)
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_min_cents int;
  v_min_euros numeric;
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

  -- Le minimum, dans l'ordre canonique. Illisible rend NULL, jamais zéro.
  v_min_cents := minimum_effectif_centimes(null, v_game.min_spend_cents, v_game.min_spend);
  v_min_euros := case when v_min_cents is null then null else round(v_min_cents / 100.0, 2) end;

  insert into winners (game_id, prize_id, email, phone, first_name, marketing_optin, prize_label_snapshot, min_spend_cents_snapshot, expires_at, status, assigned_action)
  values (p_game_id, p_prize_id, p_email, p_phone, p_first_name, p_marketing_optin, coalesce(v_prize.label,'Lot'), v_min_cents, v_expires_at, 'available', v_assigned)
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
    'expires_at', v_expires_at, 'min_spend', v_min_euros, 'min_spend_cents', v_min_cents);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'already_played');
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
--  DROITS — reposés explicitement, jamais hérités d'une migration antérieure
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.play_game(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.play_game(uuid, text, text, text, boolean) to service_role;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION FINALE, DANS LA MÊME TRANSACTION, APRÈS LES DROITS
-- ═══════════════════════════════════════════════════════════════════════════

do $verif$
declare
  r record;
  v_attendu text;
  c_play_post constant text := '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d';
  c_reg_post  constant text := '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd';
  c_acl       constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  for r in
    select p.oid, p.proname,
           encode(digest(p.prosrc,'sha256'),'hex') as h,
           pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
             || ' | secdef=' || p.prosecdef::text
             || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
             || ' | vol=' || p.provolatile::text
             || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                       from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)') as manif
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in ('play_game','register_win')
  loop
    v_attendu := case r.proname when 'play_game' then c_play_post else c_reg_post end;
    if r.h is distinct from v_attendu then
      raise exception using errcode = 'P0131',
        message = format('LECTEURS MONETAIRES : postimage de %s inattendu (%s au lieu de %s). Transaction annulee.',
                         r.proname, r.h, v_attendu);
    end if;
    if r.manif not like '% | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
      raise exception using errcode = 'P0131',
        message = format('LECTEURS MONETAIRES : manifeste de %s non conforme (%s). Transaction annulee.', r.proname, r.manif);
    end if;
    if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception using errcode = 'P0131',
        message = format('LECTEURS MONETAIRES : service_role a PERDU EXECUTE sur %s. Transaction annulee — le parcours joueur serait casse.', r.proname);
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception using errcode = 'P0131',
        message = format('LECTEURS MONETAIRES : anon ou authenticated a acquis EXECUTE sur %s. Transaction annulee.', r.proname);
    end if;
  end loop;

  -- L'isolation lot/jeu du hotfix doit AVOIR SURVÉCU au remplacement complet.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='register_win'
      and position('from prizes where id = p_prize_id and game_id = p_game_id;' in p.prosrc) > 0
      and position('where id = p_prize_id and game_id = p_game_id and quantity > 0;' in p.prosrc) > 0
  ) then
    raise exception using errcode = 'P0131',
      message = 'LECTEURS MONETAIRES : l''isolation lot/jeu a DISPARU de register_win. Transaction annulee — ce correctif ne doit jamais rouvrir le P0.';
  end if;

  raise notice 'LECTEURS MONETAIRES : les deux corps, leurs manifestes, leurs droits et l''isolation lot/jeu sont verifies dans la transaction.';
end $verif$;
