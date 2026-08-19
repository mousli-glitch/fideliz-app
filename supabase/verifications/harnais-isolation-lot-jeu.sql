/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — l'isolation lot/jeu, prouvée DANS LES DEUX POLARITÉS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819080000_isolation_lot_jeu.sql`.
 *
 *  ─── UN SEUL ORACLE, DEUX POLARITÉS ───
 *
 *  Signalé, à raison : un harnais qui prouve seulement le comportement APRÈS
 *  correction ne prouve pas que le contrat échoue avant. Et un runner négatif
 *  qui RECOPIE les assertions du positif finit toujours par en diverger.
 *
 *  Ce fichier n'a donc qu'UN oracle — `pg_temp.oracle_attaque()` — appelé
 *  deux fois : sur la préimage vulnérable, où il doit être ROUGE, puis sur le
 *  corrigé, où il doit être VERT. Les assertions ne sont écrites qu'une fois.
 *
 *  ─── L'ATTAQUE ───
 *
 *  `registerWinnerAction` est l'action publique du parcours joueur — sans
 *  garde de rôle, à raison — et transmet `data.prize_id` VERBATIM du
 *  navigateur à la clé de service. L'attaque poste donc SON jeu et le lot d'un
 *  CONFRÈRE.
 *
 *  ─── ⚠️ CE FICHIER MODIFIE LA FONCTION DÉPLOYÉE ───
 *
 *  Il bascule `register_win` entre préimage et corrigé pour prouver les deux
 *  polarités, et RESTAURE l'état corrigé à la fin. Il est donc réservé à une
 *  cible SYNTHÉTIQUE VIERGE, et sa garde le vérifie avant toute chose. Ne
 *  jamais l'exécuter sur une base en service : il y rendrait `register_win`
 *  temporairement vulnérable.
 *
 *  ATTENDU : oracle ROUGE sur la préimage, VERT sur le corrigé, état final
 *  POSTIMAGE. Le verdict lève sinon.
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

-- ─── Garde de cible : identification, pas plafond ───
do $$
declare v_u int; v_p int; v_r int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants;
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception 'HARNAIS REFUSÉ : cible non vierge (% utilisateurs Auth, % profils, % restaurants). Ce fichier rend temporairement register_win VULNÉRABLE : il ne doit jamais toucher une base en service.', v_u, v_p, v_r;
  end if;
end $$;

-- ─── La MACHINE D'ÉTAT, partagée avec la migration et le rollback ───
--
-- Mêmes empreintes, mêmes fragments, mêmes refus. Le harnais ne réimplémente
-- pas la transition : il l'exécute. Une divergence entre ce qu'on teste et ce
-- qu'on déploie serait le défaut le plus difficile à voir.

create or replace function pg_temp.transition_isolation(p_sens text) returns text
language plpgsql as $t$
declare
  v_src text; v_h text; v_def text; v_new text; v_hnew text;
  v_secdef boolean; v_config text; v_vol "char"; v_n int;
  c_sig  constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_pre  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_post constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_lot_v constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_lot_c constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_stk_v constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
  c_stk_c constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
  c_depart text; c_arrivee text; c_a text; c_b text; c_c text; c_d text;
begin
  if p_sens = 'appliquer' then
    c_depart := c_pre; c_arrivee := c_post; c_a := c_lot_v; c_b := c_lot_c; c_c := c_stk_v; c_d := c_stk_c;
  else
    c_depart := c_post; c_arrivee := c_pre; c_a := c_lot_c; c_b := c_lot_v; c_c := c_stk_c; c_d := c_stk_v;
  end if;
  select p.prosrc, encode(digest(p.prosrc,'sha256'),'hex'), pg_get_functiondef(p.oid),
         p.prosecdef, coalesce(array_to_string(p.proconfig,','),''), p.provolatile
    into v_src, v_h, v_def, v_secdef, v_config, v_vol
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='register_win'
    and pg_get_function_identity_arguments(p.oid) = c_sig;
  if v_src is null then return 'REFUS : introuvable'; end if;
  if not v_secdef or v_config is distinct from 'search_path=public' or v_vol <> 'v' then
    return 'REFUS : attributs inattendus'; end if;
  if v_h = c_arrivee then return 'NO-OP strict'; end if;
  if v_h <> c_depart then return 'REFUS : empreinte inconnue ' || left(v_h,12) || '...'; end if;
  v_n := (length(v_src) - length(replace(v_src, c_a, ''))) / length(c_a);
  if v_n <> 1 then return format('REFUS : chargement, %s occurrence(s)', v_n); end if;
  v_n := (length(v_src) - length(replace(v_src, c_c, ''))) / length(c_c);
  if v_n <> 1 then return format('REFUS : decrement, %s occurrence(s)', v_n); end if;
  v_new := replace(replace(v_def, c_a, c_b), c_c, c_d);
  execute v_new;
  select encode(digest(p.prosrc,'sha256'),'hex') into v_hnew from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_win';
  if v_hnew is distinct from c_arrivee then
    raise exception 'POSTIMAGE inattendu : % au lieu de %', v_hnew, c_arrivee; end if;
  return 'APPLIQUE';
end $t$;

-- ─── L'ORACLE, écrit UNE fois, appelé deux fois ───

create or replace function pg_temp.oracle_attaque() returns table(constat text, attendu text, obtenu text, conforme boolean)
language plpgsql as $o$
declare
  rA uuid := '00000000-0000-4000-8000-0000000000A1'; rB uuid := '00000000-0000-4000-8000-0000000000B1';
  gA uuid := '00000000-0000-4000-8000-0000000000A2'; gB uuid := '00000000-0000-4000-8000-0000000000B2';
  lA uuid := '00000000-0000-4000-8000-0000000000A3'; lB uuid := '00000000-0000-4000-8000-0000000000B3';
  v_res jsonb; v_ok jsonb; v_avant int; v_apres int; v_tickets int; v_label text;
begin
  -- Fixture recréée à chaque appel, puis annulée par le sous-bloc appelant.
  insert into public.restaurants (id,name,slug) values (rA,'attaquant','attaquant'),(rB,'victime','victime');
  insert into public.games (id,restaurant_id,name,active_action,status,is_stock_limit_active,validity_days)
    values (gA,rA,'jeu-A','wheel','active',true,30),(gB,rB,'jeu-B','wheel','active',true,30);
  insert into public.prizes (id,game_id,label,weight,quantity) values
    (lA,gA,'Lot de A',100,10),(lB,gB,'MAGNUM DE CHAMPAGNE (lot de B)',100,3);

  select quantity into v_avant from public.prizes where id = lB;
  v_res := public.register_win(gA, lB, 'joueur@exemple.invalid', null, 'Joueur', false);
  select quantity into v_apres from public.prizes where id = lB;
  select count(*) into v_tickets from public.winners where game_id = gA;

  constat := 'l''attaque inter-tenant est refusée'; attendu := 'refus';
  obtenu := coalesce(v_res->>'error','ACCEPTEE');
  conforme := coalesce((v_res->>'success')::boolean, false) = false; return next;

  constat := 'le stock du confrère est intact'; attendu := v_avant::text;
  obtenu := v_apres::text; conforme := v_apres = v_avant; return next;

  constat := 'aucun ticket créé chez l''attaquant'; attendu := '0';
  obtenu := v_tickets::text; conforme := v_tickets = 0; return next;

  -- Le chemin LÉGITIME doit rester vert dans les deux polarités : un
  -- correctif qui casse le produit n'est pas un correctif.
  v_ok := public.register_win(gA, lA, 'legitime@exemple.invalid', null, 'Legitime', false);
  select prize_label_snapshot into v_label from public.winners
   where game_id = gA order by created_at desc limit 1;

  constat := 'le chemin légitime fonctionne'; attendu := 'true';
  obtenu := coalesce(v_ok->>'success','(nul)');
  conforme := (v_ok->>'success')::boolean is true; return next;

  constat := 'et fige le BON libellé'; attendu := 'Lot de A';
  obtenu := coalesce(v_label,'(aucun)'); conforme := v_label = 'Lot de A'; return next;
end $o$;

create temp table _polarite (polarite text, conformes int, total int, detail text);

-- ─── Polarité 1 : sur la PRÉIMAGE vulnérable, l'oracle doit être ROUGE ───
do $$
declare v_c int; v_t int; v_d text;
begin
  begin
    -- On revient à la préimage le temps de l'épreuve.
    perform pg_temp.transition_isolation('annuler');
    select count(*) filter (where conforme), count(*),
           string_agg(constat || ' -> ' || obtenu, ' | ' order by constat)
      into v_c, v_t, v_d from pg_temp.oracle_attaque();
    raise exception using errcode = 'P9501', message = 'fin de la polarité vulnérable';
  exception when sqlstate 'P9501' then
    insert into _polarite values ('préimage vulnérable', v_c, v_t, v_d);
  end;
end $$;

-- ─── Polarité 2 : sur le CORRIGÉ, l'oracle doit être VERT ───
do $$
declare v_c int; v_t int; v_d text;
begin
  begin
    select count(*) filter (where conforme), count(*),
           string_agg(constat || ' -> ' || obtenu, ' | ' order by constat)
      into v_c, v_t, v_d from pg_temp.oracle_attaque();
    raise exception using errcode = 'P9502', message = 'fin de la polarité corrigée';
  exception when sqlstate 'P9502' then
    insert into _polarite values ('corrigé', v_c, v_t, v_d);
  end;
end $$;

-- ─── VERDICT ───
do $$
declare v_vuln_c int; v_vuln_t int; v_corr_c int; v_corr_t int;
begin
  select conformes, total into v_vuln_c, v_vuln_t from _polarite where polarite = 'préimage vulnérable';
  select conformes, total into v_corr_c, v_corr_t from _polarite where polarite = 'corrigé';

  if v_vuln_t is null or v_corr_t is null then
    raise exception 'HARNAIS ISOLATION : une polarité n''a pas été jouée.';
  end if;
  /*
   * Sur la préimage, les trois constats d'isolation DOIVENT échouer. S'ils
   * passaient, ce harnais ne prouverait rien — c'est exactement le mode de
   * panne d'un runner négatif complaisant.
   */
  if v_vuln_c >= v_vuln_t then
    raise exception 'HARNAIS ISOLATION : sur la PRÉIMAGE, %/% constats conformes — l''oracle ne détecte pas le défaut.', v_vuln_c, v_vuln_t;
  end if;
  if v_corr_c <> v_corr_t then
    raise exception 'HARNAIS ISOLATION : sur le CORRIGÉ, seulement %/% constats conformes.', v_corr_c, v_corr_t;
  end if;
  raise notice 'HARNAIS ISOLATION : préimage %/% (rouge attendu), corrigé %/% (vert).', v_vuln_c, v_vuln_t, v_corr_c, v_corr_t;
end $$;

-- ─── RESTAURATION : le fichier ne laisse jamais la base vulnérable ───
do $$
declare v_r text; v_etat text;
begin
  v_r := pg_temp.transition_isolation('appliquer');
  select case encode(digest(p.prosrc,'sha256'),'hex')
           when '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442' then 'POSTIMAGE'
           else 'ECART' end into v_etat
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='register_win';
  if v_etat <> 'POSTIMAGE' then
    raise exception 'HARNAIS ISOLATION : restauration incomplète — la fonction n''est PAS revenue au corrigé (%). Intervention manuelle requise.', v_etat;
  end if;
  insert into _polarite values ('restauration finale', 1, 1, 'corrigé rétabli — ' || v_r);
end $$;

select polarite, conformes, total, detail from _polarite order by polarite;
