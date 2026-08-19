/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — le contrat monétaire, prouvé DANS LES DEUX POLARITÉS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ─── UN SEUL ORACLE, DEUX POLARITÉS ───
 *
 *  La version précédente écrivait ses assertions ici, et le runner négatif en
 *  écrivait des copies. Deux jeux d'assertions finissent toujours par
 *  diverger, et c'est alors le négatif qui devient complaisant sans que rien
 *  ne le dise.
 *
 *  Ce fichier n'a donc qu'UN oracle — `pg_temp.oracle_monetaire()` — appelé
 *  deux fois : sur le contrat CORRIGÉ, où il doit être vert, puis sur le
 *  parseur PERMISSIF d'origine (`else 0`), où il doit être rouge.
 *
 *  ─── LE DÉFAUT REPRODUIT ───
 *
 *  `games.min_spend` est du texte. L'écriture produisait `"5.9"` pour
 *  « 5,90 », mais `play_game` et `register_win` n'acceptent que `^[0-9]+$` et
 *  retombent à ZÉRO, pendant que la page publique affiche « 5.9 » au client.
 *  Mesuré en production : 1 jeu actif dans ce cas, 127 tickets rattachés.
 *
 *  Le cœur du correctif tient en une phrase : **une valeur illisible ne
 *  devient jamais zéro**.
 *
 *  ─── LA RÈGLE DES TICKETS, DÉCIDÉE PAR SAMY ───
 *
 *      consommé ................ INCHANGÉ
 *      encore valide ........... minimum AFFICHÉ au client
 *      expiré ou supprimé ...... INCHANGÉ
 *
 *  ─── ⚠️ CE FICHIER REMPLACE TEMPORAIREMENT UNE FONCTION ───
 *
 *  Il substitue le parseur permissif le temps de la polarité rouge, puis
 *  restaure le vrai — et le vérifie. Cible SYNTHÉTIQUE VIERGE uniquement.
 *
 *  ATTENDU : corrigé vert sur tous les cas, permissif rouge sur au moins les
 *  cas de grammaire et de lecture, restauration vérifiée.
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

do $$
declare v_u int; v_p int; v_r int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants;
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception 'HARNAIS REFUSÉ : cible non vierge (% Auth, % profils, % restaurants). Ce fichier remplace temporairement une fonction.', v_u, v_p, v_r;
  end if;
end $$;

do $$
declare v_manquant text := '';
begin
  if to_regprocedure('public.centimes_depuis_saisie(text)') is null then
    v_manquant := v_manquant || ' centimes_depuis_saisie'; end if;
  if to_regprocedure('public.minimum_effectif_centimes(integer,integer,text)') is null then
    v_manquant := v_manquant || ' minimum_effectif_centimes'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='games' and column_name='min_spend_cents') then
    v_manquant := v_manquant || ' games.min_spend_cents'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then
    v_manquant := v_manquant || ' winners.min_spend_cents_snapshot'; end if;
  if v_manquant <> '' then
    raise exception 'HARNAIS INAPPLICABLE — manquant :%. Migration 20260819060000 non appliquée.', v_manquant;
  end if;
end $$;

-- On garde le vrai corps pour le restaurer à l'identique.
create temp table _vrai_parseur as
select pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='centimes_depuis_saisie';

-- ═══ L'ORACLE, écrit UNE fois ═══

create or replace function pg_temp.oracle_monetaire()
returns table(bloc text, cas text, attendu text, obtenu text, conforme boolean)
language plpgsql as $o$
declare
  valides text[][] := array[
    ['0','0'], ['','NULL'], ['   ','NULL'], ['5','500'], ['5.9','590'],
    ['5,90','590'], ['5.90','590'], ['12.00','1200'], ['0.05','5'], ['999999','99999900']];
  invalides text[] := array['5.999','-3','abc','5abc','1e3','1000000','5..9','.5','5.','0x10','NaN','Infinity','５','+5','5%'];
  i int; s text; v int; v_obt text;
  vR uuid := '00000000-0000-4000-8000-00000000e0a1';
  vG uuid := '00000000-0000-4000-8000-00000000e0a2';
  tV uuid := '00000000-0000-4000-8000-00000000e0b1';
  tC uuid := '00000000-0000-4000-8000-00000000e0b2';
  tX uuid := '00000000-0000-4000-8000-00000000e0b3';
begin
  -- Grammaire : formes valides.
  for i in 1 .. array_length(valides,1) loop
    begin v_obt := coalesce(public.centimes_depuis_saisie(valides[i][1])::text,'NULL');
    exception when others then v_obt := 'LEVE ' || sqlstate; end;
    bloc := 'grammaire valide'; cas := '« ' || valides[i][1] || ' »';
    attendu := valides[i][2]; obtenu := v_obt; conforme := v_obt = valides[i][2]; return next;
  end loop;

  -- Grammaire : formes invalides. C'est ICI que le parseur permissif échoue.
  foreach s in array invalides loop
    begin
      v := public.centimes_depuis_saisie(s);
      v_obt := 'ACCEPTE -> ' || coalesce(v::text,'NULL');
      bloc := 'grammaire invalide'; cas := '« ' || s || ' »';
      attendu := 'lève P0120'; obtenu := v_obt; conforme := false; return next;
    exception when others then
      bloc := 'grammaire invalide'; cas := '« ' || s || ' »';
      attendu := 'lève P0120'; obtenu := 'lève ' || sqlstate;
      conforme := sqlstate = 'P0120'; return next;
    end;
  end loop;

  -- Ordre de lecture. Le cas « illisible » porte tout le correctif.
  bloc := 'lecture'; cas := 'le snapshot prime'; attendu := '590';
  obtenu := coalesce(public.minimum_effectif_centimes(590,1200,'99')::text,'NULL');
  conforme := public.minimum_effectif_centimes(590,1200,'99') = 590; return next;

  bloc := 'lecture'; cas := 'puis le champ canonique'; attendu := '1200';
  obtenu := coalesce(public.minimum_effectif_centimes(null,1200,'99')::text,'NULL');
  conforme := public.minimum_effectif_centimes(null,1200,'99') = 1200; return next;

  bloc := 'lecture'; cas := 'puis le texte historique'; attendu := '590';
  obtenu := coalesce(public.minimum_effectif_centimes(null,null,'5,90')::text,'NULL');
  conforme := public.minimum_effectif_centimes(null,null,'5,90') = 590; return next;

  bloc := 'lecture'; cas := 'ILLISIBLE -> NULL, jamais zéro'; attendu := 'NULL';
  obtenu := coalesce(public.minimum_effectif_centimes(null,null,'abc')::text,'NULL');
  conforme := public.minimum_effectif_centimes(null,null,'abc') is null; return next;

  bloc := 'lecture'; cas := 'snapshot à 0 reste 0'; attendu := '0';
  obtenu := coalesce(public.minimum_effectif_centimes(0,1200,'99')::text,'NULL');
  conforme := public.minimum_effectif_centimes(0,1200,'99') = 0; return next;

  -- Règle des tickets, sur fixture reproduisant le jeu défectueux.
  insert into public.restaurants (id,name,slug) values (vR,'mon-resto','mon-resto');
  insert into public.games (id,restaurant_id,name,active_action,status,min_spend)
    values (vG,vR,'mon-jeu','wheel','active','5,90');
  insert into public.winners (id,game_id,first_name,qr_code,status,expires_at,redeemed_at) values
    (tV,vG,'valide',  tV::text,'available', now()+interval '30 days', null),
    (tC,vG,'consomme',tC::text,'redeemed',  now()+interval '30 days', now()),
    (tX,vG,'expire',  tX::text,'available', now()-interval '1 day',   null);

  update public.games g set min_spend_cents = public.minimum_effectif_centimes(null,null,g.min_spend)
   where g.min_spend_cents is null
     and public.minimum_effectif_centimes(null,null,g.min_spend) is not null;

  update public.winners w set min_spend_cents_snapshot = public.minimum_effectif_centimes(null,null,g.min_spend)
    from public.games g
   where g.id = w.game_id and w.min_spend_cents_snapshot is null and w.status='available'
     and w.redeemed_at is null and w.consumed_at is null and w.deleted_at is null
     and (w.expires_at is null or w.expires_at > now())
     and public.minimum_effectif_centimes(null,null,g.min_spend) is not null;

  bloc := 'règle tickets'; cas := 'encore valide -> minimum affiché'; attendu := '590';
  obtenu := coalesce((select min_spend_cents_snapshot::text from public.winners where id=tV),'NULL');
  conforme := (select min_spend_cents_snapshot from public.winners where id=tV) = 590; return next;

  bloc := 'règle tickets'; cas := 'consommé -> inchangé'; attendu := 'NULL';
  obtenu := coalesce((select min_spend_cents_snapshot::text from public.winners where id=tC),'NULL');
  conforme := (select min_spend_cents_snapshot from public.winners where id=tC) is null; return next;

  bloc := 'règle tickets'; cas := 'expiré -> inchangé'; attendu := 'NULL';
  obtenu := coalesce((select min_spend_cents_snapshot::text from public.winners where id=tX),'NULL');
  conforme := (select min_spend_cents_snapshot from public.winners where id=tX) is null; return next;

  bloc := 'règle tickets'; cas := 'texte historique non réécrit'; attendu := '5,90';
  obtenu := coalesce((select min_spend from public.games where id=vG),'NULL');
  conforme := (select min_spend from public.games where id=vG) = '5,90'; return next;
end $o$;

create temp table _pol (polarite text, conformes int, total int, echecs text);

-- ═══ Polarité 1 : le contrat CORRIGÉ doit être VERT ═══
do $$
declare v_c int; v_t int; v_e text;
begin
  begin
    select count(*) filter (where conforme), count(*),
           string_agg(bloc||' / '||cas||' -> '||obtenu, ' | ') filter (where not conforme)
      into v_c, v_t, v_e from pg_temp.oracle_monetaire();
    raise exception using errcode='P9801', message='fin polarite corrigee';
  exception when sqlstate 'P9801' then
    insert into _pol values ('1. contrat corrigé', v_c, v_t, coalesce(v_e,'(aucun)'));
  end;
end $$;

-- ═══ Polarité 2 : le parseur PERMISSIF doit être ROUGE ═══
do $$
declare v_c int; v_t int; v_e text;
begin
  begin
    -- LA FAUTE historique, reproduite à l'identique : `else 0`.
    execute $f$
      create or replace function public.centimes_depuis_saisie(p_saisie text)
      returns integer language plpgsql immutable as $c$
      begin
        if btrim(coalesce(p_saisie,'')) = '' then return null; end if;
        if btrim(p_saisie) ~ '^[0-9]{1,6}$' then return btrim(p_saisie)::int * 100; end if;
        return 0;
      end $c$;
    $f$;
    select count(*) filter (where conforme), count(*),
           string_agg(bloc||' / '||cas||' -> '||obtenu, ' | ') filter (where not conforme)
      into v_c, v_t, v_e from pg_temp.oracle_monetaire();
    raise exception using errcode='P9802', message='fin polarite permissive';
  exception when sqlstate 'P9802' then
    insert into _pol values ('2. parseur permissif', v_c, v_t, coalesce(v_e,'(aucun)'));
  end;
end $$;

-- ═══ Restauration vérifiée, puis verdict ═══
do $$
declare v_c1 int; v_t1 int; v_c2 int; v_t2 int; v_intact boolean;
begin
  -- La sous-transaction a annulé le remplacement, mais on ne le suppose pas.
  execute (select def from _vrai_parseur);
  begin
    perform public.centimes_depuis_saisie('abc');
    v_intact := false;
  exception when sqlstate 'P0120' then v_intact := true;
            when others then v_intact := false;
  end;
  if not v_intact then
    raise exception 'HARNAIS MONNAIE : le vrai parseur n''a PAS été restauré.';
  end if;

  select conformes, total into v_c1, v_t1 from _pol where polarite='1. contrat corrigé';
  select conformes, total into v_c2, v_t2 from _pol where polarite='2. parseur permissif';
  if v_t1 is null or v_t2 is null then raise exception 'HARNAIS MONNAIE : une polarité non jouée.'; end if;
  if v_c1 <> v_t1 then
    raise exception 'HARNAIS MONNAIE : le contrat corrigé n''est vert qu''à %/%.', v_c1, v_t1; end if;
  if v_c2 >= v_t2 then
    raise exception 'HARNAIS MONNAIE : le parseur permissif passe %/% — l''oracle ne détecte pas le défaut.', v_c2, v_t2; end if;

  insert into _pol values ('3. restauration', 1, 1, 'vrai parseur rétabli, « abc » lève bien P0120');
  raise notice 'HARNAIS MONNAIE : corrigé %/%, permissif %/% (rouge attendu).', v_c1, v_t1, v_c2, v_t2;
end $$;

select polarite, conformes, total, echecs from _pol order by polarite;
