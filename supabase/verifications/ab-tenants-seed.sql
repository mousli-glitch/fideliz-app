/*
 * ═══════════════════════════════════════════════════════════════════════
 *  DEUX TENANTS SYNTHÉTIQUES — A et B
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BRANCHE UNIQUEMENT. Ne jamais exécuter sur une base qui sert de vrais
 * clients : ce fichier écrit dans auth.users.
 *
 * Objet : mesurer si les droits DML accordés à `anon` et `authenticated` sur
 * les quatre vues publiques sont réellement exploitables — anonymement, ou
 * d'un tenant vers l'autre. Tant que ce n'est pas mesuré, la question reste
 * ouverte, et une question ouverte n'est pas un feu vert.
 *
 * Identités fictives. Le domaine `.invalid` est réservé par la RFC 2606 :
 * aucune de ces adresses ne peut exister ni recevoir quoi que ce soit.
 * Aucun mot de passe utilisable n'est posé — on ne se connecte jamais, on
 * simule la revendication JWT en base.
 *
 * Identifiants fixes et lisibles : « aaaa… » pour A, « bbbb… » pour B. Une
 * ligne mal placée se voit à l'œil nu dans les résultats.
 *
 * ─── Deux pièges rencontrés, notés pour qui rejouera ───
 *
 * 1. Le trigger `on_auth_user_created` doit exister AVANT ce fichier, et
 *    dans une transaction déjà validée. Posé dans le même lot, il est annulé
 *    avec lui à la première erreur, et les profils ne sont jamais créés.
 *
 * 2. Les valeurs autorisées ne sont pas celles qu'on devine :
 *      · `profiles.role` ∈ {root, sales, restaurant} — pas « restaurateur »
 *      · `winners.status` ∈ {available, redeemed} — l'intersection des DEUX
 *        contraintes CHECK ; `consumed` est refusé par la seconde alors que
 *        la première l'autorise. Défaut historique conservé volontairement.
 */

-- ─── Comptes ───
-- Le trigger crée le profil ; c'est voulu, on mesure le chemin réel.
-- Le compte A porte `{"role":"root"}` dans ses métadonnées : c'est un test.
-- Le durcissement du 17/08 doit l'ignorer et poser `restaurant`.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaa1111-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'tenant-a@exemple.invalid',
   'AUCUN-MOT-DE-PASSE-UTILISABLE', now(), now(), now(), '{}'::jsonb, '{"role":"root"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'bbbb2222-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'tenant-b@exemple.invalid',
   'AUCUN-MOT-DE-PASSE-UTILISABLE', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

-- Le rôle tel que le trigger l'a posé, avant toute correction : c'est la
-- preuve, et elle ne vaut que relevée à cet instant précis.
create temp table role_pose_par_le_trigger as select id, role from public.profiles;

-- ─── Restaurants ───
insert into public.restaurants (id, name, slug, owner_id, user_id, is_active)
values
  ('aaaa1111-0000-4000-8000-00000000000a', 'Tenant A synthetique', 'tenant-a-synthetique',
   'aaaa1111-0000-4000-8000-000000000001', 'aaaa1111-0000-4000-8000-000000000001', true),
  ('bbbb2222-0000-4000-8000-00000000000b', 'Tenant B synthetique', 'tenant-b-synthetique',
   'bbbb2222-0000-4000-8000-000000000002', 'bbbb2222-0000-4000-8000-000000000002', true);

-- ─── Profils : restaurateur de son propre restaurant, et rien d'autre ───
update public.profiles set role = 'restaurant',
       restaurant_id = 'aaaa1111-0000-4000-8000-00000000000a'
 where id = 'aaaa1111-0000-4000-8000-000000000001';
update public.profiles set role = 'restaurant',
       restaurant_id = 'bbbb2222-0000-4000-8000-00000000000b'
 where id = 'bbbb2222-0000-4000-8000-000000000002';

-- ─── Jeux, lots, tickets ───
insert into public.games (id, restaurant_id, name, status, active_action)
values
  ('aaaa1111-0000-4000-8000-00000000000e', 'aaaa1111-0000-4000-8000-00000000000a', 'Jeu A', 'active', 'google'),
  ('bbbb2222-0000-4000-8000-00000000000e', 'bbbb2222-0000-4000-8000-00000000000b', 'Jeu B', 'active', 'google');

insert into public.prizes (id, game_id, label, quantity, weight)
values
  ('aaaa1111-0000-4000-8000-00000000000d', 'aaaa1111-0000-4000-8000-00000000000e', 'Lot A', 10, 1),
  ('bbbb2222-0000-4000-8000-00000000000d', 'bbbb2222-0000-4000-8000-00000000000e', 'Lot B', 10, 1);

insert into public.winners
  (id, game_id, prize_id, first_name, qr_code, status, prize_label_snapshot, expires_at)
values
  ('aaaa1111-0000-4000-8000-00000000000c', 'aaaa1111-0000-4000-8000-00000000000e',
   'aaaa1111-0000-4000-8000-00000000000d', 'GagnantA', 'QR-SYNTH-A', 'available',
   'Lot A', now() + interval '30 days'),
  ('bbbb2222-0000-4000-8000-00000000000c', 'bbbb2222-0000-4000-8000-00000000000e',
   'bbbb2222-0000-4000-8000-00000000000d', 'GagnantB', 'QR-SYNTH-B', 'available',
   'Lot B', now() + interval '30 days');

-- ─── Compteurs de référence, relevés AVANT toute sonde ───
select 'reference' as moment,
       (select count(*) from auth.users)         as comptes,
       (select count(*) from public.profiles)    as profils,
       (select count(*) from public.restaurants) as restaurants,
       (select count(*) from public.games)       as jeux,
       (select count(*) from public.winners)     as tickets,
       (select string_agg(substr(id::text,1,4)||' -> '||coalesce(role,'NULL'), ' | ' order by id)
          from role_pose_par_le_trigger)         as role_pose_par_trigger;
