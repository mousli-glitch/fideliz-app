/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — la fenêtre entre les réattributions et la suppression Auth
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819020000_fenetre_de_suppression_compte.sql`, à
 *  appliquer avant de jouer ce fichier.
 *
 *  ─── CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS ───
 *
 *  Il prouve, en une session et de bout en bout :
 *
 *    0. sans marqueur, un rattachement passe — le trigger n'est pas un mur ;
 *    1. la barrière prend bien `ExclusiveLock` sur `public.restaurants`
 *       (lu dans `pg_locks`, pas déduit du texte de la fonction) ;
 *    2. un INSERT qui rattache un restaurant à un compte marqué est refusé,
 *       avec le SQLSTATE applicatif `P0103` et pas une erreur quelconque ;
 *    3. un UPDATE qui POINTE une colonne vers un compte marqué est refusé ;
 *    4. LA SÉQUENCE DE LA PRIMITIVE NE SE BLOQUE PAS ELLE-MÊME. C'est le
 *       piège de ce trigger : sa première étape écrit `created_by = root` sur
 *       une ligne dont `owner_id` et `user_id` pointent ENCORE vers la cible.
 *       Un contrôle naïf de `NEW` les prendrait pour des rattachements
 *       interdits et rendrait toute suppression impossible. D'où le contrôle
 *       restreint aux colonnes qui CHANGENT — et d'où ce cas, qui l'éprouve ;
 *    5. après fermeture, le rattachement redevient possible ;
 *    6. fermer une fenêtre déjà fermée n'est pas une erreur.
 *
 *  Il NE prouve PAS l'entrelacement à deux sessions : qu'une transaction
 *  d'écriture déjà ouverte fasse réellement ATTENDRE `ouvrir_fenetre_suppression`,
 *  et que sa ligne soit ensuite vue par les réattributions. Le cas 1 établit
 *  le mécanisme (le verrou pris est bien celui qui, par la matrice de
 *  conflits de PostgreSQL, exclut `RowExclusiveLock` — donc tout INSERT,
 *  UPDATE ou DELETE) ; il n'établit pas l'observation de l'attente.
 *
 *  Trois voies ont été essayées sur la branche de test le 19/08/2026, et
 *  aucune n'était disponible — mesuré, pas supposé :
 *
 *    — `pg_cron` : absent des extensions installées, donc pas de session
 *      d'arrière-plan planifiable ;
 *    — `max_prepared_transactions` = 0 : pas de `PREPARE TRANSACTION`, donc
 *      pas de transaction concurrente détachée de sa session ;
 *    — l'exécuteur MCP sérialise les appels parallèles (établi lors des
 *      tours précédents), donc il ne peut pas produire de vraie concurrence.
 *
 *  La quatrième voie — deux appels PostgREST réellement parallèles, comme
 *  `scripts/harnais-gel-concurrence.mjs` — demande la clé REST de la BRANCHE.
 *  Elle n'est pas dans `.env.local`, qui porte les identifiants de
 *  PRODUCTION : les utiliser pointerait le harnais sur la base réelle. Elle
 *  reste donc à fournir, hors dépôt, avant de jouer cette partie.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Une transaction, annulée à la fin. Garde de cible synthétique avant toute
 *  mutation. Identités en `.invalid` (RFC 2606).
 *
 *  ATTENDU : 7 cas, tous conformes. Le verdict LÈVE sinon.
 *
 *  Joué le 19/08/2026 sur la branche de test synthétique — les 7 cas
 *  conformes, dont le cas 1 « ExclusiveLock » et le cas 4 « les 3 updates
 *  passent ; r1 -> 1 rattachement(s) root ».
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare v_u int; v_p int; v_r int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants;
  if v_u > 0 or v_p > 0 or v_r > 500 then
    raise exception 'HARNAIS REFUSÉ : cible non synthétique (% users, % profils, % restos). Aucune mutation.', v_u, v_p, v_r;
  end if;
  raise notice 'GARDE CIBLE SYNTHÉTIQUE : OK.';
end $$;

-- Garde anti-dérive : sans le trigger, ce harnais n'éprouverait rien.
do $$
declare v_n int;
begin
  select count(*) into v_n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'restaurants'
    and t.tgname = 'fenetre_de_suppression' and not t.tgisinternal
    and t.tgenabled = 'O'
    and t.tgfoid = 'public.refuser_rattachement_a_un_compte_en_suppression()'::regprocedure;
  if v_n <> 1 then
    raise exception 'HARNAIS INAPPLICABLE : % trigger `fenetre_de_suppression` conforme sur public.restaurants, 1 attendu. La migration 20260819020000 n''est pas appliquée.', v_n;
  end if;
end $$;

create temp table _fen (ordre int, cas text, conforme boolean, detail text) on commit drop;

do $$
declare
  v_root  uuid := '00000000-0000-4000-8000-00000000d001';
  v_cible uuid := '11111111-0000-4000-8000-00000000d002';
  v_r1    uuid := '22222222-0000-4000-8000-00000000d003';
  v_r2    uuid := '33333333-0000-4000-8000-00000000d004';
  v_code  text;
  v_lock  text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
    (v_root,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','fen-root@exemple.invalid','x',now(),now()),
    (v_cible, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','fen-cible@exemple.invalid','x',now(),now());
  insert into public.profiles (id, role, created_at) values (v_root,'root','2020-01-01')
    on conflict (id) do update set role='root', created_at='2020-01-01';
  insert into public.profiles (id, role) values (v_cible,'sales') on conflict (id) do update set role='sales';
  insert into public.restaurants (id,name,slug,created_by,owner_id,user_id)
    values (v_r1,'fen-un','fen-un',v_cible,v_cible,v_cible);

  -- 0. Sans marqueur, rien n'est entravé.
  begin
    insert into public.restaurants (id,name,slug,created_by,owner_id,user_id)
      values (v_r2,'fen-deux','fen-deux',v_cible,v_cible,v_cible);
    insert into _fen values (0,'sans marqueur : rattachement autorise', true, 'insert accepte');
    delete from public.restaurants where id = v_r2;
  exception when others then
    insert into _fen values (0,'sans marqueur : rattachement autorise', false, 'refus inattendu : '||sqlstate);
  end;

  perform public.ouvrir_fenetre_suppression(v_cible, v_root);

  -- 1. Le verrou RÉELLEMENT pris, lu dans le catalogue.
  select l.mode into v_lock
  from pg_locks l
  where l.locktype = 'relation' and l.relation = 'public.restaurants'::regclass
    and l.pid = pg_backend_pid() and l.granted and l.mode = 'ExclusiveLock';
  insert into _fen values (1,'la barriere prend bien ExclusiveLock sur restaurants',
                           v_lock = 'ExclusiveLock', coalesce(v_lock,'aucun verrou exclusif'));

  -- 2. Une NOUVELLE référence par INSERT : refusée, et pour le bon motif.
  begin
    insert into public.restaurants (id,name,slug,created_by,owner_id,user_id)
      values (v_r2,'fen-deux','fen-deux',null,null,v_cible);
    insert into _fen values (2,'INSERT vers un compte marque -> refus', false, 'accepte alors qu''il fallait refuser');
  exception when others then
    v_code := sqlstate;
    insert into _fen values (2,'INSERT vers un compte marque -> refus', v_code = 'P0103', 'sqlstate='||v_code);
  end;

  -- 3. Une NOUVELLE référence par UPDATE : refusée aussi.
  insert into public.restaurants (id,name,slug,created_by,owner_id,user_id)
    values (v_r2,'fen-deux','fen-deux',v_root,v_root,v_root);
  begin
    update public.restaurants set owner_id = v_cible where id = v_r2;
    insert into _fen values (3,'UPDATE qui pointe vers un compte marque -> refus', false, 'accepte alors qu''il fallait refuser');
  exception when others then
    v_code := sqlstate;
    insert into _fen values (3,'UPDATE qui pointe vers un compte marque -> refus', v_code = 'P0103', 'sqlstate='||v_code);
  end;

  -- 4. L'AUTO-BLOCAGE. Voir l'en-tête : c'est le cas qui justifie tout le
  --    dessin du trigger.
  begin
    update public.restaurants set created_by = v_root where created_by = v_cible;
    update public.restaurants set owner_id  = v_root where owner_id  = v_cible;
    update public.restaurants set user_id   = v_root where user_id   = v_cible;
    insert into _fen values (4,'la sequence de reattribution ne se bloque pas elle-meme', true,
      'les 3 updates passent ; r1 -> '||(select count(*)::text from public.restaurants
        where id=v_r1 and created_by=v_root and owner_id=v_root and user_id=v_root)||' rattachement(s) root');
  exception when others then
    insert into _fen values (4,'la sequence de reattribution ne se bloque pas elle-meme', false,
      'AUTO-BLOCAGE : '||sqlstate||' '||sqlerrm);
  end;

  -- 5. La fenêtre se referme.
  perform public.fermer_fenetre_suppression(v_cible);
  begin
    update public.restaurants set owner_id = v_cible where id = v_r2;
    insert into _fen values (5,'apres fermeture : rattachement de nouveau autorise', true, 'update accepte');
  exception when others then
    insert into _fen values (5,'apres fermeture : rattachement de nouveau autorise', false, 'refus : '||sqlstate);
  end;

  -- 6. Fermer deux fois : une reprise ne doit pas échouer là-dessus.
  begin
    perform public.fermer_fenetre_suppression(v_cible);
    insert into _fen values (6,'fermeture idempotente', true, 'second appel sans erreur');
  exception when others then
    insert into _fen values (6,'fermeture idempotente', false, sqlstate);
  end;
end $$;

-- VERDICT fail-closed : un cas non joué n'est pas un cas réussi.
do $$
declare v_echecs int; v_liste text; v_n int;
begin
  select count(*) into v_n from _fen;
  if v_n <> 7 then
    raise exception 'HARNAIS FENETRE : % cas enregistre(s), 7 attendus.', v_n;
  end if;
  select count(*), string_agg(ordre||'. '||cas||' - '||detail, E'\n' order by ordre)
    into v_echecs, v_liste from _fen where conforme is distinct from true;
  if v_echecs > 0 then
    raise exception E'HARNAIS FENETRE : % cas NON CONFORME(S).\n%', v_echecs, v_liste;
  end if;
  raise notice 'HARNAIS FENETRE : les 7 cas sont conformes.';
end $$;

select ordre, cas, conforme, detail from _fen order by ordre;

rollback;
