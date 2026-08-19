/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — enregistrer un jeu sans toucher celui d'un autre, ni perdre ses lots
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819030000_enregistrement_atomique_du_jeu.sql`, à
 *  appliquer avant de jouer ce fichier.
 *
 *  ─── LE DÉFAUT QUE CE HARNAIS REPRODUIT ───
 *
 *  `updateGameAction` visait `gameId` sans jamais le borner au restaurant
 *  autorisé. Un restaurateur légitime pouvait annoncer SON restaurant et
 *  fournir le jeu d'un CONFRÈRE : réglages modifiés, lots supprimés. Le cas 2
 *  le rejoue, et vérifie que le confrère conserve son nom de jeu ET ses lots.
 *
 *  ─── ET CELUI QU'ON NE VOIT QU'EN L'ÉPROUVANT ───
 *
 *  Le modèle DELETE-puis-INSERT en deux requêtes HTTP : un INSERT qui échoue
 *  après un DELETE réussi perd TOUS les lots, définitivement. Les cas 4 à 7
 *  envoient des charges invalides et vérifient à chaque fois le COMPTE DE
 *  LOTS AVANT ET APRÈS. Un refus qui laisserait le jeu vide serait rouge.
 *
 *  ─── LA RÈGLE DES 100 % ───
 *
 *  Elle ne vivait que dans les deux composants de page. Une requête qui ne
 *  passe pas par l'écran ne la rencontrait jamais. Cas 4.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Une transaction, annulée à la fin. Garde de cible synthétique avant toute
 *  mutation. Aucune adresse réelle : domaine réservé `.invalid` (RFC 2606).
 *
 *  ATTENDU : 10 cas, tous conformes. Le verdict LÈVE sinon.
 *
 *  ─── SECONDE VAGUE, MIGRATION 20260819050000 ───
 *
 *  Deux défauts de plus, signalés au tour suivant et éprouvés par
 *  `harnais-agregat-jeu.sql`, à côté : l'action complète n'était toujours pas
 *  atomique (le design du restaurant s'écrivait AVANT l'appel), et une saisie
 *  invalide devenait une valeur métier valide par coercition TypeScript.
 *
 *  Joué le 19/08/2026 sur la branche de test synthétique — les 10 cas
 *  conformes. Notamment :
 *
 *    2. sqlstate=P0112 ; lots confrere 2->2 ; nom confrere=jeu-b
 *    4. sqlstate=P0114 ; lots conserves 2->2
 *    5. sqlstate=P0113 ; lots 2->2
 *
 *  Ce harnais a trouvé un vrai défaut dans la fonction en la jouant :
 *  `games.bg_choice` est un INTEGER, pas un texte, et l'`update` échouait au
 *  cas nominal. Corrigé par un cast explicite, là où PostgREST coerçait tout
 *  seul. C'est exactement ce qu'un harnais non joué n'aurait pas vu.
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare v_u int; v_r int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_r from public.restaurants;
  if v_u > 0 or v_r > 500 then
    raise exception 'HARNAIS REFUSÉ : cible non synthétique (% users, % restos). Aucune mutation.', v_u, v_r;
  end if;
  raise notice 'GARDE CIBLE SYNTHÉTIQUE : OK.';
end $$;

-- Garde anti-dérive : sans la fonction, ce harnais n'éprouverait rien.
do $$
begin
  -- Signature ELARGIE par 20260819050000 (5e argument, whitelist restaurant).
  -- Les appels a quatre arguments restent valides : le 5e a une valeur par
  -- defaut. C'est la SIGNATURE qu'on verifie, pas le nombre d'arguments qu'on
  -- passe.
  if to_regprocedure('public.enregistrer_jeu_et_lots(uuid,uuid,jsonb,jsonb,jsonb)') is null then
    raise exception 'HARNAIS INAPPLICABLE : la fonction n''existe pas. Migrations 20260819030000 puis 20260819050000 non appliquées.';
  end if;
end $$;

create temp table _jeu (ordre int, cas text, conforme boolean, detail text) on commit drop;

do $$
declare
  vA uuid := '00000000-0000-4000-8000-0000000000a1';   -- restaurant A
  vB uuid := '00000000-0000-4000-8000-0000000000b1';   -- restaurant B, le confrère
  gA uuid := '00000000-0000-4000-8000-0000000000a2';
  gB uuid := '00000000-0000-4000-8000-0000000000b2';
  jeu  jsonb := jsonb_build_object('name','jeu-modifie','active_action','wheel',
                                   'action_url','https://exemple.invalid','validity_days',7,'min_spend','0');
  bons jsonb := jsonb_build_array(
    jsonb_build_object('label','Lot 1','weight',60),
    jsonb_build_object('label','Lot 2','weight',40));
  v_code text; v_n int; v_avant int; v_nom text;
begin
  insert into public.restaurants (id,name,slug) values (vA,'resto-a','resto-a'), (vB,'resto-b','resto-b');
  insert into public.games (id,restaurant_id,name,active_action,status)
    values (gA,vA,'jeu-a','wheel','active'), (gB,vB,'jeu-b','wheel','active');
  insert into public.prizes (id,game_id,label,weight) values
    (gen_random_uuid(),gA,'origine-a',100),
    (gen_random_uuid(),gB,'origine-b-1',50),
    (gen_random_uuid(),gB,'origine-b-2',50);

  -- 1. Le cas nominal doit passer : un harnais qui ne teste que les refus
  --    resterait vert sur une fonction qui refuse tout.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, bons);
    select count(*) into v_n from public.prizes where game_id = gA;
    select name into v_nom from public.games where id = gA;
    insert into _jeu values (1,'cas nominal : jeu et lots enregistres',
      v_n = 2 and v_nom = 'jeu-modifie', format('%s lot(s), nom=%s', v_n, v_nom));
  exception when others then
    insert into _jeu values (1,'cas nominal : jeu et lots enregistres', false, sqlstate||' '||sqlerrm);
  end;

  -- 2. LE P0 : le jeu d'un confrère, annoncé avec son propre restaurant.
  select count(*) into v_avant from public.prizes where game_id = gB;
  begin
    perform public.enregistrer_jeu_et_lots(gB, vA, jeu, bons);
    insert into _jeu values (2,'jeu d''un autre tenant -> refus', false, 'ACCEPTE : le P0 est toujours ouvert');
  exception when others then
    v_code := sqlstate;
    select count(*) into v_n from public.prizes where game_id = gB;
    select name into v_nom from public.games where id = gB;
    insert into _jeu values (2,'jeu d''un autre tenant -> refus',
      v_code = 'P0112' and v_n = v_avant and v_nom = 'jeu-b',
      format('sqlstate=%s ; lots confrere %s->%s ; nom confrere=%s', v_code, v_avant, v_n, v_nom));
  end;

  -- 3. Jeu introuvable : refus distinct du refus de tenant.
  begin
    perform public.enregistrer_jeu_et_lots(gen_random_uuid(), vA, jeu, bons);
    insert into _jeu values (3,'jeu introuvable -> refus', false, 'accepte');
  exception when others then
    insert into _jeu values (3,'jeu introuvable -> refus', sqlstate = 'P0111', 'sqlstate='||sqlstate);
  end;

  -- 4. La règle des 100 %, et la conservation des lots existants.
  select count(*) into v_avant from public.prizes where game_id = gA;
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Trop peu','weight',3)));
    insert into _jeu values (4,'total des poids <> 100 -> refus', false, 'accepte');
  exception when others then
    v_code := sqlstate;
    select count(*) into v_n from public.prizes where game_id = gA;
    insert into _jeu values (4,'total des poids <> 100 -> refus',
      v_code = 'P0114' and v_n = v_avant,
      format('sqlstate=%s ; lots conserves %s->%s', v_code, v_avant, v_n));
  end;

  -- 5. ATOMICITÉ : un lot invalide en DEUXIÈME position. Sans transaction,
  --    le DELETE aurait déjà eu lieu quand l'INSERT échoue.
  select count(*) into v_avant from public.prizes where game_id = gA;
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, jsonb_build_array(
      jsonb_build_object('label','Bon','weight',50),
      jsonb_build_object('label','','weight',50)));
    insert into _jeu values (5,'lot invalide -> aucun lot perdu', false, 'accepte');
  exception when others then
    v_code := sqlstate;
    select count(*) into v_n from public.prizes where game_id = gA;
    insert into _jeu values (5,'lot invalide -> aucun lot perdu',
      v_code = 'P0113' and v_n = v_avant,
      format('sqlstate=%s ; lots %s->%s', v_code, v_avant, v_n));
  end;

  -- 6. Une liste vide ne doit pas vider le jeu.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, '[]'::jsonb);
    insert into _jeu values (6,'aucun lot -> refus', false, 'accepte');
  exception when others then
    insert into _jeu values (6,'aucun lot -> refus', sqlstate = 'P0113', 'sqlstate='||sqlstate);
  end;

  -- 7. Stock non entier.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Lot','weight',100,'quantity','beaucoup')));
    insert into _jeu values (7,'stock non entier -> refus', false, 'accepte');
  exception when others then
    insert into _jeu values (7,'stock non entier -> refus', sqlstate = 'P0113', 'sqlstate='||sqlstate);
  end;

  -- 8. Stock vide = illimité (null), jamais 0. Un 0 rendrait le lot
  --    inatteignable au lieu de l'ouvrir.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu,
      jsonb_build_array(jsonb_build_object('label','Illimite','weight',100,'quantity',null)));
    select count(*) into v_n from public.prizes where game_id = gA and quantity is null;
    insert into _jeu values (8,'stock vide = illimite (null), jamais 0', v_n = 1, format('%s lot(s) a stock null', v_n));
  exception when others then
    insert into _jeu values (8,'stock vide = illimite (null), jamais 0', false, sqlstate||' '||sqlerrm);
  end;

  -- 9. Idempotence : le remplacement est une substitution, pas un ajout.
  begin
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, bons);
    perform public.enregistrer_jeu_et_lots(gA, vA, jeu, bons);
    select count(*) into v_n from public.prizes where game_id = gA;
    insert into _jeu values (9,'rejouer le meme appel : meme etat final', v_n = 2, format('%s lot(s)', v_n));
  exception when others then
    insert into _jeu values (9,'rejouer le meme appel : meme etat final', false, sqlstate||' '||sqlerrm);
  end;

  -- 10. Bilan du confrère, après TOUT le harnais.
  select count(*) into v_n from public.prizes where game_id = gB;
  insert into _jeu values (10,'les lots du confrere sont intacts au terme du harnais', v_n = 2, format('%s lot(s)', v_n));
end $$;

-- VERDICT fail-closed : un cas non joué n'est pas un cas réussi.
do $$
declare v_n int; v_echecs int; v_liste text;
begin
  select count(*) into v_n from _jeu;
  if v_n <> 10 then
    raise exception 'HARNAIS JEU : % cas enregistre(s), 10 attendus.', v_n;
  end if;
  select count(*), string_agg(ordre||'. '||cas||' - '||detail, E'\n' order by ordre)
    into v_echecs, v_liste from _jeu where conforme is distinct from true;
  if v_echecs > 0 then
    raise exception E'HARNAIS JEU : % cas NON CONFORME(S).\n%', v_echecs, v_liste;
  end if;
  raise notice 'HARNAIS JEU : les 10 cas sont conformes.';
end $$;

select ordre, cas, conforme, detail from _jeu order by ordre;

rollback;
