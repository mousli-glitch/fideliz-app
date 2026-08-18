/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — la suppression d'un compte n'emporte aucun restaurant
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Signalé le 19/08/2026 : l'expérience qui a mis au jour le défaut le plus
 *  grave du chantier n'existait que dans un rapport. Une découverte de ce
 *  calibre doit rester REJOUABLE, pas racontée.
 *
 *  ─── CE QUE L'EXPÉRIENCE A MONTRÉ ───
 *
 *  `public.restaurants.user_id -> auth.users(id) ON DELETE CASCADE`.
 *  Les deux actions de suppression réattribuaient `created_by` et
 *  `owner_id`, jamais `user_id`. Mesuré, chaîne complète montée :
 *
 *      sans réattribution de user_id : resto=0 jeux=0 lots=0 gagnants=0
 *                                      contacts=0 avis=0
 *      avec réattribution            : resto=1 jeux=1 lots=1 gagnants=1
 *                                      contacts=1 avis=1
 *
 *  Un commercial supprimé effaçait donc un restaurant entier, ses jeux, ses
 *  lots, ses gagnants, ses clients et ses avis.
 *
 *  ─── SÉCURITÉ DE CE FICHIER ───
 *
 *  Tout se joue dans UNE transaction annulée à la fin : aucune ligne ne
 *  survit, même en cas de succès. Une garde de cible synthétique s'exécute
 *  AVANT la moindre mutation et fait échouer la transaction entière si la
 *  base ne ressemble pas à une branche de test. Aucun secret, aucune
 *  référence de projet, aucune adresse réelle : les identités portent le
 *  domaine réservé `.invalid` (RFC 2606), qui ne peut pas exister.
 *
 *  ─── GARDE ANTI-DÉRIVE ───
 *
 *  Le harnais relit `pg_constraint` et échoue si les invariants sur
 *  lesquels `lib/securite/suppression-compte.ts` s'appuie ont changé :
 *  si `restaurants.user_id` cessait d'être CASCADE, ou si `profiles.id`
 *  cessait de l'être (le second est ce qui rend la séquence rejouable
 *  après un échec Auth). Un correctif silencieux du schéma rendrait le
 *  code inutilement prudent ou dangereusement optimiste — dans les deux
 *  cas, il faut le savoir.
 *
 *  ─── DEUX DÉFAUTS DE CE HARNAIS, SIGNALÉS LE 19/08/2026 ET CORRIGÉS ───
 *
 *  1. LA GARDE RECONNAISSAIT UN NOM, PAS UNE SÉMANTIQUE. Elle cherchait
 *     `conname = 'restaurants_user_id_fkey'`. Or un nom de contrainte est
 *     décoratif : `alter table ... rename constraint` suffisait à faire
 *     rendre NULL au `select`, donc à passer par la branche « is distinct
 *     from true »… qui lève, d'accord — mais pour la mauvaise raison, et une
 *     contrainte RECRÉÉE sous un autre nom avec la MÊME sémantique aurait
 *     fait échouer un harnais pourtant valide. Symétriquement, une seconde
 *     FK ajoutée sur la même colonne avec une action différente n'était pas
 *     vue du tout.
 *
 *     La garde interroge désormais la sémantique : table source, colonnes
 *     source (dans l'ordre), table cible, colonnes cible, action ON DELETE
 *     — et la CARDINALITÉ EXACTE, c'est-à-dire qu'il existe une seule et
 *     unique FK partant de cette colonne. Le nom n'entre plus dans la
 *     décision.
 *
 *  2. LE MANIFESTE NE COMPARAIT RIEN. Il était calculé APRÈS l'expérience
 *     seulement — il n'y avait aucun « avant » à confronter, malgré le
 *     commentaire qui promettait la comparaison. Et son empreinte ne portait
 *     que `conname:confdeltype` : ni les tables, ni les colonnes. Une FK
 *     repointée vers une autre table, ou déplacée d'une colonne à une autre,
 *     donnait la MÊME empreinte.
 *
 *     Le manifeste est désormais canonique (source, colonnes, cible,
 *     colonnes, ON DELETE, ON UPDATE, plus le compte), capturé AVANT et
 *     APRÈS, et comparé par une assertion qui lève. Le nom en est
 *     volontairement absent : renommer ne doit rien changer, repointer doit
 *     tout changer.
 *
 *  ─── CE QUI PROUVE QUE CE HARNAIS N'EST PAS VIDE ───
 *
 *  `harnais-cascade-negatif.sql`, à côté. Il rejoue la séquence FAUTIVE et
 *  exige que les assertions d'ici se déclenchent. Un harnais qu'on a affaibli
 *  y devient rouge.
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

-- ─────────────────────────────────── garde : cible synthétique, avant tout

do $$
declare
  v_users int; v_profiles int; v_restaurants int;
begin
  select count(*) into v_users from auth.users;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_restaurants from public.restaurants;

  if v_users > 0 then
    raise exception 'HARNAIS REFUSÉ : % utilisateur(s) Auth présent(s) — cible non confirmée synthétique. Aucune mutation.', v_users;
  end if;
  if v_profiles > 0 or v_restaurants > 500 then
    raise exception 'HARNAIS REFUSÉ : volumes inattendus (% profils, % restaurants). Aucune mutation.', v_profiles, v_restaurants;
  end if;
  raise notice 'GARDE CIBLE SYNTHÉTIQUE : OK.';
end $$;

-- ───────────────────── manifeste canonique des FK : la SÉMANTIQUE, pas le nom
--
-- Le nom de contrainte est délibérément ABSENT de cette vue. Renommer une
-- contrainte ne change rien au comportement : ça ne doit donc rien changer au
-- manifeste. Repointer une FK vers une autre table, la déplacer d'une colonne
-- à une autre, ou changer son action : ça change tout, et ça doit se voir.
--
-- La vue est recalculée à chaque lecture — c'est ce qui permet de la
-- confronter à elle-même avant et après l'expérience.

create temp view _fk_canonique as
select src_ns.nspname || '.' || src.relname as source,
       (select string_agg(a.attname, ',' order by k.ord)
          from unnest(con.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as colonnes_source,
       tgt_ns.nspname || '.' || tgt.relname as cible,
       (select string_agg(a.attname, ',' order by k.ord)
          from unnest(con.confkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as colonnes_cible,
       con.confdeltype::text as on_delete,
       con.confupdtype::text as on_update
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
where con.contype = 'f'
  and ((tgt_ns.nspname = 'auth' and tgt.relname = 'users')
    or (tgt_ns.nspname = 'public' and tgt.relname in ('profiles', 'restaurants')));

-- ────────────────────────── garde anti-dérive : les invariants du code
--
-- Deux invariants, chacun vérifié DEUX FOIS : la sémantique attendue existe,
-- ET elle est la seule à partir de cette colonne. Le second contrôle est ce
-- qui manquait : une FK supplémentaire sur la même colonne, avec une autre
-- action, passait inaperçue.

do $$
declare
  v_conforme int;
  v_total    int;
begin
  -- restaurants.user_id -> auth.users(id), ON DELETE CASCADE, et rien d'autre.
  select count(*) into v_conforme from _fk_canonique
   where source = 'public.restaurants' and colonnes_source = 'user_id'
     and cible = 'auth.users' and colonnes_cible = 'id' and on_delete = 'c';
  select count(*) into v_total from _fk_canonique
   where source = 'public.restaurants' and colonnes_source = 'user_id';

  if v_conforme <> 1 then
    raise exception 'DÉRIVE : aucune FK public.restaurants(user_id) -> auth.users(id) ON DELETE CASCADE (% trouvée(s), 1 attendue). `suppression-compte.ts` réattribue cette colonne À CAUSE de cette cascade — si elle a disparu, relire le raisonnement avant de simplifier le code.', v_conforme;
  end if;
  if v_total <> 1 then
    raise exception 'DÉRIVE : % FK partent de public.restaurants(user_id), 1 attendue. Une contrainte supplémentaire sur la même colonne peut porter une autre action ON DELETE et invalider le raisonnement du code.', v_total;
  end if;

  -- profiles.id -> auth.users(id), ON DELETE CASCADE, et rien d'autre.
  select count(*) into v_conforme from _fk_canonique
   where source = 'public.profiles' and colonnes_source = 'id'
     and cible = 'auth.users' and colonnes_cible = 'id' and on_delete = 'c';
  select count(*) into v_total from _fk_canonique
   where source = 'public.profiles' and colonnes_source = 'id';

  if v_conforme <> 1 then
    raise exception 'DÉRIVE : aucune FK public.profiles(id) -> auth.users(id) ON DELETE CASCADE (% trouvée(s), 1 attendue). La séquence de suppression compte sur cette cascade pour emporter le profil, ce qui rend l''action rejouable après un échec Auth. Sans elle, le profil resterait orphelin.', v_conforme;
  end if;
  if v_total <> 1 then
    raise exception 'DÉRIVE : % FK partent de public.profiles(id), 1 attendue.', v_total;
  end if;

  raise notice 'GARDE ANTI-DÉRIVE : les deux invariants tiennent, sémantique et cardinalité vérifiées.';
end $$;

-- Manifeste lisible, pour l'humain qui lit la sortie.
select source, colonnes_source, cible, colonnes_cible,
       case on_delete when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
from _fk_canonique
order by on_delete, source, colonnes_source;

-- ───────────────────────────────── l'expérience, dans les deux sens

create temp table _cascade (ordre int, etape text, valeur text) on commit drop;

-- Manifeste de SCHÉMA capturé AVANT toute mutation. L'« après » est calculé
-- plus bas par la MÊME expression, et les deux sont confrontés par une
-- assertion. Sans ce point de départ, le manifeste ne comparait rien.
insert into _cascade values (0, 'manifeste_schema_avant', (
  select count(*)::text || ':' || coalesce(md5(string_agg(
           source || '(' || colonnes_source || ')->' || cible || '(' || colonnes_cible ||
           ') del=' || on_delete || ' upd=' || on_update,
           '|' order by source, colonnes_source, cible, colonnes_cible, on_delete, on_update)), 'vide')
  from _fk_canonique));

insert into _cascade values (1, 'empreinte_donnees_avant', (
  select md5(concat_ws('|', (select count(*) from auth.users), (select count(*) from public.profiles),
    (select count(*) from public.restaurants), (select count(*) from public.games),
    (select count(*) from public.prizes), (select count(*) from public.winners),
    (select count(*) from public.contacts), (select count(*) from public.avis)))));

do $$
declare
  v_com   uuid := '11111111-0000-4000-8000-00000000f001';
  v_root  uuid := '00000000-0000-4000-8000-00000000f002';
  v_resto uuid := '22222222-0000-4000-8000-00000000f003';
  v_game  uuid := '33333333-0000-4000-8000-00000000f004';
  v_sans text; v_avec text;
  nr int; ng int; np int; nw int; nc int; nv int;
begin
  -- ══ SANS la réattribution de `user_id` — le comportement d'avant ══
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
      (v_root, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'harnais-root@exemple.invalid', 'x', now(), now()),
      (v_com,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'harnais-commercial@exemple.invalid', 'x', now(), now());
    insert into public.profiles (id, role, created_at) values (v_root, 'root', '2020-01-01')
      on conflict (id) do update set role = 'root', created_at = '2020-01-01';
    insert into public.profiles (id, role) values (v_com, 'sales')
      on conflict (id) do update set role = 'sales';
    insert into public.restaurants (id, name, slug, created_by, owner_id, user_id)
      values (v_resto, 'harnais-cascade', 'harnais-cascade', v_com, v_com, v_com);
    insert into public.games (id, restaurant_id, name, active_action, status)
      values (v_game, v_resto, 'harnais-jeu', 'wheel', 'active');
    insert into public.prizes (id, game_id, label) values (gen_random_uuid(), v_game, 'harnais-lot');
    insert into public.winners (id, game_id, first_name) values (gen_random_uuid(), v_game, 'harnais-gagnant');
    insert into public.contacts (id, restaurant_id, first_name) values (gen_random_uuid(), v_resto, 'harnais-client');
    insert into public.avis (id, restaurant_id, review_id) values (gen_random_uuid(), v_resto, 'harnais-avis');

    update public.restaurants set created_by = v_root where created_by = v_com;
    update public.restaurants set owner_id  = v_root where owner_id  = v_com;
    -- `user_id` volontairement NON réattribué : c'est le défaut qu'on reproduit.
    delete from auth.users where id = v_com;

    select count(*) into nr from public.restaurants where id = v_resto;
    select count(*) into ng from public.games where id = v_game;
    select count(*) into np from public.prizes where game_id = v_game;
    select count(*) into nw from public.winners where game_id = v_game;
    select count(*) into nc from public.contacts where restaurant_id = v_resto;
    select count(*) into nv from public.avis where restaurant_id = v_resto;
    v_sans := format('resto=%s jeux=%s lots=%s gagnants=%s contacts=%s avis=%s', nr, ng, np, nw, nc, nv);
    if (nr, ng, np, nw, nc, nv) is distinct from (0, 0, 0, 0, 0, 0) then
      raise exception 'ASSERTION SANS : attendu 0/0/0/0/0/0 (la cascade doit tout emporter), observe %', v_sans;
    end if;
    raise exception using errcode = 'P9001', message = 'rollback delibere SANS';
  exception
    when sqlstate 'P9001' then null;          -- rollback voulu, rien d'autre
    when others then raise;                   -- toute autre erreur se propage
  end;
  insert into _cascade values (2, 'SANS_reattribution_user_id', coalesce(v_sans, '(vide)'));

  -- ══ AVEC la réattribution — la séquence de `suppression-compte.ts` ══
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
      (v_root, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'harnais-root@exemple.invalid', 'x', now(), now()),
      (v_com,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'harnais-commercial@exemple.invalid', 'x', now(), now());
    insert into public.profiles (id, role, created_at) values (v_root, 'root', '2020-01-01')
      on conflict (id) do update set role = 'root', created_at = '2020-01-01';
    insert into public.profiles (id, role) values (v_com, 'sales')
      on conflict (id) do update set role = 'sales';
    insert into public.restaurants (id, name, slug, created_by, owner_id, user_id)
      values (v_resto, 'harnais-cascade', 'harnais-cascade', v_com, v_com, v_com);
    insert into public.games (id, restaurant_id, name, active_action, status)
      values (v_game, v_resto, 'harnais-jeu', 'wheel', 'active');
    insert into public.prizes (id, game_id, label) values (gen_random_uuid(), v_game, 'harnais-lot');
    insert into public.winners (id, game_id, first_name) values (gen_random_uuid(), v_game, 'harnais-gagnant');
    insert into public.contacts (id, restaurant_id, first_name) values (gen_random_uuid(), v_resto, 'harnais-client');
    insert into public.avis (id, restaurant_id, review_id) values (gen_random_uuid(), v_resto, 'harnais-avis');

    update public.restaurants set created_by = v_root where created_by = v_com;
    update public.restaurants set owner_id  = v_root where owner_id  = v_com;
    update public.restaurants set user_id   = v_root where user_id   = v_com;
    delete from public.sales_restaurants where sales_user_id = v_com;
    delete from auth.users where id = v_com;   -- le profil part par cascade

    select count(*) into nr from public.restaurants where id = v_resto;
    select count(*) into ng from public.games where id = v_game;
    select count(*) into np from public.prizes where game_id = v_game;
    select count(*) into nw from public.winners where game_id = v_game;
    select count(*) into nc from public.contacts where restaurant_id = v_resto;
    select count(*) into nv from public.avis where restaurant_id = v_resto;
    v_avec := format('resto=%s jeux=%s lots=%s gagnants=%s contacts=%s avis=%s | profil_cible=%s rattachement_root=%s',
      nr, ng, np, nw, nc, nv,
      (select count(*) from public.profiles where id = v_com),
      (select count(*) from public.restaurants where id = v_resto and owner_id = v_root and user_id = v_root and created_by = v_root));
    if (nr, ng, np, nw, nc, nv) is distinct from (1, 1, 1, 1, 1, 1) then
      raise exception 'ASSERTION AVEC : attendu 1/1/1/1/1/1 (rien ne doit etre emporte), observe %', v_avec;
    end if;
    if (select count(*) from public.profiles where id = v_com) <> 0 then
      raise exception 'ASSERTION AVEC : le profil de la cible aurait du partir par cascade.';
    end if;
    if (select count(*) from public.restaurants
          where id = v_resto and created_by = v_root and owner_id = v_root and user_id = v_root) <> 1 then
      raise exception 'ASSERTION AVEC : les TROIS rattachements doivent pointer vers le root heritier.';
    end if;
    raise exception using errcode = 'P9002', message = 'rollback delibere AVEC';
  exception
    when sqlstate 'P9002' then null;
    when others then raise;
  end;
  insert into _cascade values (3, 'AVEC_reattribution_user_id', coalesce(v_avec, '(vide)'));
end $$;

insert into _cascade values (4, 'empreinte_donnees_apres', (
  select md5(concat_ws('|', (select count(*) from auth.users), (select count(*) from public.profiles),
    (select count(*) from public.restaurants), (select count(*) from public.games),
    (select count(*) from public.prizes), (select count(*) from public.winners),
    (select count(*) from public.contacts), (select count(*) from public.avis)))));
insert into _cascade values (5, 'auth_users_final', (select count(*)::text from auth.users));
insert into _cascade values (6, 'temoins_residuels',
  (select count(*)::text from public.restaurants where name = 'harnais-cascade'));

-- ── Manifeste de SCHEMA (FK), distinct de l'empreinte de DONNEES ────────
-- Meme expression que l'« avant », recalculee apres l'experience : une
-- experience qui modifierait une contrainte serait une regression, pas un
-- test. La comparaison a lieu dans le verdict fail-closed ci-dessous.
insert into _cascade values (7, 'manifeste_schema_apres', (
  select count(*)::text || ':' || coalesce(md5(string_agg(
           source || '(' || colonnes_source || ')->' || cible || '(' || colonnes_cible ||
           ') del=' || on_delete || ' upd=' || on_update,
           '|' order by source, colonnes_source, cible, colonnes_cible, on_delete, on_update)), 'vide')
  from _fk_canonique));

-- ── VERDICT FAIL-CLOSED : une regression leve, elle ne s'affiche pas ────
do $$
declare
  v_avant text; v_apres text; v_users text; v_temoins text;
  v_schema_avant text; v_schema_apres text;
begin
  select valeur into v_avant   from _cascade where etape = 'empreinte_donnees_avant';
  select valeur into v_apres   from _cascade where etape = 'empreinte_donnees_apres';
  select valeur into v_users   from _cascade where etape = 'auth_users_final';
  select valeur into v_temoins from _cascade where etape = 'temoins_residuels';
  select valeur into v_schema_avant from _cascade where etape = 'manifeste_schema_avant';
  select valeur into v_schema_apres from _cascade where etape = 'manifeste_schema_apres';

  if v_schema_avant is null or v_schema_apres is null then
    raise exception 'ASSERTION FINALE : manifeste de schema manquant (avant=%, apres=%) — la comparaison n''a pas eu lieu, donc rien n''est prouve.',
      coalesce(v_schema_avant, 'NULL'), coalesce(v_schema_apres, 'NULL');
  end if;
  if v_schema_avant is distinct from v_schema_apres then
    raise exception 'ASSERTION FINALE : le manifeste de schema a change pendant l''experience (% -> %). Une contrainte a ete ajoutee, retiree, repointee ou son action modifiee : ce n''est plus un test, c''est une regression.',
      v_schema_avant, v_schema_apres;
  end if;

  if v_avant is distinct from v_apres then
    raise exception 'ASSERTION FINALE : empreinte de donnees differente avant/apres — l''experience a laisse une trace.';
  end if;
  if v_users <> '0' then
    raise exception 'ASSERTION FINALE : % utilisateur(s) Auth residuel(s), 0 attendu.', v_users;
  end if;
  if v_temoins <> '0' then
    raise exception 'ASSERTION FINALE : % temoin(s) residuel(s), 0 attendu.', v_temoins;
  end if;
  raise notice 'HARNAIS CASCADE : toutes les assertions passent.';
end $$;

/*
 * Attendu :
 *   SANS  -> resto=0 jeux=0 lots=0 gagnants=0 contacts=0 avis=0
 *   AVEC  -> resto=1 jeux=1 lots=1 gagnants=1 contacts=1 avis=1
 *            profil_cible=0 (cascade), rattachement_root=1
 *   manifeste_schema_avant = manifeste_schema_apres (assertion, pas lecture)
 *   empreinte_donnees_avant = empreinte_donnees_apres
 *   auth_users_final = 0, témoins = 0
 *
 * Joué le 19/08/2026 sur la branche de test synthétique (0 utilisateur Auth,
 * 0 profil, 0 restaurant avant et après) :
 *
 *   manifeste_schema_avant  = 21:54f1b6f0e1c264be81c9c2ef3bd8f4ef
 *   manifeste_schema_apres  = 21:54f1b6f0e1c264be81c9c2ef3bd8f4ef  (identique)
 *   SANS  -> resto=0 jeux=0 lots=0 gagnants=0 contacts=0 avis=0
 *   AVEC  -> resto=1 jeux=1 lots=1 gagnants=1 contacts=1 avis=1
 *            profil_cible=0, rattachement_root=1
 *   auth_users_final = 0, temoins_residuels = 0
 */
select etape, valeur from _cascade order by ordre;

rollback;
