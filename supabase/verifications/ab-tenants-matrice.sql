/*
 * ═══════════════════════════════════════════════════════════════════════
 *  MATRICE A/B — ce que chaque rôle peut RÉELLEMENT faire
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BRANCHE UNIQUEMENT. À exécuter après `ab-tenants-seed.sql`.
 *
 * ─── Pourquoi une sonde et pas une lecture de catalogue ───
 *
 * `information_schema.role_table_grants` dit qu'`anon` a INSERT sur
 * `public.profiles`. C'est vrai, et ça ne dit rien de l'exploitabilité :
 * trois couches se superposent, et il suffit qu'une refuse.
 *
 *   1. le GRANT           → 42501 « permission denied for table … »
 *   2. la RLS             → 42501 « new row violates row-level security … »
 *                           ou, en UPDATE/DELETE, AUCUNE erreur et 0 ligne
 *   3. les contraintes    → 23502, 23503, 23514
 *
 * D'où la règle de lecture des résultats, et elle est le cœur du dispositif :
 *
 *   · `REFUS:42501`      → bloqué. Lire le message pour savoir par QUI :
 *                          « permission denied » = le GRANT ;
 *                          « row-level security » = la RLS seule.
 *   · `REFUS:23xxx`      → les deux premières couches ont LAISSÉ PASSER.
 *                          Seule l'intégrité des données a sauvé la mise.
 *                          C'est un constat inquiétant, pas un succès.
 *   · `REFUS:55000`      → la vue n'est pas modifiable (jointure, agrégat).
 *   · `OK:0` en UPDATE   → le droit est accordé, la RLS a filtré toutes les
 *     ou DELETE            lignes. Protection réelle, mais tenue par la seule
 *                          RLS : une policy trop large et la porte s'ouvre.
 *   · `OK:n>0`           → mutation. Le compteur avant/après le confirme.
 *
 * Un code retour ne prouve jamais une mutation. Seul le compteur la prouve.
 * C'est pour ça que chaque ligne relève la table AVANT et APRÈS.
 *
 * ─── Nettoyage ───
 * Les sondes sont préfixées `zz_` et DOIVENT être supprimées ensuite (voir
 * la fin du fichier). Une fonction qui fait `set role` n'a rien à faire dans
 * une base qui dure, même inoffensive : elle finit par être recopiée.
 */

-- ───────────────────────────────────────────────────────── la sonde
create or replace function public.zz_sonde(
  p_role text, p_sub text, p_sql text, p_lecture boolean default false)
returns text language plpgsql as $$
declare n bigint; res text;
begin
  begin
    -- `postgres` porte BYPASSRLS ; `set role` le neutralise, car l'attribut
    -- est lu sur le rôle COURANT. Sans ce basculement, tout passerait.
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims',
      case when p_sub is null then ''
           else json_build_object('sub', p_sub, 'role', p_role)::text end, true);
    if p_lecture then
      execute 'select count(*) from (' || p_sql || ') zz' into n;
    else
      execute p_sql; get diagnostics n = row_count;
    end if;
    res := 'OK:' || n;
  exception when others then
    res := 'REFUS:' || sqlstate || ':' || left(replace(sqlerrm, E'\n', ' '), 70);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;

-- ───────────────────────────────────────────── contrôles de la sonde
-- Si `controle_uid` ne vaut pas OK:1, la revendication JWT n'est pas prise
-- en compte et TOUT le reste du fichier ne mesure rien.
select public.zz_sonde('anon', null, 'select 1', true) as controle_anon,
       public.zz_sonde('authenticated','aaaa1111-0000-4000-8000-000000000001',
         'select * from public.profiles where id = auth.uid()', true) as controle_uid;

-- ───────────────────────────────────────────────────────── lectures
with cibles(relation) as (values
  ('public.public_restaurants'),('public.public_winners_safe'),
  ('public.v_my_access_status'),('public.view_integrity_check'),
  ('public.profiles'),('public.winners'),('public.restaurants'),
  ('public.games'),('public.prizes'))
select relation,
  public.zz_sonde('anon', null, 'select * from '||relation, true) as anon,
  public.zz_sonde('authenticated','aaaa1111-0000-4000-8000-000000000001',
    'select * from '||relation, true) as tenant_a,
  public.zz_sonde('authenticated','bbbb2222-0000-4000-8000-000000000002',
    'select * from '||relation, true) as tenant_b
from cibles;

-- ───────────────────────────────────────────────────────── écritures
create or replace function public.zz_matrice_ecriture()
returns table(role_teste text, cible text, operation text, resultat text,
              avant bigint, apres bigint, mutation boolean)
language plpgsql as $$
declare c record; n_av bigint; n_ap bigint; r text;
begin
  for c in
    select * from (values
      ('anon',null,'public_restaurants','INSERT', $q$insert into public.public_restaurants (id,slug,name) values (gen_random_uuid(),'intrus-anon','Intrus anon')$q$,'public.restaurants'),
      ('anon',null,'public_restaurants','UPDATE', $q$update public.public_restaurants set name='PIRATE' where id='bbbb2222-0000-4000-8000-00000000000b'$q$,'public.restaurants'),
      ('anon',null,'public_restaurants','DELETE', $q$delete from public.public_restaurants where id='bbbb2222-0000-4000-8000-00000000000b'$q$,'public.restaurants'),
      ('anon',null,'view_integrity_check','INSERT', $q$insert into public.view_integrity_check (id,name,slug) values (gen_random_uuid(),'Intrus vic','intrus-vic')$q$,'public.restaurants'),
      ('anon',null,'view_integrity_check','DELETE', $q$delete from public.view_integrity_check where id='bbbb2222-0000-4000-8000-00000000000b'$q$,'public.restaurants'),
      ('anon',null,'public_winners_safe','INSERT', $q$insert into public.public_winners_safe (id,prize_label_snapshot,status) values (gen_random_uuid(),'Intrus','available')$q$,'public.winners'),
      ('anon',null,'public_winners_safe','UPDATE', $q$update public.public_winners_safe set status='redeemed' where id='bbbb2222-0000-4000-8000-00000000000c'$q$,'public.winners'),
      ('anon',null,'public_winners_safe','DELETE', $q$delete from public.public_winners_safe where id='bbbb2222-0000-4000-8000-00000000000c'$q$,'public.winners'),
      ('anon',null,'v_my_access_status','UPDATE', $q$update public.v_my_access_status set role='root' where profile_id='bbbb2222-0000-4000-8000-000000000002'$q$,'public.profiles'),
      ('anon',null,'v_my_access_status','DELETE', $q$delete from public.v_my_access_status where profile_id='bbbb2222-0000-4000-8000-000000000002'$q$,'public.profiles'),
      ('anon',null,'profiles (table)','UPDATE', $q$update public.profiles set role='root' where id='bbbb2222-0000-4000-8000-000000000002'$q$,'public.profiles'),
      ('anon',null,'profiles (table)','INSERT', $q$insert into public.profiles (id,email,role) values (gen_random_uuid(),'x@exemple.invalid','root')$q$,'public.profiles'),
      ('anon',null,'restaurants (table)','INSERT', $q$insert into public.restaurants (name,slug) values ('Intrus table','intrus-table')$q$,'public.restaurants'),

      ('authenticated','aaaa1111-0000-4000-8000-000000000001','public_restaurants','INSERT', $q$insert into public.public_restaurants (id,slug,name) values (gen_random_uuid(),'intrus-a','Intrus A')$q$,'public.restaurants'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','public_restaurants','UPDATE B', $q$update public.public_restaurants set name='PIRATE PAR A' where id='bbbb2222-0000-4000-8000-00000000000b'$q$,'public.restaurants'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','public_restaurants','DELETE B', $q$delete from public.public_restaurants where id='bbbb2222-0000-4000-8000-00000000000b'$q$,'public.restaurants'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','view_integrity_check','INSERT', $q$insert into public.view_integrity_check (id,name,slug) values (gen_random_uuid(),'Intrus A vic','intrus-a-vic')$q$,'public.restaurants'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','public_winners_safe','UPDATE B', $q$update public.public_winners_safe set status='redeemed' where id='bbbb2222-0000-4000-8000-00000000000c'$q$,'public.winners'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','v_my_access_status','UPDATE B', $q$update public.v_my_access_status set role='root' where profile_id='bbbb2222-0000-4000-8000-000000000002'$q$,'public.profiles'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','profiles (table)','UPDATE B->root', $q$update public.profiles set role='root' where id='bbbb2222-0000-4000-8000-000000000002'$q$,'public.profiles'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','profiles (table)','UPDATE moi->root', $q$update public.profiles set role='root' where id='aaaa1111-0000-4000-8000-000000000001'$q$,'public.profiles'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','profiles (table)','INSERT root', $q$insert into public.profiles (id,email,role) values (gen_random_uuid(),'x@exemple.invalid','root')$q$,'public.profiles'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','profiles (table)','DELETE B', $q$delete from public.profiles where id='bbbb2222-0000-4000-8000-000000000002'$q$,'public.profiles'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','restaurants (table)','INSERT', $q$insert into public.restaurants (name,slug) values ('Intrus A table','intrus-a-table')$q$,'public.restaurants'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','games (table)','UPDATE B', $q$update public.games set name='PIRATE' where id='bbbb2222-0000-4000-8000-00000000000e'$q$,'public.games'),
      ('authenticated','aaaa1111-0000-4000-8000-000000000001','prizes (table)','UPDATE B', $q$update public.prizes set quantity=999 where id='bbbb2222-0000-4000-8000-00000000000d'$q$,'public.prizes')
    ) as t(r_role, r_sub, r_cible, r_op, r_sql, r_compte)
  loop
    execute 'select count(*) from '||c.r_compte into n_av;
    r := public.zz_sonde(c.r_role, c.r_sub, c.r_sql, false);
    execute 'select count(*) from '||c.r_compte into n_ap;
    role_teste := case when c.r_sub is null then 'anon' else 'A' end;
    cible := c.r_cible; operation := c.r_op; resultat := r;
    avant := n_av; apres := n_ap;
    mutation := (n_av <> n_ap) or (r like 'OK:%' and r <> 'OK:0');
    return next;
  end loop;
end $$;

select * from public.zz_matrice_ecriture();

-- ───────────────────────────────────────────────── remise en état
-- Obligatoire. Les lignes injectées faussent toute mesure ultérieure, et les
-- sondes n'ont pas à survivre à leur usage.
drop function if exists public.zz_matrice_ecriture();
drop function if exists public.zz_sonde(text,text,text,boolean);
delete from public.restaurants where slug like 'intrus%';

select (select count(*) from public.restaurants) as restaurants,
       (select count(*) from public.profiles)    as profils,
       (select count(*) from public.winners)     as tickets,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'zz_%') as sondes_restantes;
