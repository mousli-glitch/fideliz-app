/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  UN JEU 100 %-GAGNANT DOIT LE RESTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── POURQUOI CE HARNAIS EXISTE ───
 *
 * Mesuré le 19/08/2026 sur la production : **aucun jeu n'a un lot unique à
 * poids 100**. La conservation de ce cas ne peut donc pas être prouvée sur les
 * données réelles — et une case cochée « ça marchera » n'est pas une preuve.
 *
 * C'est pourtant le réglage le plus fragile du tirage. Le tirage pondéré de
 * `play_game` fait :
 *
 *     v_total := sum(weight) parmi les lots DISPONIBLES
 *     if v_total <= 0 then return stock_empty
 *     v_r := random() * v_total
 *     select id where cum >= v_r order by cum limit 1
 *
 * Avec un seul lot, trois choses peuvent mal tourner et ne se voient qu'ici :
 *
 *   1. `random()` rend [0,1) — donc `v_r` peut valoir exactement 0, et le
 *      `cum >= v_r` doit quand même désigner le lot. Une borne écrite `>`
 *      au lieu de `>=` laisserait `v_prize_id` à NULL sur un tirage sur mille
 *      environ, et rendrait `stock_empty` à un joueur d'un jeu où TOUT le
 *      monde gagne.
 *   2. Un lot à quantité nulle sort de la somme : le jeu devient légitimement
 *      `stock_empty`. Ce n'est pas un défaut — mais il faut prouver que ça
 *      n'arrive QUE là.
 *   3. Le stock doit décroître d'exactement un par gain. Jamais deux.
 *
 * ─── CE QUE CE FICHIER FAIT ───
 *
 * Il crée un jeu synthétique à UN SEUL LOT de poids 100, joue réellement
 * `play_game` un grand nombre de fois, et vérifie que le lot gagne à chaque
 * fois. Puis il refait la même chose sous limite de stock, et prouve que le
 * refus n'arrive qu'une fois le stock réellement épuisé.
 *
 * ⚠️ RÉSERVÉ À UNE CIBLE SYNTHÉTIQUE : il écrit des restaurants, des jeux, des
 * lots et des tickets. La garde d'ouverture refuse toute base portant un
 * compte Auth, un profil, ou un restaurant qui ne soit pas le sien.
 */

-- ═══ GARDE : cible synthétique uniquement ═══

do $$
declare
  v_u int; v_p int; v_r int;
  c_prefixe constant text := '00000000-0000-4000-8000-0000000091';
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants where id::text not like c_prefixe || '%';
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception using errcode = 'P9801',
      message = format('HARNAIS REFUSE : cible non synthetique (%s comptes Auth, %s profils, %s restaurants hors harnais). Ce fichier ecrit des jeux et des tickets.', v_u, v_p, v_r);
  end if;
end $$;

create temp table _cent (bloc text, cas text, attendu text, obtenu text, conforme boolean);

-- ═══ Fixture : un restaurant, un jeu, UN SEUL lot à poids 100 ═══

create or replace function pg_temp.poser(p_stock_actif boolean, p_quantite int)
returns void language plpgsql as $f$
declare
  vR uuid := '00000000-0000-4000-8000-000000009101';
  vG uuid := '00000000-0000-4000-8000-000000009102';
  vP uuid := '00000000-0000-4000-8000-000000009103';
begin
  delete from public.winners  where game_id = vG;
  delete from public.contacts where restaurant_id = vR;
  delete from public.prizes   where game_id = vG;
  delete from public.games    where id = vG;
  delete from public.restaurants where id = vR;

  insert into public.restaurants (id, name, slug) values (vR, 'resto-100-gagnant', 'resto-100-gagnant');
  insert into public.games (id, restaurant_id, name, active_action, status, validity_days,
                            min_spend, is_stock_limit_active)
    values (vG, vR, 'jeu-100-gagnant', 'wheel', 'active', 30, '0', p_stock_actif);
  insert into public.prizes (id, game_id, label, color, weight, quantity, initial_quantity)
    values (vP, vG, 'Le seul lot', '#000000', 100, p_quantite, p_quantite);
end $f$;

-- ═══ Bloc 1 : sans limite de stock, TOUT LE MONDE gagne ═══

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009102';
  vP uuid := '00000000-0000-4000-8000-000000009103';
  i int; vJson jsonb;
  v_gagnes int := 0; v_refus int := 0; v_autre_lot int := 0;
  c_tirages constant int := 120;
begin
  perform pg_temp.poser(false, null);

  for i in 1 .. c_tirages loop
    vJson := public.play_game(vG, 'cent-' || i || '@harnais.test', null, 'Harnais', false);
    if vJson->>'success' = 'true' then
      v_gagnes := v_gagnes + 1;
      if (vJson->>'prize_id')::uuid is distinct from vP then v_autre_lot := v_autre_lot + 1; end if;
    else
      v_refus := v_refus + 1;
    end if;
  end loop;

  insert into _cent values ('sans limite de stock', format('%s tirages, autant de gains', c_tirages),
    c_tirages::text, v_gagnes::text, v_gagnes = c_tirages);

  insert into _cent values ('sans limite de stock', 'aucun refus',
    '0', v_refus::text, v_refus = 0);

  /*
   * LE CAS QUI PORTE TOUT. Un seul lot : il doit sortir a chaque fois. Un
   * `v_prize_id` a NULL sur un tirage limite rendrait `stock_empty` a un
   * joueur d'un jeu ou tout le monde gagne — le defaut le plus humiliant
   * possible, et le plus rare a reproduire a la main.
   */
  insert into _cent values ('sans limite de stock', 'jamais un autre lot que le seul existant',
    '0', v_autre_lot::text, v_autre_lot = 0);

  insert into _cent values ('sans limite de stock', 'un ticket par gain',
    c_tirages::text, (select count(*)::text from public.winners where game_id = vG),
    (select count(*) from public.winners where game_id = vG) = c_tirages);

  /* Sans limite de stock, la quantite reste NULL — jamais decrementee. */
  insert into _cent values ('sans limite de stock', 'le stock illimite reste illimite',
    'NULL', coalesce((select quantity::text from public.prizes where id = vP), 'NULL'),
    (select quantity from public.prizes where id = vP) is null);
end $$;

-- ═══ Bloc 2 : sous limite de stock, le refus n'arrive qu'à l'épuisement ═══

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009102';
  vP uuid := '00000000-0000-4000-8000-000000009103';
  i int; vJson jsonb;
  v_gagnes int := 0; v_refus int := 0; v_premier_refus int := null;
  c_stock constant int := 12;
  c_tirages constant int := 20;
begin
  perform pg_temp.poser(true, c_stock);

  for i in 1 .. c_tirages loop
    vJson := public.play_game(vG, 'stock-' || i || '@harnais.test', null, 'Harnais', false);
    if vJson->>'success' = 'true' then
      v_gagnes := v_gagnes + 1;
    else
      v_refus := v_refus + 1;
      if v_premier_refus is null then v_premier_refus := i; end if;
      insert into _cent values ('sous limite de stock', format('refus n°%s : le motif est bien l''epuisement', v_refus),
        'stock_empty', coalesce(vJson->>'error','(aucun)'), vJson->>'error' = 'stock_empty');
    end if;
  end loop;

  insert into _cent values ('sous limite de stock', format('exactement %s gains, un par unite', c_stock),
    c_stock::text, v_gagnes::text, v_gagnes = c_stock);

  /*
   * Le premier refus doit tomber au tirage c_stock+1, pas avant. Un refus
   * anticipe voudrait dire qu'un tirage a consomme deux unites, ou qu'une
   * borne du tirage ponderé a lache.
   */
  insert into _cent values ('sous limite de stock', 'le premier refus tombe au tirage suivant l''epuisement',
    (c_stock + 1)::text, coalesce(v_premier_refus::text, '(aucun refus)'),
    v_premier_refus = c_stock + 1);

  insert into _cent values ('sous limite de stock', 'le stock finit a zero, jamais en negatif',
    '0', coalesce((select quantity::text from public.prizes where id = vP), 'NULL'),
    (select quantity from public.prizes where id = vP) = 0);

  insert into _cent values ('sous limite de stock', 'autant de tickets que d''unites',
    c_stock::text, (select count(*)::text from public.winners where game_id = vG),
    (select count(*) from public.winners where game_id = vG) = c_stock);
end $$;

-- ═══ Bloc 3 : le stock à zéro dès le départ refuse, sans rien émettre ═══

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009102';
  vJson jsonb;
begin
  perform pg_temp.poser(true, 0);
  vJson := public.play_game(vG, 'vide@harnais.test', null, 'Harnais', false);

  insert into _cent values ('stock nul au depart', 'le jeu refuse',
    'stock_empty', coalesce(vJson->>'error','(succes)'), vJson->>'error' = 'stock_empty');

  insert into _cent values ('stock nul au depart', 'aucun ticket emis',
    '0', (select count(*)::text from public.winners where game_id = vG),
    (select count(*) from public.winners where game_id = vG) = 0);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  POLARITÉ NÉGATIVE — CE HARNAIS SAIT-IL MORDRE ?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dix-neuf contrôles verts du premier coup, sur un chemin qu'aucune donnée
-- réelle n'emprunte : il faut montrer que ce vert veut dire quelque chose.
--
-- On dégrade `play_game` pour qu'elle retire DEUX unités de stock au lieu
-- d'une, on rejoue le bloc du stock, et on exige que les assertions virent au
-- rouge. Puis on restaure, vérifié par empreinte.

create temp table _neg (cas text, attendu text, obtenu text, conforme boolean);

create temp table _sauve as
select pg_get_functiondef(p.oid) as def, encode(digest(p.prosrc,'sha256'),'hex') as empreinte
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='play_game';

do $$
declare v_def text; v_h text;
begin
  select def into v_def from _sauve;
  v_def := replace(v_def,
    'update prizes set quantity = quantity - 1 where id = v_prize_id and quantity > 0;',
    'update prizes set quantity = quantity - 2 where id = v_prize_id and quantity > 0;');
  execute v_def;
  select encode(digest(p.prosrc,'sha256'),'hex') into v_h from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='play_game';
  if v_h = (select empreinte from _sauve) then
    raise exception using errcode = 'P9804',
      message = 'La degradation n''a pas pris (empreinte inchangee) : le motif de substitution ne correspond plus au corps deploye. Corriger le harnais, pas la fonction.';
  end if;
end $$;

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009102';
  vP uuid := '00000000-0000-4000-8000-000000009103';
  i int; vJson jsonb;
  v_gagnes int := 0; v_premier_refus int := null;
  c_stock constant int := 12;
begin
  perform pg_temp.poser(true, c_stock);

  for i in 1 .. 20 loop
    vJson := public.play_game(vG, 'neg-' || i || '@harnais.test', null, 'Harnais', false);
    if vJson->>'success' = 'true' then v_gagnes := v_gagnes + 1;
    elsif v_premier_refus is null then v_premier_refus := i; end if;
  end loop;

  insert into _neg values ('exactement 12 gains, un par unite', '12', v_gagnes::text, v_gagnes = 12);
  insert into _neg values ('le premier refus tombe au tirage suivant l''epuisement', '13',
    coalesce(v_premier_refus::text,'(aucun)'), v_premier_refus = 13);

  /*
   * CELUI-CI RESTE VERT, ET C'EST INSTRUCTIF : 12 − 2×6 = 0 exactement. Le
   * stock final atterrit sur zéro malgré le défaut. C'est pourquoi le NOMBRE
   * DE GAINS porte la preuve, et pas l'état final du compteur — un invariant
   * de fin peut être satisfait par un chemin faux.
   */
  insert into _neg values ('le stock finit a zero, jamais en negatif', '0',
    coalesce((select quantity::text from public.prizes where id = vP),'NULL'),
    (select quantity from public.prizes where id = vP) = 0);
end $$;

do $$
declare v_h text;
begin
  execute (select def from _sauve);
  select encode(digest(p.prosrc,'sha256'),'hex') into v_h from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='play_game';
  if v_h is distinct from (select empreinte from _sauve) then
    raise exception using errcode = 'P9805',
      message = format('RESTAURATION INCOMPLETE : %s au lieu de %s. Intervention manuelle requise.', v_h, (select empreinte from _sauve));
  end if;
end $$;

do $$
declare v_rouges int;
begin
  select count(*) filter (where not conforme) into v_rouges from _neg;
  if v_rouges < 2 then
    raise exception using errcode = 'P9806',
      message = format('HARNAIS 100%%-GAGNANT : la degradation n''a fait virer que %s controle(s) au rouge. Un harnais qui ne voit pas un decrement double ne mesure rien.', v_rouges);
  end if;
end $$;

-- ═══ Nettoyage ═══

do $$
declare
  vR uuid := '00000000-0000-4000-8000-000000009101';
  vG uuid := '00000000-0000-4000-8000-000000009102';
begin
  delete from public.winners  where game_id = vG;
  delete from public.contacts where restaurant_id = vR;
  delete from public.prizes   where game_id = vG;
  delete from public.games    where id = vG;
  delete from public.restaurants where id = vR;
end $$;

-- ═══ Verdict, fail-closed ═══

do $$
declare v_c int; v_t int; v_e text;
begin
  select count(*) filter (where conforme), count(*),
         string_agg(bloc || ' / ' || cas || ' : attendu ' || attendu || ', obtenu ' || obtenu, E'\n')
           filter (where not conforme)
    into v_c, v_t, v_e from _cent;

  if v_t < 12 then
    raise exception using errcode = 'P9802',
      message = format('HARNAIS 100%%-GAGNANT : seulement %s controles executes. Un harnais qui ne mesure presque rien passe au vert pour de mauvaises raisons.', v_t);
  end if;

  if v_c <> v_t then
    raise exception using errcode = 'P9803',
      message = format(E'HARNAIS 100%%-GAGNANT : %s/%s conformes.\n%s', v_c, v_t, v_e);
  end if;

  raise notice 'HARNAIS 100%%-GAGNANT : %/% conformes.', v_c, v_t;
end $$;

select bloc, cas, attendu, obtenu, conforme from _cent order by bloc, cas;
