/*
 * ═══════════════════════════════════════════════════════════════════════
 *  MATRICE RLS — 16 tables × 7 rôles × 4 opérations
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BRANCHE UNIQUEMENT. À exécuter après `ab-tenants-seed.sql` ET le semis
 * des tables secondaires (plus bas).
 *
 * ─── Comment elle ne modifie rien ───
 *
 * Chaque sonde exécute vraiment l'opération, relève `row_count`, puis lève
 * une exception qui ANNULE le sous-bloc. Le compteur voyage dans le message
 * de l'exception : la mutation est défaite, la mesure survit.
 *
 * C'est ce qui permet de mesurer un DELETE sans supprimer, et de savoir
 * combien de lignes la RLS aurait réellement laissé passer — chose qu'un
 * `where false` ne dirait jamais.
 *
 * ─── Comment se lisent les résultats ───
 *
 *   SELECT/INSERT/UPDATE/DELETE, dans cet ordre.
 *
 *   nombre    lignes réellement touchées (puis annulées)
 *   DENY      42501 — refusé par le GRANT **ou** par la RLS
 *   E23502    contrainte NOT NULL : le GRANT ET la RLS ont LAISSÉ PASSER.
 *             Seule l'intégrité des données a arrêté l'écriture. À lire
 *             comme un constat inquiétant, jamais comme une protection.
 *   0 en U/D  droit accordé, RLS a filtré toutes les lignes.
 *
 * ─── Une limite de la sonde, à connaître ───
 *
 * L'INSERT est tenté par `default values`. Sur une table dont la policy
 * exige un rattachement (`restaurant_id = current_restaurant_id()`), la
 * ligne vide ne satisfait pas le `with check` et rend `DENY`. On ne peut
 * donc pas distinguer « pas le droit » de « la ligne ne convenait pas ».
 * Pour le verdict qui nous occupe — personne ne doit créer — les deux
 * conclusions se rejoignent, mais il ne faut pas lire ce `DENY` comme une
 * absence de privilège.
 *
 * ─── Et une leçon apprise en route ───
 *
 * Au premier passage, sept tables étaient VIDES sur la branche. Tous les
 * rôles y rendaient `0`, et ce `0` ne prouvait que la vacuité de la table.
 * Une matrice sur des tables vides est une matrice qui dit oui à tout.
 * D'où le semis ci-dessous : UNE LIGNE PAR TENANT dans chaque table.
 */

-- ─── Semis des tables secondaires, une ligne par tenant ───
insert into public.contacts (restaurant_id, email) values
 ('aaaa1111-0000-4000-8000-00000000000a','client-a@exemple.invalid'),
 ('bbbb2222-0000-4000-8000-00000000000b','client-b@exemple.invalid');

insert into public.avis (restaurant_id, review_id) values
 ('aaaa1111-0000-4000-8000-00000000000a','avis-A-1'),
 ('bbbb2222-0000-4000-8000-00000000000b','avis-B-1');

insert into public.crm_notes (restaurant_id, sales_id, note) values
 ('aaaa1111-0000-4000-8000-00000000000a','cccc3333-0000-4000-8000-000000000003','Note A'),
 ('bbbb2222-0000-4000-8000-00000000000b','cccc3333-0000-4000-8000-000000000003','Note B');

-- Le commercial n'est rattaché QU'AU tenant A. Sans cette asymétrie, on ne
-- pourrait pas voir qu'il déborde sur B — et il déborde, sur crm_notes.
insert into public.sales_restaurants (sales_user_id, restaurant_id) values
 ('cccc3333-0000-4000-8000-000000000003','aaaa1111-0000-4000-8000-00000000000a');

insert into public.system_logs (message, restaurant_id) values
 ('trace A','aaaa1111-0000-4000-8000-00000000000a'),
 ('trace B','bbbb2222-0000-4000-8000-00000000000b');

insert into public.winners (id, game_id, first_name, qr_code, status, prize_label_snapshot, expires_at) values
 ('aaaa1111-0000-4000-8000-00000000000c','aaaa1111-0000-4000-8000-00000000000e','GagnantA','QR-A','available','Lot A', now()+interval '30 days'),
 ('bbbb2222-0000-4000-8000-00000000000c','bbbb2222-0000-4000-8000-00000000000e','GagnantB','QR-B','available','Lot B', now()+interval '30 days');

insert into public.winners_archive (id, game_id, restaurant_id) values
 ('aaaa1111-0000-4000-8000-00000000000f','aaaa1111-0000-4000-8000-00000000000e','aaaa1111-0000-4000-8000-00000000000a'),
 ('bbbb2222-0000-4000-8000-00000000000f','bbbb2222-0000-4000-8000-00000000000e','bbbb2222-0000-4000-8000-00000000000b');

-- ─── La sonde ───
create or replace function public.zz_p(p_role text, p_sub text, p_sql text)
returns text language plpgsql as $$
declare n bigint; res text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims',
      case when p_sub is null then '' else json_build_object('sub',p_sub,'role',p_role)::text end, true);
    execute p_sql;
    get diagnostics n = row_count;
    -- L'annulation volontaire, avec le compteur en bagage.
    raise exception using errcode = 'P0001', message = 'annule:' || n;
  exception
    when sqlstate 'P0001'      then res := split_part(sqlerrm, ':', 2);
    when insufficient_privilege then res := 'DENY';
    when others                 then res := 'E' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
revoke all on function public.zz_p(text,text,text) from public, anon, authenticated;

create or replace function public.zz_matrice()
returns table(tbl text, role_teste text, sel text, ins text, upd text, del text)
language plpgsql as $$
declare t record; r record; col text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' order by 1
  loop
    -- Première colonne de la table : `set col = col` est une affectation
    -- neutre qui exige quand même le droit UPDATE et traverse la RLS.
    select a.attname into col from pg_attribute a
     where a.attrelid = ('public.'||t.relname)::regclass and a.attnum > 0 and not a.attisdropped
     order by a.attnum limit 1;
    for r in select * from (values
        ('anon', null::text, 'anon'),
        ('authenticated','eeee5555-0000-4000-8000-000000000005','sans rattach.'),
        ('authenticated','aaaa1111-0000-4000-8000-000000000001','A'),
        ('authenticated','bbbb2222-0000-4000-8000-000000000002','B'),
        ('authenticated','cccc3333-0000-4000-8000-000000000003','commercial'),
        ('authenticated','dddd4444-0000-4000-8000-000000000004','root'),
        ('service_role', null, 'service_role')) as x(pg, sub, nom)
    loop
      tbl := t.relname; role_teste := r.nom;
      sel := public.zz_p(r.pg, r.sub, format('select 1 from public.%I', t.relname));
      ins := public.zz_p(r.pg, r.sub, format('insert into public.%I default values', t.relname));
      upd := public.zz_p(r.pg, r.sub, format('update public.%I set %I = %I', t.relname, col, col));
      del := public.zz_p(r.pg, r.sub, format('delete from public.%I', t.relname));
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.zz_matrice() from public, anon, authenticated;

select tbl,
  max(case when role_teste='anon'          then sel||'/'||ins||'/'||upd||'/'||del end) as anon,
  max(case when role_teste='sans rattach.' then sel||'/'||ins||'/'||upd||'/'||del end) as sans_rattach,
  max(case when role_teste='A'             then sel||'/'||ins||'/'||upd||'/'||del end) as tenant_A,
  max(case when role_teste='B'             then sel||'/'||ins||'/'||upd||'/'||del end) as tenant_B,
  max(case when role_teste='commercial'    then sel||'/'||ins||'/'||upd||'/'||del end) as commercial,
  max(case when role_teste='root'          then sel||'/'||ins||'/'||upd||'/'||del end) as root,
  max(case when role_teste='service_role'  then sel||'/'||ins||'/'||upd||'/'||del end) as service_role
from public.zz_matrice() group by tbl order by tbl;

-- ─── Remise en état : obligatoire ───
drop function if exists public.zz_matrice();
drop function if exists public.zz_p(text,text,text);
