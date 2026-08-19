/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — LES LECTEURS APPLIQUENT LE MINIMUM QU'ILS AFFICHENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Éprouve la migration 20260819100000 en APPELANT RÉELLEMENT `play_game` et
 * `register_win`, pas en relisant leur texte. Un ticket est émis, son snapshot
 * est relu dans la table, la charge JSON rendue est comparée.
 *
 * ─── DEUX POLARITÉS ───
 *
 * Une assertion qui passe ne prouve rien tant qu'on n'a pas montré qu'elle
 * sait échouer. Ce harnais joue donc le même oracle deux fois :
 *
 *   1. avec les lecteurs CORRIGÉS      → tout doit être vert ;
 *   2. avec l'ANCIENNE lecture réinstallée (`^[0-9]+$` … `else 0`, le corps
 *      baseline verbatim) → les cas monétaires DOIVENT virer au rouge.
 *
 * Si la polarité 2 restait verte, l'oracle ne mesurerait rien.
 *
 * ─── CE FICHIER DÉGRADE TEMPORAIREMENT `play_game` ET `register_win` ───
 *
 * Il est donc RÉSERVÉ à une cible synthétique. La garde d'ouverture refuse
 * toute base portant un compte Auth, un profil, ou un restaurant qui ne soit
 * pas l'un des siens. Sur une base réelle, il s'arrête sans rien toucher.
 *
 * La restauration est vérifiée par EMPREINTE, pas par intention : si le corps
 * corrigé n'est pas exactement revenu, le harnais lève.
 *
 * ─── NULL N'EST PAS ZÉRO, ET NULL COUVRE DEUX CAS ───
 *
 * `NULL` veut dire « pas de condition à afficher ». Il recouvre deux
 * situations distinctes, et c'est assumé :
 *
 *   — rien n'a été saisi  → il n'y a effectivement aucun minimum ;
 *   — la valeur est illisible → aucun minimum n'est CONNAISSABLE.
 *
 * Dans les deux cas la bonne conduite est la même : ne rien afficher, ne rien
 * inventer. Ce qui est interdit, c'est de rendre `0` — « aucun minimum » — sur
 * une valeur illisible : c'est le défaut d'origine, et le harnais le teste
 * explicitement.
 */

-- ═══ GARDE : cible synthétique uniquement ═══

do $$
declare
  v_u int; v_p int; v_r int;
  c_prefixe constant text := '00000000-0000-4000-8000-00000000f0';
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants where id::text not like c_prefixe || '%';
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception using errcode = 'P9701',
      message = format('HARNAIS REFUSE : cible non synthetique (%s comptes Auth, %s profils, %s restaurants hors harnais). Ce fichier degrade temporairement play_game et register_win.', v_u, v_p, v_r);
  end if;

  if to_regprocedure('public.minimum_effectif_centimes(integer,integer,text)') is null then
    raise exception using errcode = 'P9701',
      message = 'HARNAIS INAPPLICABLE : minimum_effectif_centimes absente. Migration 20260819060000 non appliquee.';
  end if;
end $$;

-- ═══ On garde les corps CORRIGÉS pour les restaurer à l'identique ═══

create temp table _corps_corriges as
select p.proname, pg_get_functiondef(p.oid) as def,
       encode(digest(p.prosrc,'sha256'),'hex') as empreinte
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('play_game','register_win');

do $$
declare v_n int;
begin
  select count(*) into v_n from _corps_corriges;
  if v_n <> 2 then
    raise exception using errcode='P9701', message=format('HARNAIS : %s corps captures, 2 attendus.', v_n);
  end if;
end $$;

-- ═══ Fixtures : les quatre formes que porte `games.min_spend` ═══

create or replace function pg_temp.poser_fixtures() returns void language plpgsql as $f$
declare
  i int;
  formes text[][] := array[
    ['1','5,90',   'décimal — la forme mesurée en production'],
    ['2','10',     'entier — la seule forme que l''ancienne lecture acceptait'],
    ['3','abc',    'illisible — ne doit JAMAIS devenir zéro'],
    ['4','',       'vide — aucun minimum, et c''est correct']
  ];
  vR uuid; vG uuid; vP uuid;
begin
  delete from public.winners  where game_id::text like '00000000-0000-4000-8000-00000000f02%';
  delete from public.contacts where restaurant_id::text like '00000000-0000-4000-8000-00000000f01%';
  delete from public.prizes   where game_id::text like '00000000-0000-4000-8000-00000000f02%';
  delete from public.games    where id::text like '00000000-0000-4000-8000-00000000f02%';
  delete from public.restaurants where id::text like '00000000-0000-4000-8000-00000000f01%';

  for i in 1 .. array_length(formes,1) loop
    vR := ('00000000-0000-4000-8000-00000000f01' || formes[i][1])::uuid;
    vG := ('00000000-0000-4000-8000-00000000f02' || formes[i][1])::uuid;
    vP := ('00000000-0000-4000-8000-00000000f03' || formes[i][1])::uuid;

    insert into public.restaurants (id, name, slug)
      values (vR, 'resto-harnais-' || formes[i][1], 'resto-harnais-' || formes[i][1]);
    insert into public.games (id, restaurant_id, name, active_action, status, validity_days, min_spend)
      values (vG, vR, 'jeu-harnais-' || formes[i][1], 'wheel', 'active', 30, formes[i][2]);
    insert into public.prizes (id, game_id, label, color, weight)
      values (vP, vG, 'Lot ' || formes[i][1], '#000000', 100);
  end loop;

  -- Cinquième forme : le champ canonique DÉJÀ rempli doit primer sur le texte.
  insert into public.restaurants (id, name, slug)
    values ('00000000-0000-4000-8000-00000000f015','resto-harnais-5','resto-harnais-5');
  insert into public.games (id, restaurant_id, name, active_action, status, validity_days, min_spend, min_spend_cents)
    values ('00000000-0000-4000-8000-00000000f025','00000000-0000-4000-8000-00000000f015',
            'jeu-harnais-5','wheel','active',30,'99',750);
  insert into public.prizes (id, game_id, label, color, weight)
    values ('00000000-0000-4000-8000-00000000f035','00000000-0000-4000-8000-00000000f025','Lot 5','#000000',100);
end $f$;

-- ═══ L'ORACLE, écrit UNE fois, joué DEUX fois ═══

create or replace function pg_temp.oracle_lecteurs(p_marqueur text)
returns table(bloc text, cas text, attendu text, obtenu text, conforme boolean)
language plpgsql as $o$
declare
  i int;
  attendus text[][] := array[
    ['1','590',  '5,90 -> 590 centimes'],
    ['2','1000', '10 -> 1000 centimes'],
    ['3','NULL', 'illisible -> NULL, jamais 0'],
    ['4','NULL', 'vide -> NULL (aucun minimum)'],
    ['5','750',  'le champ canonique prime sur le texte']
  ];
  vG uuid; vP uuid; vJson jsonb; vSnap text; vW uuid;
begin
  -- ── play_game : tirage serveur, ticket émis, snapshot figé ──
  for i in 1 .. array_length(attendus,1) loop
    vG := ('00000000-0000-4000-8000-00000000f02' || attendus[i][1])::uuid;
    vJson := public.play_game(vG, 'play-' || p_marqueur || '-' || attendus[i][1] || '@harnais.test',
                              null, 'Harnais', false);

    bloc := 'play_game — JSON rendu'; cas := attendus[i][3];
    attendu := attendus[i][2];
    obtenu := case when vJson->>'success' <> 'true' then 'ECHEC ' || coalesce(vJson->>'error','?')
                   else coalesce(vJson->>'min_spend_cents','NULL') end;
    conforme := obtenu = attendus[i][2]; return next;

    vW := nullif(vJson->>'winner_id','')::uuid;
    bloc := 'play_game — snapshot du ticket'; cas := attendus[i][3];
    attendu := attendus[i][2];
    obtenu := coalesce((select min_spend_cents_snapshot::text from public.winners where id = vW),'NULL');
    conforme := obtenu = attendus[i][2]; return next;
  end loop;

  -- ── register_win : le lot est fourni, la lecture doit être la même ──
  for i in 1 .. array_length(attendus,1) loop
    vG := ('00000000-0000-4000-8000-00000000f02' || attendus[i][1])::uuid;
    vP := ('00000000-0000-4000-8000-00000000f03' || attendus[i][1])::uuid;
    vJson := public.register_win(vG, vP, 'reg-' || p_marqueur || '-' || attendus[i][1] || '@harnais.test',
                                 null, 'Harnais', false);

    bloc := 'register_win — JSON rendu'; cas := attendus[i][3];
    attendu := attendus[i][2];
    obtenu := case when vJson->>'success' <> 'true' then 'ECHEC ' || coalesce(vJson->>'error','?')
                   else coalesce(vJson->>'min_spend_cents','NULL') end;
    conforme := obtenu = attendus[i][2]; return next;

    vW := nullif(vJson->>'winner_id','')::uuid;
    bloc := 'register_win — snapshot du ticket'; cas := attendus[i][3];
    attendu := attendus[i][2];
    obtenu := coalesce((select min_spend_cents_snapshot::text from public.winners where id = vW),'NULL');
    conforme := obtenu = attendus[i][2]; return next;
  end loop;

  -- ── L'unité de `min_spend` : EUROS, hier comme aujourd'hui ──
  vJson := public.play_game('00000000-0000-4000-8000-00000000f021'::uuid,
                            'euros-' || p_marqueur || '@harnais.test', null, 'Harnais', false);
  bloc := 'unité conservée'; cas := 'min_spend reste en EUROS (5,90 € -> 5.90)';
  attendu := '5.90'; obtenu := coalesce(vJson->>'min_spend','NULL');
  conforme := obtenu = '5.90'; return next;

  bloc := 'unité conservée'; cas := 'min_spend_cents porte les CENTIMES (590)';
  attendu := '590'; obtenu := coalesce(vJson->>'min_spend_cents','NULL');
  conforme := obtenu = '590'; return next;

  -- ── Le snapshot fige : modifier le jeu ne réécrit pas un ticket émis ──
  vJson := public.play_game('00000000-0000-4000-8000-00000000f021'::uuid,
                            'fige-' || p_marqueur || '@harnais.test', null, 'Harnais', false);
  vW := nullif(vJson->>'winner_id','')::uuid;
  update public.games set min_spend = '99', min_spend_cents = 9900
   where id = '00000000-0000-4000-8000-00000000f021';

  bloc := 'snapshot'; cas := 'le jeu passe à 99 € : le ticket déjà émis ne bouge pas';
  attendu := '590';
  obtenu := coalesce(public.minimum_effectif_du_ticket(vW)::text,'NULL');
  conforme := obtenu = '590'; return next;

  update public.games set min_spend = '5,90', min_spend_cents = null
   where id = '00000000-0000-4000-8000-00000000f021';

  -- ── Le zéro explicite reste zéro, et ne se confond pas avec NULL ──
  update public.games set min_spend = '0', min_spend_cents = null
   where id = '00000000-0000-4000-8000-00000000f024';
  vJson := public.play_game('00000000-0000-4000-8000-00000000f024'::uuid,
                            'zero-' || p_marqueur || '@harnais.test', null, 'Harnais', false);
  bloc := 'zéro explicite'; cas := '« 0 » saisi -> 0, pas NULL';
  attendu := '0'; obtenu := coalesce(vJson->>'min_spend_cents','NULL');
  conforme := obtenu = '0'; return next;
  update public.games set min_spend = '' where id = '00000000-0000-4000-8000-00000000f024';
end $o$;

create temp table _pol (polarite text, conformes int, total int, echecs text);

-- ═══ Polarité 1 : les lecteurs CORRIGÉS doivent être VERTS ═══

do $$
declare v_c int; v_t int; v_e text;
begin
  perform pg_temp.poser_fixtures();
  select count(*) filter (where conforme), count(*),
         string_agg(bloc || ' / ' || cas || ' : attendu ' || attendu || ', obtenu ' || obtenu, E'\n')
                    filter (where not conforme)
    into v_c, v_t, v_e
  from pg_temp.oracle_lecteurs('p1');
  insert into _pol values ('1. lecteurs corrigés', v_c, v_t, coalesce(v_e,'(aucun)'));
end $$;

-- ═══ Polarité 2 : l'ANCIENNE lecture réinstallée doit virer au ROUGE ═══

do $$
declare
  v_def text; v_c int; v_t int; v_e text; v_h text; r record;
begin
  -- Le corps baseline, verbatim : `^[0-9]+$` … `else 0`, aucun snapshot écrit.
  select def into v_def from _corps_corriges where proname = 'play_game';
  v_def := replace(v_def,
    '  v_min_cents := minimum_effectif_centimes(null, v_game.min_spend_cents, v_game.min_spend);' || chr(10) ||
    '  v_min_euros := case when v_min_cents is null then null else round(v_min_cents / 100.0, 2) end;',
    '  v_min_cents := coalesce((case when v_game.min_spend ~ ''^[0-9]+$'' then v_game.min_spend::int else 0 end), 0);' || chr(10) ||
    '  v_min_euros := v_min_cents;');
  v_def := replace(v_def, ', prize_label_snapshot, min_spend_cents_snapshot, expires_at', ', prize_label_snapshot, expires_at');
  v_def := replace(v_def, '''Lot''), v_min_cents, v_expires_at', '''Lot''), v_expires_at');
  execute v_def;

  select def into v_def from _corps_corriges where proname = 'register_win';
  v_def := replace(v_def,
    '  v_min_cents := minimum_effectif_centimes(null, v_game.min_spend_cents, v_game.min_spend);' || chr(10) ||
    '  v_min_euros := case when v_min_cents is null then null else round(v_min_cents / 100.0, 2) end;',
    '  v_min_cents := coalesce((case when v_game.min_spend ~ ''^[0-9]+$'' then v_game.min_spend::int else 0 end), 0);' || chr(10) ||
    '  v_min_euros := v_min_cents;');
  v_def := replace(v_def, ', prize_label_snapshot, min_spend_cents_snapshot, expires_at', ', prize_label_snapshot, expires_at');
  v_def := replace(v_def, '''Lot''), v_min_cents, v_expires_at', '''Lot''), v_expires_at');
  execute v_def;

  /*
   * La dégradation doit avoir EU LIEU. Sans ce contrôle, une substitution qui
   * ne trouve pas sa cible réinstallerait le corps corrigé : la polarité 2
   * serait verte, et on conclurait « l'oracle ne mesure rien » alors que le
   * vrai défaut serait dans le harnais lui-même. Deux causes, un seul rouge :
   * c'est exactement ce qu'il ne faut pas.
   */
  for r in select proname, empreinte from _corps_corriges loop
    select encode(digest(p.prosrc,'sha256'),'hex') into v_h
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = r.proname;
    if v_h = r.empreinte then
      raise exception using errcode='P9705',
        message = format('HARNAIS : la degradation de %s n''a pas pris (empreinte inchangee). Les motifs de substitution ne correspondent plus au corps corrige — corriger le harnais, pas la migration.', r.proname);
    end if;
  end loop;

  perform pg_temp.poser_fixtures();
  select count(*) filter (where conforme), count(*),
         string_agg(bloc || ' / ' || cas, ' · ') filter (where not conforme)
    into v_c, v_t, v_e
  from pg_temp.oracle_lecteurs('p2');
  insert into _pol values ('2. ancienne lecture', v_c, v_t, coalesce(v_e,'(aucun)'));
end $$;

-- ═══ Restauration, vérifiée par empreinte ═══

do $$
declare r record; v_h text;
begin
  for r in select proname, def, empreinte from _corps_corriges loop
    execute r.def;
    select encode(digest(p.prosrc,'sha256'),'hex') into v_h
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = r.proname;
    if v_h is distinct from r.empreinte then
      raise exception using errcode='P9702',
        message = format('HARNAIS : restauration de %s INCOMPLETE (%s au lieu de %s). Intervention manuelle requise.',
                         r.proname, v_h, r.empreinte);
    end if;
  end loop;

  -- Les droits aussi : le harnais ne doit pas laisser une fonction ouverte.
  revoke all on function public.play_game(uuid, text, text, text, boolean) from public, anon, authenticated;
  revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
  grant execute on function public.play_game(uuid, text, text, text, boolean) to service_role;
  grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

  insert into _pol values ('3. restauration', 2, 2, 'les deux corps sont revenus a l''empreinte exacte');
end $$;

-- ═══ Nettoyage des fixtures ═══

do $$
begin
  delete from public.winners  where game_id::text like '00000000-0000-4000-8000-00000000f02%';
  delete from public.contacts where restaurant_id::text like '00000000-0000-4000-8000-00000000f01%';
  delete from public.prizes   where game_id::text like '00000000-0000-4000-8000-00000000f02%';
  delete from public.games    where id::text like '00000000-0000-4000-8000-00000000f02%';
  delete from public.restaurants where id::text like '00000000-0000-4000-8000-00000000f01%';
end $$;

-- ═══ Verdict, fail-closed ═══

do $$
declare v1 record; v2 record;
begin
  select * into v1 from _pol where polarite = '1. lecteurs corrigés';
  select * into v2 from _pol where polarite = '2. ancienne lecture';

  if v1.conformes <> v1.total then
    raise exception using errcode='P9703',
      message = format(E'HARNAIS LECTEURS MONETAIRES : %s/%s conformes avec les lecteurs corriges.\n%s',
                       v1.conformes, v1.total, v1.echecs);
  end if;

  /*
   * L'ancienne lecture doit échouer sur les cas monétaires. Si elle passait
   * l'oracle, l'oracle ne mesurerait rien — et le vert de la polarité 1
   * n'aurait aucune valeur.
   */
  if v2.conformes >= v2.total then
    raise exception using errcode='P9704',
      message = 'HARNAIS LECTEURS MONETAIRES : l''ANCIENNE lecture passe l''oracle. L''oracle ne mesure donc rien.';
  end if;

  /*
   * Et elle doit échouer sur LE cas qui porte le défaut de production — le
   * décimal — pas seulement sur un cas périphérique. Un compte global
   * « quelques rouges » se satisferait d'un échec accessoire.
   */
  if v2.echecs not like '%5,90 -> 590 centimes%' then
    raise exception using errcode='P9704',
      message = E'HARNAIS LECTEURS MONETAIRES : l''ancienne lecture echoue, mais PAS sur le cas decimal.\nEchecs observes : ' || v2.echecs;
  end if;
  if v2.echecs not like '%illisible -> NULL, jamais 0%' then
    raise exception using errcode='P9704',
      message = E'HARNAIS LECTEURS MONETAIRES : l''ancienne lecture ne se fait pas prendre sur « illisible -> 0 », qui est le coeur du defaut.\nEchecs observes : ' || v2.echecs;
  end if;

  raise notice 'HARNAIS LECTEURS MONETAIRES : %/% verts avec le correctif, %/% seulement sans lui.',
    v1.conformes, v1.total, v2.conformes, v2.total;
end $$;

select polarite, conformes, total,
       case when polarite like '2.%' then conformes || '/' || total || ' — l''ecart EST la preuve'
            else conformes || '/' || total end as lecture,
       echecs
from _pol order by polarite;
