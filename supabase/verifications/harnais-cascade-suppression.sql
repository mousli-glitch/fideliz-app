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

-- ────────────────────────── garde anti-dérive : les invariants du code

do $$
declare
  v_user_id_cascade boolean;
  v_profil_cascade  boolean;
begin
  select con.confdeltype = 'c' into v_user_id_cascade
  from pg_constraint con
  where con.conrelid = 'public.restaurants'::regclass and con.contype = 'f'
    and con.conname = 'restaurants_user_id_fkey';

  select con.confdeltype = 'c' into v_profil_cascade
  from pg_constraint con
  where con.conrelid = 'public.profiles'::regclass and con.contype = 'f'
    and con.conname = 'profiles_id_fkey';

  if v_user_id_cascade is distinct from true then
    raise exception 'DÉRIVE : restaurants.user_id -> auth.users n''est plus ON DELETE CASCADE. `suppression-compte.ts` réattribue cette colonne À CAUSE de cette cascade — si elle a disparu, relire le raisonnement avant de simplifier le code.';
  end if;
  if v_profil_cascade is distinct from true then
    raise exception 'DÉRIVE : profiles.id -> auth.users n''est plus ON DELETE CASCADE. La séquence de suppression compte sur cette cascade pour emporter le profil, ce qui rend l''action rejouable après un échec Auth. Sans elle, le profil resterait orphelin.';
  end if;
  raise notice 'GARDE ANTI-DÉRIVE : les deux invariants du code sont tenus.';
end $$;

-- ─────────────────────────────────────────── manifeste des FK effectives

select con.conname,
       src.relname as table_source,
       (select string_agg(a.attname, ',' order by k.ord)
          from unnest(con.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as colonnes,
       tgt_ns.nspname || '.' || tgt.relname as cible,
       case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
where con.contype = 'f'
  and ((tgt_ns.nspname = 'auth' and tgt.relname = 'users')
    or (tgt_ns.nspname = 'public' and tgt.relname in ('profiles', 'restaurants')))
order by con.confdeltype, src.relname;

-- ───────────────────────────────── l'expérience, dans les deux sens

create temp table _cascade (ordre int, etape text, valeur text) on commit drop;

insert into _cascade values (1, 'manifeste_avant', (
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
    raise exception 'annuler_sans';
  exception when others then
    if sqlerrm <> 'annuler_sans' then v_sans := 'ERREUR : ' || left(sqlerrm, 130); end if;
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
    raise exception 'annuler_avec';
  exception when others then
    if sqlerrm <> 'annuler_avec' then v_avec := 'ERREUR : ' || left(sqlerrm, 130); end if;
  end;
  insert into _cascade values (3, 'AVEC_reattribution_user_id', coalesce(v_avec, '(vide)'));
end $$;

insert into _cascade values (4, 'manifeste_apres', (
  select md5(concat_ws('|', (select count(*) from auth.users), (select count(*) from public.profiles),
    (select count(*) from public.restaurants), (select count(*) from public.games),
    (select count(*) from public.prizes), (select count(*) from public.winners),
    (select count(*) from public.contacts), (select count(*) from public.avis)))));
insert into _cascade values (5, 'auth_users_final', (select count(*)::text from auth.users));
insert into _cascade values (6, 'temoins_residuels',
  (select count(*)::text from public.restaurants where name = 'harnais-cascade'));

/*
 * Attendu :
 *   SANS  -> resto=0 jeux=0 lots=0 gagnants=0 contacts=0 avis=0
 *   AVEC  -> resto=1 jeux=1 lots=1 gagnants=1 contacts=1 avis=1
 *            profil_cible=0 (cascade), rattachement_root=1
 *   manifeste_avant = manifeste_apres, auth_users_final = 0, témoins = 0
 */
select etape, valeur from _cascade order by ordre;

rollback;
