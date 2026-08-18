/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS NÉGATIF — prouver que le harnais positif n'est pas vide
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Signalé le 19/08/2026 : la variante délibérément fausse avait été jouée
 *  À LA MAIN, une fois, dans un rapport. Une vérification qu'on ne peut pas
 *  rejouer n'est pas une vérification — et surtout, rien ne garantissait que
 *  les assertions de `harnais-cascade-suppression.sql` se déclenchent
 *  vraiment. Un harnais dont toutes les assertions passeraient même sur du
 *  code fautif est pire qu'absent : il rassure.
 *
 *  Ce fichier injecte QUATRE fautes bornées et exige, pour chacune, le
 *  comportement attendu du harnais positif.
 *
 *      1. La faute MÉTIER — la séquence sans réattribution de `user_id`.
 *         La cascade doit tout emporter. Si elle n'emportait rien,
 *         l'assertion « AVEC » du harnais positif passerait aussi sur du
 *         code fautif : elle ne prouverait rien.
 *
 *      2. La faute de SCHÉMA — la FK recréée en NO ACTION sous un AUTRE
 *         nom. La garde anti-dérive doit lever. C'est le cas exact que
 *         l'ancienne garde, qui cherchait `conname = 'restaurants_user_id_fkey'`,
 *         ne voyait pas : elle aurait trouvé « pas de contrainte de ce nom »
 *         et levé pour la mauvaise raison, ou pire, une contrainte au bon
 *         nom mais à la mauvaise action lui aurait suffi.
 *
 *      3. Le RENOMMAGE seul — sémantique inchangée. La garde ne doit PAS
 *         lever et le manifeste ne doit PAS bouger. Un nom est décoratif :
 *         c'est une propriété voulue, pas un oubli, et elle se teste.
 *
 *      4. L'ACTION changée — la FK repointée en NO ACTION, même nom. Le
 *         manifeste DOIT changer. L'ancien manifeste ne portait que
 *         `conname:confdeltype` sans les tables ni les colonnes : une FK
 *         déplacée d'une colonne à une autre lui donnait la même empreinte.
 *
 *  ─── CE QUI FAIT LA DIFFÉRENCE ENTRE UNE DÉTECTION ET UNE PANNE ───
 *
 *  Un runner négatif qui se contente d'exiger « une erreur » est faux : une
 *  faute de frappe, une table absente, une coupure réseau produisent aussi
 *  une erreur, et le runner passerait au vert en n'ayant rien prouvé.
 *
 *  Chaque épreuve attend donc un SQLSTATE privé précis (`P9101` pour une
 *  détection de la garde), et toute autre erreur se propage telle quelle au
 *  lieu d'être comptée comme une réussite.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Tout se joue dans UNE transaction annulée : le DDL des épreuves 2 à 4
 *  (drop/add de contrainte) est lui aussi annulé, y compris en cas de succès.
 *  La garde de cible synthétique s'exécute AVANT la moindre mutation. Aucun
 *  secret, aucune référence de projet, aucune adresse réelle : le domaine
 *  réservé `.invalid` (RFC 2606) ne peut pas exister.
 *
 *  ATTENDU : « HARNAIS NÉGATIF : les 4 épreuves sont conformes. »
 *  Toute autre issue est un échec, et le script lève.
 *
 *  Joué le 19/08/2026 sur la branche de test synthétique :
 *
 *    1. conforme — faute jouée -> resto=0 jeux=0 lots=0 gagnants=0
 *                  contacts=0 avis=0
 *    2. conforme — garde levée (P9101) : « 0 FK restaurants(user_id)
 *                  CASCADE, 1 attendue »
 *    3. conforme — garde_silencieuse=t, manifeste_inchange=t
 *    4. conforme — empreinte différente=t
 *
 *  Et la méta-preuve, jouée le même jour : avec la garde NEUTRALISÉE (une
 *  fonction qui ne lève jamais), l'épreuve 2 devient non conforme et le
 *  verdict lève — « HARNAIS NÉGATIF : 1 epreuve NON CONFORME ». Ce fichier
 *  n'est donc pas vide non plus.
 *
 *  Après les trois exécutions, la branche est revenue à l'identique :
 *  0 utilisateur Auth, 0 profil, 0 restaurant, 0 contrainte parasite, et le
 *  manifeste toujours à 21:54f1b6f0e1c264be81c9c2ef3bd8f4ef.
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

-- ── manifeste canonique : MÊME définition que le harnais positif ─────────
-- Le nom de contrainte en est absent, volontairement. Voir l'épreuve 3.

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

-- La garde anti-dérive du harnais positif, extraite pour être APPELÉE.
-- Elle lève `P9101` — un code privé, pour qu'une détection ne se confonde
-- jamais avec une panne.
create function pg_temp.garde_anti_derive() returns void language plpgsql as $g$
declare
  v_conforme int;
  v_total    int;
begin
  select count(*) into v_conforme from pg_temp._fk_canonique
   where source = 'public.restaurants' and colonnes_source = 'user_id'
     and cible = 'auth.users' and colonnes_cible = 'id' and on_delete = 'c';
  select count(*) into v_total from pg_temp._fk_canonique
   where source = 'public.restaurants' and colonnes_source = 'user_id';

  if v_conforme <> 1 then
    raise exception using errcode = 'P9101',
      message = format('DÉRIVE : %s FK public.restaurants(user_id) -> auth.users(id) ON DELETE CASCADE, 1 attendue.', v_conforme);
  end if;
  if v_total <> 1 then
    raise exception using errcode = 'P9101',
      message = format('DÉRIVE : %s FK partent de public.restaurants(user_id), 1 attendue.', v_total);
  end if;
end $g$;

create function pg_temp.empreinte_fk() returns text language sql as $e$
  select count(*)::text || ':' || coalesce(md5(string_agg(
           source || '(' || colonnes_source || ')->' || cible || '(' || colonnes_cible ||
           ') del=' || on_delete || ' upd=' || on_update,
           '|' order by source, colonnes_source, cible, colonnes_cible, on_delete, on_update)), 'vide')
  from pg_temp._fk_canonique;
$e$;

create temp table _negatif (ordre int, epreuve text, conforme boolean, detail text) on commit drop;

-- ═══════════════════════ ÉPREUVE 1 — la faute MÉTIER est bien détectable

do $$
declare
  v_com   uuid := '11111111-0000-4000-8000-00000000e001';
  v_root  uuid := '00000000-0000-4000-8000-00000000e002';
  v_resto uuid := '22222222-0000-4000-8000-00000000e003';
  v_game  uuid := '33333333-0000-4000-8000-00000000e004';
  nr int; ng int; np int; nw int; nc int; nv int;
  v_detail text;
  v_conforme boolean;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
      (v_root, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'negatif-root@exemple.invalid', 'x', now(), now()),
      (v_com,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'negatif-commercial@exemple.invalid', 'x', now(), now());
    insert into public.profiles (id, role, created_at) values (v_root, 'root', '2020-01-01')
      on conflict (id) do update set role = 'root', created_at = '2020-01-01';
    insert into public.profiles (id, role) values (v_com, 'sales')
      on conflict (id) do update set role = 'sales';
    insert into public.restaurants (id, name, slug, created_by, owner_id, user_id)
      values (v_resto, 'negatif-cascade', 'negatif-cascade', v_com, v_com, v_com);
    insert into public.games (id, restaurant_id, name, active_action, status)
      values (v_game, v_resto, 'negatif-jeu', 'wheel', 'active');
    insert into public.prizes (id, game_id, label) values (gen_random_uuid(), v_game, 'negatif-lot');
    insert into public.winners (id, game_id, first_name) values (gen_random_uuid(), v_game, 'negatif-gagnant');
    insert into public.contacts (id, restaurant_id, first_name) values (gen_random_uuid(), v_resto, 'negatif-client');
    insert into public.avis (id, restaurant_id, review_id) values (gen_random_uuid(), v_resto, 'negatif-avis');

    -- LA FAUTE, bornée et volontaire : `user_id` n'est PAS réattribué.
    update public.restaurants set created_by = v_root where created_by = v_com;
    update public.restaurants set owner_id  = v_root where owner_id  = v_com;
    delete from auth.users where id = v_com;

    select count(*) into nr from public.restaurants where id = v_resto;
    select count(*) into ng from public.games where id = v_game;
    select count(*) into np from public.prizes where game_id = v_game;
    select count(*) into nw from public.winners where game_id = v_game;
    select count(*) into nc from public.contacts where restaurant_id = v_resto;
    select count(*) into nv from public.avis where restaurant_id = v_resto;

    /*
     * Conformité : la faute doit être DESTRUCTRICE. Si elle ne l'était pas,
     * l'assertion « AVEC » du harnais positif (attendu 1/1/1/1/1/1) passerait
     * aussi bien avec la réattribution que sans — elle ne discriminerait rien.
     */
    v_conforme := (nr, ng, np, nw, nc, nv) is not distinct from (0, 0, 0, 0, 0, 0);
    v_detail := format('faute jouee -> resto=%s jeux=%s lots=%s gagnants=%s contacts=%s avis=%s (0 partout attendu)',
                       nr, ng, np, nw, nc, nv);
    raise exception using errcode = 'P9001', message = 'rollback delibere epreuve 1';
  exception
    when sqlstate 'P9001' then null;
    when others then raise;
  end;
  insert into _negatif values (1, 'faute metier : sans reattribution de user_id, la cascade detruit tout',
                               coalesce(v_conforme, false), coalesce(v_detail, '(non joue)'));
end $$;

-- ═══════════ ÉPREUVES 2 à 4 — la garde et le manifeste face au schéma

do $$
declare
  v_nom      text;
  v_avant    text;
  v_apres    text;
  v_conforme boolean;
  v_detail   text;
begin
  /*
   * Le nom de la contrainte est RÉSOLU depuis sa sémantique, jamais écrit en
   * dur : ce fichier ne doit pas dépendre de ce qu'il reproche à l'ancienne
   * garde de dépendre.
   */
  select con.conname
    into v_nom
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace src_ns on src_ns.oid = src.relnamespace
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
  where con.contype = 'f'
    and src_ns.nspname = 'public' and src.relname = 'restaurants'
    and tgt_ns.nspname = 'auth'   and tgt.relname = 'users'
    and con.confdeltype = 'c'
    and (select string_agg(a.attname, ',' order by k.ord)
           from unnest(con.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) = 'user_id';

  if v_nom is null then
    raise exception 'HARNAIS NÉGATIF INAPPLICABLE : la FK public.restaurants(user_id) -> auth.users ON DELETE CASCADE n''existe pas. Ce n''est pas une épreuve qui échoue, c''est le point de départ qui manque.';
  end if;

  -- ── ÉPREUVE 2 : action changée SOUS UN AUTRE NOM → la garde doit lever ──
  begin
    execute format('alter table public.restaurants drop constraint %I', v_nom);
    execute 'alter table public.restaurants add constraint fk_negatif_autre_nom foreign key (user_id) references auth.users(id) on delete no action';

    begin
      perform pg_temp.garde_anti_derive();
      v_conforme := false;                       -- la garde n'a pas levé : défaut
      v_detail   := 'la garde a laisse passer une FK NO ACTION renommee';
    exception
      when sqlstate 'P9101' then
        v_conforme := true;                      -- détection, et pour le bon motif
        v_detail   := 'garde levee (P9101) : ' || sqlerrm;
      when others then raise;                    -- panne : jamais comptee comme detection
    end;

    raise exception using errcode = 'P9002', message = 'rollback delibere epreuve 2';
  exception
    when sqlstate 'P9002' then null;
    when others then raise;
  end;
  insert into _negatif values (2, 'faute de schema : FK NO ACTION sous un autre nom -> la garde leve',
                               coalesce(v_conforme, false), coalesce(v_detail, '(non joue)'));

  -- ── ÉPREUVE 3 : renommage SEUL → ni la garde ni le manifeste ne bougent ──
  v_conforme := null; v_detail := null;
  begin
    v_avant := pg_temp.empreinte_fk();
    execute format('alter table public.restaurants rename constraint %I to fk_negatif_renommee', v_nom);
    v_apres := pg_temp.empreinte_fk();

    declare
      v_garde_ok boolean;
    begin
      begin
        perform pg_temp.garde_anti_derive();
        v_garde_ok := true;
      exception
        when sqlstate 'P9101' then v_garde_ok := false;
        when others then raise;
      end;
      v_conforme := v_garde_ok and (v_avant is not distinct from v_apres);
      v_detail := format('garde_silencieuse=%s manifeste_inchange=%s', v_garde_ok, v_avant is not distinct from v_apres);
    end;

    raise exception using errcode = 'P9003', message = 'rollback delibere epreuve 3';
  exception
    when sqlstate 'P9003' then null;
    when others then raise;
  end;
  insert into _negatif values (3, 'renommage seul : semantique intacte -> garde silencieuse, manifeste identique',
                               coalesce(v_conforme, false), coalesce(v_detail, '(non joue)'));

  -- ── ÉPREUVE 4 : action changée, MÊME NOM → le manifeste doit changer ──
  v_conforme := null; v_detail := null;
  begin
    v_avant := pg_temp.empreinte_fk();
    execute format('alter table public.restaurants drop constraint %I', v_nom);
    execute format('alter table public.restaurants add constraint %I foreign key (user_id) references auth.users(id) on delete no action', v_nom);
    v_apres := pg_temp.empreinte_fk();

    v_conforme := v_avant is distinct from v_apres;
    v_detail := format('empreinte differente=%s (le nom n''a pas change, l''action si)', v_avant is distinct from v_apres);

    raise exception using errcode = 'P9004', message = 'rollback delibere epreuve 4';
  exception
    when sqlstate 'P9004' then null;
    when others then raise;
  end;
  insert into _negatif values (4, 'action changee a nom constant : le manifeste doit changer',
                               coalesce(v_conforme, false), coalesce(v_detail, '(non joue)'));
end $$;

-- ══════════════════════════════ VERDICT — fail-closed, jamais un affichage

do $$
declare
  v_jouees   int;
  v_echecs   int;
  v_liste    text;
  v_users    int;
  v_temoins  int;
begin
  select count(*) into v_jouees from _negatif;
  if v_jouees <> 4 then
    raise exception 'HARNAIS NÉGATIF : % epreuve(s) enregistree(s), 4 attendues. Une epreuve non jouee n''est pas une epreuve reussie.', v_jouees;
  end if;

  select count(*), string_agg(ordre || '. ' || epreuve || ' — ' || detail, E'\n' order by ordre)
    into v_echecs, v_liste
  from _negatif where conforme is distinct from true;

  if v_echecs > 0 then
    raise exception E'HARNAIS NÉGATIF : % epreuve(s) NON CONFORME(S).\n%\nLe harnais positif ne prouve donc pas ce qu''il pretend prouver.', v_echecs, v_liste;
  end if;

  -- Le fichier ne doit rien laisser derriere lui, meme en cas de succes.
  select count(*) into v_users from auth.users;
  select count(*) into v_temoins from public.restaurants where name like 'negatif-%';
  if v_users <> 0 or v_temoins <> 0 then
    raise exception 'HARNAIS NÉGATIF : residus (% utilisateurs Auth, % temoins). Les sous-transactions n''ont pas ete annulees.', v_users, v_temoins;
  end if;

  raise notice 'HARNAIS NÉGATIF : les 4 epreuves sont conformes.';
end $$;

select ordre, epreuve, conforme, detail from _negatif order by ordre;

rollback;
