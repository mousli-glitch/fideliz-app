/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  RÉPÉTITION DU GEL — 1/4 · DE QUOI AVOIR QUELQUE CHOSE À GELER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une branche Supabase naît SANS DONNÉES. Or un gel qui refuse des écritures
 * sur des tables vides ne prouve rien : `update ... where faux` affecte zéro
 * ligne et ne déclenche aucun trigger `BEFORE UPDATE`. Il faut une ligne par
 * table gelée, sans quoi la moitié de la matrice passe au vert par vacuité.
 *
 * ⚠ BANC UNIQUEMENT. Le premier bloc refuse de s'exécuter sur une base qui
 * porte des données réelles.
 */

do $garde$
declare v_n bigint;
begin
  select count(*) into v_n from public.restaurants where slug not like 'banc-gel%';
  if v_n > 0 then
    raise exception using errcode='P0300',
      message = format('ENSEMENCEMENT REFUSE : %s restaurant(s) reels presents. '
                    || 'Ce script est reserve a un banc — il n''ecrit pas dans une base habitee.', v_n);
  end if;
end $garde$;

/*
 * Deux comptes : un gerant et un commercial. `crm_notes.sales_id` et
 * `sales_restaurants.sales_user_id` sont NOT NULL, et le second est la
 * moitie d'une cle primaire. Adresses en `.invalid` (RFC 2606).
 */
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'banc-gerant@fideliz.invalid', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'banc-commercial@fideliz.invalid', crypt('x', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.restaurants (id, name, slug)
values ('00000000-0000-4000-8000-00000000d001', 'BANC GEL', 'banc-gel')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, restaurant_id)
values ('00000000-0000-4000-8000-00000000e001', 'banc-gerant@fideliz.invalid', 'restaurant',
        '00000000-0000-4000-8000-00000000d001'),
       ('00000000-0000-4000-8000-00000000e002', 'banc-commercial@fideliz.invalid', 'sales', null)
on conflict (id) do nothing;

insert into public.games (id, restaurant_id, active_action, status)
values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000d001', 'google', 'inactive')
on conflict (id) do nothing;

insert into public.prizes (id, game_id, label, weight)
values ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000c001', 'Lot du banc', 1)
on conflict (id) do nothing;

insert into public.winners (id, game_id, prize_id, first_name, qr_code, status)
values ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000c001',
        '00000000-0000-4000-8000-00000000b001', 'Banc', 'banc-gel-qr-001', 'available')
on conflict (id) do nothing;

insert into public.contacts (id, restaurant_id, first_name)
values ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-00000000d001', 'Banc')
on conflict (id) do nothing;

insert into public.avis (id, restaurant_id, review_id, rating)
values ('00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-00000000d001', 'banc-gel-avis-001', 5)
on conflict (id) do nothing;

insert into public.crm_notes (id, restaurant_id, sales_id, note)
values ('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000e002', 'note du banc')
on conflict (id) do nothing;

insert into public.sales_restaurants (sales_user_id, restaurant_id, created_at)
values ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d001', now())
on conflict do nothing;

insert into public.winners_archive (id, archived_at, restaurant_id, game_id, first_name, status, metadata)
values ('00000000-0000-4000-8000-000000006001', now(), '00000000-0000-4000-8000-00000000d001',
        '00000000-0000-4000-8000-00000000c001', 'Banc', 'redeemed', '{}'::jsonb)
on conflict (id) do nothing;

/* Les deux journaux EXCLUS du gel : ils doivent rester ecrivables. */
insert into public.system_logs (id, action_type, message, metadata)
values ('00000000-0000-4000-8000-000000005001', 'banc_gel', 'ligne temoin du banc', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.activity_logs_legacy (id, action_type, details)
values ('00000000-0000-4000-8000-000000004001', 'banc_gel', 'ligne temoin du banc')
on conflict (id) do nothing;

select 'ENSEMENCEMENT DU BANC — fait' as resultat,
       (select count(*) from public.restaurants)         as restaurants,
       (select count(*) from public.games)               as jeux,
       (select count(*) from public.winners)             as tickets,
       (select count(*) from public.crm_notes)           as notes,
       (select count(*) from public.sales_restaurants)   as rattachements,
       (select count(*) from public.winners_archive)     as archives,
       (select count(*) from public.system_logs)         as journal_systeme,
       (select count(*) from public.activity_logs_legacy) as journal_legacy;
