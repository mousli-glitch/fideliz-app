/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — un joueur ne peut pas réclamer le lot d'un autre restaurant
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819080000_isolation_lot_jeu.sql`.
 *
 *  ─── L'ATTAQUE REPRODUITE ───
 *
 *  `registerWinnerAction` est l'action publique du parcours joueur : pas de
 *  garde de rôle — c'est normal, un client anonyme enregistre son gain — et
 *  elle transmet `data.prize_id` VERBATIM depuis le navigateur, à la clé de
 *  service. `register_win` chargeait le lot par son seul identifiant.
 *
 *  Un joueur pouvait donc poster SON jeu et le lot d'un CONFRÈRE. Mesuré
 *  avant correctif : stock du confrère 3 -> 2, ticket émis chez l'attaquant
 *  portant le libellé « MAGNUM DE CHAMPAGNE (lot de B) ».
 *
 *  `play_game` n'est pas concernée : elle choisit le lot elle-même parmi
 *  ceux du jeu et n'accepte aucun `p_prize_id`. Le cas 4 le vérifie.
 *
 *  ─── CE QUE CE HARNAIS EXIGE ───
 *
 *      1. l'attaque est REFUSÉE ;
 *      2. le stock du confrère est INTACT — un refus qui aurait quand même
 *         décrémenté ne vaudrait rien ;
 *      3. aucun ticket n'est créé chez l'attaquant ;
 *      4. le chemin LÉGITIME fonctionne toujours, avec le bon libellé — un
 *         correctif qui casse le produit n'est pas un correctif.
 *
 *  ─── GARDE DE CIBLE ───
 *
 *  Fail-closed et stricte : zéro utilisateur Auth, zéro profil, zéro
 *  restaurant, et absence préalable des identifiants synthétiques. Un simple
 *  plafond (« moins de N restaurants ») ne prouve rien : une base réelle
 *  jeune le passerait.
 *
 *  ATTENDU : les 6 constats conformes. Le verdict lève sinon.
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

-- ─── Garde de cible : identification, pas plafond ───
do $$
declare v_u int; v_p int; v_r int; v_collision int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants;
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception 'HARNAIS REFUSÉ : cible non vierge (% users, % profils, % restaurants). Ce harnais insère des fixtures : il ne doit jamais toucher une base porteuse de données.', v_u, v_p, v_r;
  end if;
  select count(*) into v_collision from public.restaurants
   where id in ('00000000-0000-4000-8000-0000000000A1','00000000-0000-4000-8000-0000000000B1');
  if v_collision <> 0 then
    raise exception 'HARNAIS REFUSÉ : les identifiants synthétiques existent déjà.';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.register_win(uuid,uuid,text,text,text,boolean)') is null then
    raise exception 'HARNAIS INAPPLICABLE : register_win absente.';
  end if;
end $$;

create temp table _iso (ordre int, constat text, attendu text, obtenu text, conforme boolean) on commit drop;

do $$
declare
  rA uuid := '00000000-0000-4000-8000-0000000000A1'; rB uuid := '00000000-0000-4000-8000-0000000000B1';
  gA uuid := '00000000-0000-4000-8000-0000000000A2'; gB uuid := '00000000-0000-4000-8000-0000000000B2';
  lA uuid := '00000000-0000-4000-8000-0000000000A3'; lB uuid := '00000000-0000-4000-8000-0000000000B3';
  v_res jsonb; v_ok jsonb; v_avant int; v_apres int; v_tickets int; v_label text;
begin
  insert into public.restaurants (id,name,slug) values (rA,'attaquant','attaquant'),(rB,'victime','victime');
  insert into public.games (id,restaurant_id,name,active_action,status,is_stock_limit_active,validity_days)
    values (gA,rA,'jeu-A','wheel','active',true,30),(gB,rB,'jeu-B','wheel','active',true,30);
  insert into public.prizes (id,game_id,label,weight,quantity) values
    (lA,gA,'Lot de A',100,10),(lB,gB,'MAGNUM DE CHAMPAGNE (lot de B)',100,3);

  select quantity into v_avant from public.prizes where id = lB;

  -- L'ATTAQUE : mon jeu, le lot du confrère.
  v_res := public.register_win(gA, lB, 'joueur@exemple.invalid', null, 'Joueur', false);

  select quantity into v_apres from public.prizes where id = lB;
  select count(*) into v_tickets from public.winners where game_id = gA;

  insert into _iso values (1,'l''attaque est refusée','success=false',
    coalesce(v_res->>'error','ACCEPTEE'), coalesce((v_res->>'success')::boolean,false) = false);
  insert into _iso values (2,'le stock du confrère est intact', v_avant::text, v_apres::text, v_apres = v_avant);
  insert into _iso values (3,'aucun ticket créé chez l''attaquant','0', v_tickets::text, v_tickets = 0);

  -- Le chemin LÉGITIME doit continuer de marcher.
  v_ok := public.register_win(gA, lA, 'legitime@exemple.invalid', null, 'Legitime', false);
  select prize_label_snapshot into v_label from public.winners
   where game_id = gA order by created_at desc limit 1;

  insert into _iso values (4,'le chemin légitime fonctionne','true',
    coalesce(v_ok->>'success','(nul)'), (v_ok->>'success')::boolean is true);
  insert into _iso values (5,'et fige le BON libellé','Lot de A',
    coalesce(v_label,'(aucun)'), v_label = 'Lot de A');

  -- `play_game` n'accepte aucun identifiant de lot : rien à détourner.
  insert into _iso values (6,'play_game ne reçoit aucun p_prize_id','aucun',
    case when pg_get_function_identity_arguments(
           to_regprocedure('public.play_game(uuid,text,text,text,boolean)')) ilike '%prize%'
         then 'en reçoit un' else 'aucun' end,
    pg_get_function_identity_arguments(
      to_regprocedure('public.play_game(uuid,text,text,text,boolean)')) not ilike '%prize%');
end $$;

do $$
declare v_n int; v_e int; v_l text;
begin
  select count(*) into v_n from _iso;
  if v_n <> 6 then raise exception 'HARNAIS ISOLATION : % constat(s), 6 attendus.', v_n; end if;
  select count(*), string_agg(ordre||'. '||constat||' : attendu '||attendu||', obtenu '||obtenu, E'\n' order by ordre)
    into v_e, v_l from _iso where conforme is distinct from true;
  if v_e > 0 then raise exception E'HARNAIS ISOLATION : % constat(s) NON CONFORME(S).\n%', v_e, v_l; end if;
  raise notice 'HARNAIS ISOLATION : les 6 constats sont conformes.';
end $$;

select ordre, constat, attendu, obtenu, conforme from _iso order by ordre;

rollback;
