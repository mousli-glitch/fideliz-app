/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — la machine d'état du hotfix, éprouvée sur ses NEUF états
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Signalé, à raison : le rapport affirmait que les deux états partiels
 *  avaient été injectés et refusés, mais le dépôt n'en gardait que des
 *  commentaires. Une preuve racontée n'est pas une preuve — c'est le même
 *  reproche que j'ai adressé deux fois à d'autres fichiers, et il valait
 *  encore pour moi.
 *
 *  ─── LES NEUF TRANSITIONS ÉPROUVÉES ───
 *
 *      1. préimage -> application ................. APPLIQUÉ
 *      2. réapplication ........................... NO-OP strict
 *      3. postimage -> rollback ................... PRÉIMAGE exacte
 *      4. rollback rejoué ......................... NO-OP strict
 *      5. nouvelle application .................... APPLIQUÉ
 *      6. chargement corrigé SEUL ................. refus des DEUX
 *      7. décrément corrigé SEUL .................. refus des DEUX
 *      8. corps inconnu (commentaire ajouté) ...... refus des DEUX
 *      9. fonction absente ........................ refus des DEUX
 *     10. restauration finale ..................... POSTIMAGE vérifié
 *
 *  ─── SUR LA FIDÉLITÉ À CE QUI EST LIVRÉ ───
 *
 *  Ce fichier réimplémente la machine d'état des scripts livrés : SQL ne sait
 *  pas inclure un autre fichier. Deux garde-fous compensent, dans
 *  `harnais-hotfix.test.ts` :
 *
 *    — les copies du paquet `hotfix/` doivent contenir VERBATIM le bloc
 *      canonique de la migration et du rollback ;
 *    — ce harnais doit porter EXACTEMENT les mêmes constantes — empreintes et
 *      fragments — que les fichiers canoniques.
 *
 *  C'est la meilleure fidélité atteignable ici, et je le dis plutôt que de
 *  laisser croire que le harnais exécute les fichiers eux-mêmes.
 *
 *  ─── SÉCURITÉ ───
 *
 *  ⚠️ Ce fichier rend `register_win` temporairement VULNÉRABLE et fabrique
 *  des corps invalides. Cible synthétique VIERGE uniquement — la garde le
 *  vérifie avant toute chose. Restauration finale vérifiée par empreinte.
 *
 *  Les longueurs sont en CARACTÈRES (`length`), pas en octets : le corps est
 *  multioctet (3600 caractères pour 3604 octets sur le corrigé). Le SHA-256
 *  reste l'autorité sur l'identité.
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
    raise exception 'HARNAIS REFUSÉ : cible non vierge (% Auth, % profils, % restaurants). Ce fichier rend register_win temporairement VULNÉRABLE.', v_u, v_p, v_r;
  end if;
end $$;

create or replace function pg_temp.transition_hotfix(p_sens text) returns text
language plpgsql as $t$
declare
  v_src text; v_h text; v_def text; v_new text; v_hnew text;
  v_secdef boolean; v_config text; v_vol "char"; v_n int;
  c_sig  constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_pre  constant text := '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3';
  c_post constant text := '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442';
  c_lot_v constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_lot_c constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_stk_v constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
  c_stk_c constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
  c_depart text; c_arrivee text; c_a text; c_b text; c_c text; c_d text;
begin
  if p_sens = 'appliquer' then
    c_depart := c_pre; c_arrivee := c_post; c_a := c_lot_v; c_b := c_lot_c; c_c := c_stk_v; c_d := c_stk_c;
  else
    c_depart := c_post; c_arrivee := c_pre; c_a := c_lot_c; c_b := c_lot_v; c_c := c_stk_c; c_d := c_stk_v;
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='register_win';
  if v_n = 0 then return 'REFUS : fonction absente'; end if;
  if v_n > 1 then return format('REFUS : %s surcharges', v_n); end if;

  select p.prosrc, encode(digest(p.prosrc,'sha256'),'hex'), pg_get_functiondef(p.oid),
         p.prosecdef, coalesce(array_to_string(p.proconfig,','),''), p.provolatile
    into v_src, v_h, v_def, v_secdef, v_config, v_vol
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='register_win'
    and pg_get_function_identity_arguments(p.oid) = c_sig;
  if v_src is null then return 'REFUS : signature inattendue'; end if;
  if not v_secdef or v_config is distinct from 'search_path=public' or v_vol <> 'v' then
    return 'REFUS : attributs inattendus'; end if;
  if v_h = c_arrivee then return 'NO-OP strict'; end if;
  if v_h <> c_depart then return 'REFUS : empreinte inconnue ' || left(v_h,12) || '...'; end if;
  v_n := (length(v_src) - length(replace(v_src, c_a, ''))) / length(c_a);
  if v_n <> 1 then return format('REFUS : chargement, %s occurrence(s)', v_n); end if;
  v_n := (length(v_src) - length(replace(v_src, c_c, ''))) / length(c_c);
  if v_n <> 1 then return format('REFUS : decrement, %s occurrence(s)', v_n); end if;
  v_new := replace(replace(v_def, c_a, c_b), c_c, c_d);
  execute v_new;
  select encode(digest(p.prosrc,'sha256'),'hex') into v_hnew from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_win';
  if v_hnew is distinct from c_arrivee then
    raise exception 'POSTIMAGE inattendu : % au lieu de %', v_hnew, c_arrivee; end if;
  return 'APPLIQUE';
end $t$;

create or replace function pg_temp.etat_hotfix() returns text language sql stable as $$
  select coalesce((
    select case encode(digest(p.prosrc,'sha256'),'hex')
      when '374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3' then 'PREIMAGE'
      when '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442' then 'POSTIMAGE'
      else 'INCONNU' end
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='register_win'), 'ABSENTE');
$$;

create temp table _me (ordre int, etat_depart text, transition text, resultat text, etat_arrivee text);

-- ─── Transitions nominales, sur l'état réel ───
do $$
declare v_r text; v_d text;
begin
  v_d := pg_temp.etat_hotfix();
  if v_d = 'POSTIMAGE' then
    v_r := pg_temp.transition_hotfix('annuler');
    insert into _me values (0, v_d, 'annuler (mise en position)', v_r, pg_temp.etat_hotfix());
  end if;

  v_d := pg_temp.etat_hotfix(); v_r := pg_temp.transition_hotfix('appliquer');
  insert into _me values (1, v_d, 'appliquer', v_r, pg_temp.etat_hotfix());

  v_d := pg_temp.etat_hotfix(); v_r := pg_temp.transition_hotfix('appliquer');
  insert into _me values (2, v_d, 'appliquer (rejoue)', v_r, pg_temp.etat_hotfix());

  v_d := pg_temp.etat_hotfix(); v_r := pg_temp.transition_hotfix('annuler');
  insert into _me values (3, v_d, 'annuler', v_r, pg_temp.etat_hotfix());

  v_d := pg_temp.etat_hotfix(); v_r := pg_temp.transition_hotfix('annuler');
  insert into _me values (4, v_d, 'annuler (rejoue)', v_r, pg_temp.etat_hotfix());

  v_d := pg_temp.etat_hotfix(); v_r := pg_temp.transition_hotfix('appliquer');
  insert into _me values (5, v_d, 'appliquer (nouvelle)', v_r, pg_temp.etat_hotfix());
end $$;

-- ─── États anormaux injectés : chacun doit être refusé DES DEUX CÔTÉS ───
do $$
declare
  v_def text; v_e text; v_mig text; v_rb text; i int;
  v_noms text[] := array['chargement corrige SEUL','decrement corrige SEUL','corps inconnu','fonction absente'];
begin
  for i in 1..4 loop
    begin
      select pg_get_functiondef(p.oid) into v_def from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_win';

      if i = 1 then
        v_def := replace(v_def,
          'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;',
          'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;');
        execute v_def;
      elsif i = 2 then
        v_def := replace(v_def,
          'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;',
          'select * into v_prize from prizes where id = p_prize_id;');
        execute v_def;
      elsif i = 3 then
        -- Corps par ailleurs correct, mais un commentaire ajouté : empreinte
        -- differente, donc etat inconnu.
        v_def := replace(v_def, 'declare', '-- variante non auditee' || chr(10) || 'declare');
        execute v_def;
      else
        execute 'drop function public.register_win(uuid,uuid,text,text,text,boolean)';
      end if;

      v_e := pg_temp.etat_hotfix();
      v_mig := pg_temp.transition_hotfix('appliquer');
      v_rb  := pg_temp.transition_hotfix('annuler');
      raise exception using errcode='P9601', message='annulation etat anormal';
    exception when sqlstate 'P9601' then
      insert into _me values (5 + i, v_e, v_noms[i], 'migration: ' || v_mig || ' | rollback: ' || v_rb, 'annule');
    end;
  end loop;
end $$;

-- ─── Restauration et verdict ───
do $$
declare v_r text; v_etat text; v_echecs int; v_liste text;
begin
  v_r := pg_temp.transition_hotfix('appliquer');
  v_etat := pg_temp.etat_hotfix();
  insert into _me values (10, v_etat, 'restauration finale', v_r, v_etat);

  if v_etat <> 'POSTIMAGE' then
    raise exception 'HARNAIS MACHINE D''ETAT : restauration incomplete (%). Intervention manuelle requise.', v_etat;
  end if;

  -- Les quatre états anormaux doivent avoir été refusés des DEUX côtés.
  select count(*), string_agg(transition || ' -> ' || resultat, E'\n')
    into v_echecs, v_liste
  from _me
  where ordre between 6 and 9
    and not (resultat like 'migration: REFUS%' and resultat like '%| rollback: REFUS%');
  if v_echecs > 0 then
    raise exception E'HARNAIS MACHINE D''ETAT : % etat(s) anormal(aux) NON REFUSE(S).\n%', v_echecs, v_liste;
  end if;

  -- Et les transitions nominales doivent avoir la bonne forme.
  if (select resultat from _me where ordre = 1) <> 'APPLIQUE'
     or (select resultat from _me where ordre = 2) <> 'NO-OP strict'
     or (select resultat from _me where ordre = 3) <> 'APPLIQUE'
     or (select resultat from _me where ordre = 4) <> 'NO-OP strict'
     or (select etat_arrivee from _me where ordre = 3) <> 'PREIMAGE' then
    raise exception 'HARNAIS MACHINE D''ETAT : une transition nominale n''a pas la forme attendue.';
  end if;

  raise notice 'HARNAIS MACHINE D''ETAT : les 10 transitions sont conformes.';
end $$;

select ordre, etat_depart, transition, resultat, etat_arrivee from _me order by ordre;
