/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE PAQUET EST GÉNÉRÉ, PAS RECOPIÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les fichiers 02, 03 et 05 embarquent une migration ou un rollback, pour être
 * des transactions autonomes. Recopier ce SQL à la main, c'est garantir qu'un
 * jour la migration sera corrigée et pas le paquet — et que le jour de
 * l'application, c'est l'ancienne version qui partira en production.
 *
 * Ce fichier construit le paquet à partir des sources. Le test
 * `supabase/verifications/paquet-lot-3.test.ts` compare ce qu'il produit aux
 * fichiers versionnés : toute dérive, dans un sens ou dans l'autre, échoue.
 *
 * Régénérer :  node deploiement/lot-3-lecteurs-monetaires/generer.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAQUET = path.join(RACINE, 'deploiement', 'lot-3-lecteurs-monetaires');

const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

const CONTRAT = lire('supabase/migrations/20260819060000_contrat_monetaire_centimes.sql');
const LECTEURS = lire('supabase/migrations/20260819100000_lecteurs_monetaires.sql');
const RB_LECTEURS = lire('supabase/rollback/20260819100000_rollback.sql');

const H = {
  playPre: 'bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2',
  playPost: '9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d',
  regPre: '32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442',
  regPost: '2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd',
};

/* ═══ Bloc réutilisable : empreinte des données métier, avant et après ═══ */
const CAPTURE = `
/*
 * EMPREINTE DES DONNÉES MÉTIER, PRISE AU DÉBUT DE LA TRANSACTION.
 *
 * Ce fichier prétend ne toucher aucune donnée. Une affirmation ne vaut rien :
 * l'empreinte est relue avant le \`commit\` et comparée. Si une seule ligne a
 * bougé, la transaction est annulée.
 */
create temp table if not exists _empreinte_avant (cle text primary key, valeur text);
delete from _empreinte_avant;
insert into _empreinte_avant
select 'lignes',
       (select count(*) from public.restaurants)::text || '/' ||
       (select count(*) from public.games)::text || '/' ||
       (select count(*) from public.prizes)::text || '/' ||
       (select count(*) from public.winners)::text || '/' ||
       (select count(*) from public.contacts)::text
union all
select 'min_spend',
       coalesce(md5(string_agg(g.id::text || '=' || coalesce(g.min_spend, '(null)'), '|' order by g.id)), '(aucun jeu)')
from public.games g;
`;

const VERIFICATION_DONNEES = `
do $donnees$
declare
  v_avant text; v_apres text;
begin
  select valeur into v_avant from _empreinte_avant where cle = 'lignes';
  v_apres := (select count(*) from public.restaurants)::text || '/' ||
             (select count(*) from public.games)::text || '/' ||
             (select count(*) from public.prizes)::text || '/' ||
             (select count(*) from public.winners)::text || '/' ||
             (select count(*) from public.contacts)::text;
  if v_apres is distinct from v_avant then
    raise exception using errcode = 'P0133',
      message = format('DONNEES MODIFIEES : %s avant, %s apres (restaurants/jeux/lots/tickets/contacts). Transaction annulee.', v_avant, v_apres);
  end if;

  select valeur into v_avant from _empreinte_avant where cle = 'min_spend';
  v_apres := coalesce((select md5(string_agg(g.id::text || '=' || coalesce(g.min_spend, '(null)'), '|' order by g.id))
                       from public.games g), '(aucun jeu)');
  if v_apres is distinct from v_avant then
    raise exception using errcode = 'P0133',
      message = 'DONNEES MODIFIEES : le texte historique min_spend a change. Transaction annulee — aucune migration de ce paquet ne doit reecrire une valeur metier.';
  end if;

  raise notice 'Donnees metier inchangees : memes lignes, meme texte min_spend.';
end $donnees$;
`;

/* ═════════════════════════════ 01 — PRÉFLIGHT ═════════════════════════════ */

const preflight = `/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 — PRÉFLIGHT PRODUCTION, LECTURE SEULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUCUNE écriture. Uniquement des métadonnées et des agrégats. Aucun montant
 * individuel, aucun identifiant client, aucune donnée personnelle.
 *
 * Lève au premier écart : zéro ligne rendue par un \`SELECT\` ne contient aucun
 * verdict rouge et se lit comme un succès.
 *
 * ─── CE QU'IL DÉTERMINE ───
 *
 * Quelles étapes sont nécessaires, en lisant l'état réel :
 *
 *   ETAPES 2 ET 3 REQUISES  le contrat monétaire est absent
 *   ETAPE 3 REQUISE         le contrat est là, les lecteurs sont d'origine
 *   DEJA APPLIQUE           les deux lecteurs portent le corps corrigé
 *
 * Tout autre état lève.
 *
 * ─── UNE PRÉCONDITION QUI N'EST PAS NÉGOCIABLE ───
 *
 * \`register_win\` doit porter l'isolation lot/jeu du hotfix du 19/08/2026. Si
 * la production portait encore le corps baseline, le préflight s'arrête : il
 * faudrait d'abord rejouer \`hotfix/isolation-lot-jeu/\`. Appliquer le lot 3
 * par-dessus une base non corrigée écraserait un correctif de sécurité par un
 * correctif d'affichage.
 */

do $preflight$
declare
  v_h text; v_n int; v_manif text; v_oid oid;
  v_contrat int := 0;
  v_etat text;

  c_play_pre  constant text := '${H.playPre}';
  c_play_post constant text := '${H.playPost}';
  c_reg_pre   constant text := '${H.regPre}';
  c_reg_post  constant text := '${H.regPost}';
  c_play_sig  constant text := 'p_game_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_reg_sig   constant text := 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';
  c_acl       constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  -- ── Les deux fonctions cibles existent, une seule fois chacune ──
  for v_etat in select unnest(array['play_game','register_win']) loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_etat;
    if v_n <> 1 then
      raise exception using errcode = 'P0134',
        message = format('PREFLIGHT ARRET : %s fonction(s) public.%s, 1 attendue.', v_n, v_etat);
    end if;
  end loop;

  -- ── play_game : signature, manifeste, corps connu ──
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'play_game';

  if v_manif is distinct from c_play_sig || ' | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : manifeste de play_game inattendu -> ' || v_manif;
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : service_role n''a pas EXECUTE sur play_game.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : anon ou authenticated peut executer play_game.';
  end if;
  if v_h not in (c_play_pre, c_play_post) then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : corps de play_game inconnu (empreinte %s). Ni la version auditee, ni la corrigee.', v_h);
  end if;
  v_etat := case when v_h = c_play_post then 'corrige' else 'origine' end;

  -- ── register_win : idem, PLUS l'isolation lot/jeu obligatoire ──
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_win';

  if v_manif is distinct from c_reg_sig || ' | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : manifeste de register_win inattendu -> ' || v_manif;
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : service_role n''a pas EXECUTE sur register_win.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode = 'P0134', message = 'PREFLIGHT ARRET : anon ou authenticated peut executer register_win.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'register_win'
      and position('and game_id = p_game_id;' in p.prosrc) > 0
      and position('and game_id = p_game_id and quantity > 0;' in p.prosrc) > 0
  ) then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : register_win ne porte PAS l''isolation lot/jeu. Rejouer d''abord hotfix/isolation-lot-jeu/. Le lot 3 ne doit jamais recouvrir un correctif de securite manquant.';
  end if;

  if v_h not in (c_reg_pre, c_reg_post) then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : corps de register_win inconnu (empreinte %s).', v_h);
  end if;

  -- Les deux lecteurs doivent être dans le MÊME état.
  if (v_h = c_reg_post) <> (v_etat = 'corrige') then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : play_game est %s mais register_win ne l''est pas. Etat mixte — ne rien appliquer sans comprendre pourquoi.', v_etat);
  end if;

  -- ── Le contrat monétaire : présent en entier, ou absent en entier ──
  if to_regprocedure('public.centimes_depuis_saisie(text)') is not null then v_contrat := v_contrat + 1; end if;
  if to_regprocedure('public.minimum_effectif_centimes(integer,integer,text)') is not null then v_contrat := v_contrat + 1; end if;
  if to_regprocedure('public.minimum_effectif_du_ticket(uuid)') is not null then v_contrat := v_contrat + 1; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='min_spend_cents') then v_contrat := v_contrat + 1; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then v_contrat := v_contrat + 1; end if;

  if v_contrat not in (0, 5) then
    raise exception using errcode = 'P0134',
      message = format('PREFLIGHT ARRET : contrat monetaire PARTIEL (%s/5 objets). Un demi-contrat ne se complete pas a l''aveugle.', v_contrat);
  end if;

  if v_contrat = 0 and v_etat = 'corrige' then
    raise exception using errcode = 'P0134',
      message = 'PREFLIGHT ARRET : les lecteurs sont corriges mais le contrat monetaire est absent. Etat impossible — play_game appellerait une fonction inexistante.';
  end if;

  if v_etat = 'corrige' then
    raise notice 'DEJA APPLIQUE : les deux lecteurs portent le corps corrige. NE RIEN EXECUTER.';
  elsif v_contrat = 5 then
    raise notice 'ETAPE 3 REQUISE : le contrat monetaire est en place, les lecteurs sont d''origine. Jouer 03-appliquer-lecteurs.sql.';
  else
    raise notice 'ETAPES 2 ET 3 REQUISES : contrat monetaire absent, lecteurs d''origine. Jouer 02 puis 03.';
  end if;
end $preflight$;

/*
 * VERDICT LISIBLE.
 *
 * \`RAISE NOTICE\` n'est pas rendu par tous les outils — l'editeur SQL de
 * Supabase, notamment, n'affiche que le dernier jeu de resultats. Ce SELECT
 * dit la meme chose, en lecture seule, sous une forme que tout le monde voit.
 */
select case
         when (select encode(digest(p.prosrc,'sha256'),'hex') from pg_proc p
               join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='play_game') = '${H.playPost}'
           then 'DEJA APPLIQUE — ne rien executer'
         when exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='games' and column_name='min_spend_cents')
           then 'ETAPE 3 REQUISE — jouer 03-appliquer-lecteurs.sql'
         else 'ETAPES 2 ET 3 REQUISES — jouer 02 puis 03'
       end as verdict,
       (select left(encode(digest(p.prosrc,'sha256'),'hex'),12) || '...' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='play_game') as play_game,
       (select left(encode(digest(p.prosrc,'sha256'),'hex'),12) || '...' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_win') as register_win,
       (select count(*) from information_schema.columns
        where table_schema='public'
          and ((table_name='games' and column_name='min_spend_cents')
            or (table_name='winners' and column_name='min_spend_cents_snapshot'))) as colonnes_contrat;
`;

/* ═══════════════════ 02 — CONTRAT MONÉTAIRE (060000) ═══════════════════ */

const appliquerContrat = `/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 · ÉTAPE 2 — LE CONTRAT MONÉTAIRE (migration 20260819060000)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NE PAS EXÉCUTER SANS L'ACCORD EXPLICITE DE SAMY, ET SANS UN PRÉFLIGHT
 *    (\`01-preflight-production.sql\`) QUI RÉCLAME CETTE ÉTAPE.
 *
 * ─── CE QUE FAIT CETTE ÉTAPE ───
 *
 * Deux colonnes NULLABLES, deux contraintes NOT VALID, trois fonctions. C'est
 * tout. Rien n'est converti, rien n'est réécrit, \`min_spend\` reste en place et
 * garde son texte.
 *
 * Les contraintes sont posées NOT VALID : elles s'appliquent aux écritures
 * NOUVELLES sans exiger de valider les lignes existantes, donc sans balayage ni
 * verrou long sur des tables en service.
 *
 * ─── POURQUOI CETTE ÉTAPE EST SÛRE SEULE ───
 *
 * Les colonnes sont nullables et les fonctions sont nouvelles : le code
 * actuellement déployé ne les voit pas et continue de tourner exactement comme
 * avant. Cette étape peut donc être jouée sans l'étape 3, et l'être longtemps
 * avant.
 *
 * L'INVERSE N'EST PAS VRAI : l'étape 3 exige celle-ci.
 *
 * ─── POURQUOI UNE TRANSACTION EXPLICITE ───
 *
 * Le fichier de migration n'en ouvre pas : il dépend donc du comportement de
 * l'outil qui l'exécute. Ici, il ne dépend plus de rien. Tout échec avant le
 * \`commit\` restaure l'état précédent, colonnes et droits compris.
 *
 * ─── CE QU'IL NE FAIT PAS ───
 *
 * Aucun \`insert\`, \`update\` ou \`delete\` sur une table métier. Aucun backfill :
 * les jeux et les tickets existants gardent \`NULL\`, et sont lus comme avant sur
 * leur texte historique. La vérification finale le PROUVE par empreinte, elle
 * ne se contente pas de l'affirmer.
 *
 * ─── RETOUR ARRIÈRE ───
 *
 * ⚠️ Il n'y en a pas dans ce paquet, et c'est délibéré : \`supabase/rollback/
 * 20260819060000_rollback.sql\` SUPPRIME les deux colonnes. Jouer ce fichier
 * après l'étape 3 détruirait tous les \`min_spend_cents_snapshot\` écrits
 * depuis — c'est-à-dire la condition figée de chaque ticket émis entre-temps.
 * Voir \`DANGER-retour-arriere-contrat.md\`.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('lot-3:lecteurs-monetaires'));
${CAPTURE}
-- ═══════════════════════════════════════════════════════════════════════════
--  CONTENU VERBATIM DE supabase/migrations/20260819060000_contrat_monetaire_centimes.sql
--  (recopié mécaniquement — \`deploiement/lot-3-lecteurs-monetaires/paquet.test.ts\`
--   vérifie que ce bloc est identique au fichier de migration)
-- ═══════════════════════════════════════════════════════════════════════════

${CONTRAT}
-- ═══════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION FINALE, DANS LA MÊME TRANSACTION
-- ═══════════════════════════════════════════════════════════════════════════

do $verif$
declare
  r record; v_n int;
  c_acl constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  -- Les deux colonnes, nullables, entières.
  for r in
    select 'games' as t, 'min_spend_cents' as c
    union all select 'winners', 'min_spend_cents_snapshot'
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=r.t and column_name=r.c
        and data_type='integer' and is_nullable='YES'
    ) then
      raise exception using errcode='P0133',
        message = format('ETAPE 2 : %s.%s absente, non entiere ou non nullable. Transaction annulee.', r.t, r.c);
    end if;
  end loop;

  -- Les deux bornes, posées et NON VALIDÉES (pas de balayage sur du service).
  for r in
    select 'games_min_spend_cents_borne' as n, 'public.games'::regclass as t
    union all select 'winners_min_spend_cents_borne', 'public.winners'::regclass
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = r.t and contype = 'c' and conname = r.n and not convalidated
    ) then
      raise exception using errcode='P0133',
        message = format('ETAPE 2 : contrainte %s absente de %s, ou validee alors qu''elle doit rester NOT VALID. Transaction annulee.', r.n, r.t::text);
    end if;
  end loop;

  -- Les trois fonctions, avec les bons droits effectifs.
  for r in
    select 'public.centimes_depuis_saisie(text)' as sig
    union all select 'public.minimum_effectif_centimes(integer,integer,text)'
    union all select 'public.minimum_effectif_du_ticket(uuid)'
  loop
    if to_regprocedure(r.sig) is null then
      raise exception using errcode='P0133',
        message = format('ETAPE 2 : %s absente. Transaction annulee.', r.sig);
    end if;
    if not has_function_privilege('service_role', to_regprocedure(r.sig)::oid, 'EXECUTE') then
      raise exception using errcode='P0133',
        message = format('ETAPE 2 : service_role n''a pas EXECUTE sur %s. Transaction annulee.', r.sig);
    end if;
    if has_function_privilege('anon', to_regprocedure(r.sig)::oid, 'EXECUTE')
       or has_function_privilege('authenticated', to_regprocedure(r.sig)::oid, 'EXECUTE') then
      raise exception using errcode='P0133',
        message = format('ETAPE 2 : anon ou authenticated peut executer %s. Transaction annulee.', r.sig);
    end if;
  end loop;

  -- Le contrat, éprouvé sur les trois formes qui portent le défaut.
  if public.centimes_depuis_saisie('5,90') is distinct from 590 then
    raise exception using errcode='P0133', message = 'ETAPE 2 : « 5,90 » ne vaut pas 590 centimes. Transaction annulee.';
  end if;
  if public.centimes_depuis_saisie('10') is distinct from 1000 then
    raise exception using errcode='P0133', message = 'ETAPE 2 : « 10 » ne vaut pas 1000 centimes. Transaction annulee.';
  end if;
  begin
    perform public.centimes_depuis_saisie('abc');
    raise exception using errcode='P0133', message = 'ETAPE 2 : « abc » a ete ACCEPTE au lieu de lever. Transaction annulee — c''est le defaut lui-meme.';
  exception when sqlstate 'P0120' then null;
  end;
  if public.minimum_effectif_centimes(null, null, 'abc') is not null then
    raise exception using errcode='P0133', message = 'ETAPE 2 : un montant illisible ne rend pas NULL. Transaction annulee.';
  end if;

  -- Aucun backfill : les colonnes viennent d'apparaître, elles restent vides.
  select count(*) into v_n from public.games where min_spend_cents is not null;
  if v_n <> 0 then
    raise notice 'ETAPE 2 : % jeu(x) portent deja min_spend_cents (rejeu, ou etape deja passee).', v_n;
  end if;

  raise notice 'ETAPE 2 : colonnes, bornes, fonctions, droits et contrat verifies dans la transaction.';
end $verif$;
${VERIFICATION_DONNEES}
commit;
`;

/* ═══════════════════ 03 — LECTEURS (100000) ═══════════════════ */

const appliquerLecteurs = `/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 · ÉTAPE 3 — LES LECTEURS (migration 20260819100000)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NE PAS EXÉCUTER SANS L'ACCORD EXPLICITE DE SAMY, SANS PRÉFLIGHT VERT, ET
 *    SANS QUE L'ÉTAPE 2 SOIT PASSÉE. La migration le vérifie et refuse sinon.
 *
 * ─── CE QUE CETTE ÉTAPE CHANGE POUR UN VRAI CLIENT ───
 *
 * À partir du \`commit\`, chaque ticket émis porte \`min_spend_cents_snapshot\` :
 * la condition est FIGÉE au moment du gain. Modifier le jeu ensuite ne change
 * plus ce qu'on exige d'un client dont le ticket est déjà imprimé.
 *
 * ─── CE QU'ELLE NE CHANGE PAS ENCORE, ET IL FAUT LE DIRE ───
 *
 * Le scanner du restaurateur continuera d'afficher « Aucun » sur un minimum
 * décimal, parce que le CODE déployé lit encore \`/^[0-9]+$/\`. Cette étape
 * corrige la base ; l'écran ne suivra qu'au déploiement du code du lot 3.
 *
 * Autrement dit : cette étape est nécessaire, elle n'est pas suffisante. Elle
 * est néanmoins utile seule — les snapshots écrits à partir de maintenant sont
 * corrects, et ils le resteront.
 *
 * ─── COMPATIBILITÉ AVEC LE CODE ACTUELLEMENT EN LIGNE ───
 *
 * Vérifiée sur \`origin/main\` le 19/08/2026. Les deux seuls consommateurs de
 * la valeur rendue écrivent \`result.min_spend || 0\`, et le navigateur ne lit
 * que \`ticket.qr_code\`. La valeur passe de \`0\` à \`5.9\` sur un jeu décimal :
 * personne ne s'en sert, rien ne casse.
 *
 * ─── RETOUR ARRIÈRE ───
 *
 * \`05-retour-arriere-lecteurs.sql\` existe, il est borné, et il NE ROUVRE PAS
 * la faille d'isolation lot/jeu. Il rouvre en revanche le défaut d'affichage :
 * à ne jouer que sur décision explicite de Samy.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('lot-3:lecteurs-monetaires'));
${CAPTURE}
-- ═══════════════════════════════════════════════════════════════════════════
--  CONTENU VERBATIM DE supabase/migrations/20260819100000_lecteurs_monetaires.sql
--  (recopié mécaniquement — \`paquet.test.ts\` vérifie l'identité)
-- ═══════════════════════════════════════════════════════════════════════════

${LECTEURS}
${VERIFICATION_DONNEES}
commit;
`;

/* ═══════════════════ 04 — CONTRÔLES POST ═══════════════════ */

const controlesPost = `/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 — CONTRÔLES APRÈS APPLICATION, LECTURE SEULE, FAIL-CLOSED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUCUNE écriture. Lève au premier écart.
 *
 * ─── EN CAS D'ANOMALIE : NE PAS JOUER LE RETOUR ARRIÈRE PAR RÉFLEXE ───
 *
 *   1. ARRÊT IMMÉDIAT — ne rien relancer, ne rien « réessayer ».
 *   2. CONSERVER LES PREUVES — sortie observée, empreintes, heure.
 *   3. NEUTRALISER LE PARCOURS si l'émission des tickets devient incohérente
 *      (hors service est moins grave qu'incohérent).
 *   4. CORRECTION FORWARD en priorité.
 *   5. RETOUR ARRIÈRE EN DERNIER RECOURS, et uniquement sur décision explicite
 *      de Samy, après avoir établi que l'incident vient de CE lot.
 *
 * Et JAMAIS le rollback de l'étape 2 : il supprime les colonnes, donc les
 * conditions figées de tous les tickets émis depuis.
 */

do $post$
declare
  r record; v_attendu text;
  c_play_post constant text := '${H.playPost}';
  c_reg_post  constant text := '${H.regPost}';
  c_acl       constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  -- ── Le contrat monétaire, en entier ──
  for r in
    select 'public.centimes_depuis_saisie(text)' as sig
    union all select 'public.minimum_effectif_centimes(integer,integer,text)'
    union all select 'public.minimum_effectif_du_ticket(uuid)'
  loop
    if to_regprocedure(r.sig) is null then
      raise exception 'CONTROLE ARRET : % absente. ARRET IMMEDIAT.', r.sig;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='games' and column_name='min_spend_cents') then
    raise exception 'CONTROLE ARRET : games.min_spend_cents absente. ARRET IMMEDIAT.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then
    raise exception 'CONTROLE ARRET : winners.min_spend_cents_snapshot absente. ARRET IMMEDIAT.';
  end if;

  -- ── Les deux lecteurs : corps, manifeste, droits ──
  for r in
    select p.oid, p.proname, encode(digest(p.prosrc,'sha256'),'hex') as h,
           pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
             || ' | secdef=' || p.prosecdef::text
             || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
             || ' | vol=' || p.provolatile::text
             || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                       from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)') as manif
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in ('play_game','register_win')
  loop
    v_attendu := case r.proname when 'play_game' then c_play_post else c_reg_post end;
    if r.h is distinct from v_attendu then
      raise exception 'CONTROLE ARRET : empreinte de % = % au lieu de %.', r.proname, r.h, v_attendu;
    end if;
    if r.manif not like '% | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
      raise exception 'CONTROLE ARRET : manifeste de % non conforme -> %', r.proname, r.manif;
    end if;
    if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'CONTROLE ARRET : service_role a PERDU EXECUTE sur % — le parcours joueur est casse.', r.proname;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception 'CONTROLE ARRET : anon ou authenticated a acquis EXECUTE sur %.', r.proname;
    end if;
  end loop;

  -- ── L'isolation lot/jeu du hotfix doit être intacte ──
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='register_win'
      and position('and game_id = p_game_id;' in p.prosrc) > 0
      and position('and game_id = p_game_id and quantity > 0;' in p.prosrc) > 0
  ) then
    raise exception 'CONTROLE ARRET : l''isolation lot/jeu a DISPARU de register_win. ARRET IMMEDIAT — un P0 de securite est rouvert.';
  end if;

  -- ── Le contrat répond juste, sur les formes qui portent le défaut ──
  if public.centimes_depuis_saisie('5,90') is distinct from 590 then
    raise exception 'CONTROLE ARRET : « 5,90 » ne vaut pas 590 centimes.';
  end if;
  if public.minimum_effectif_centimes(null, null, 'abc') is not null then
    raise exception 'CONTROLE ARRET : un montant illisible ne rend pas NULL.';
  end if;
  if public.minimum_effectif_centimes(590, 1200, '99') is distinct from 590 then
    raise exception 'CONTROLE ARRET : le snapshot ne prime pas sur le jeu.';
  end if;

  raise notice 'CONTROLE OK : contrat, lecteurs, manifestes, droits et isolation lot/jeu conformes.';
end $post$;

/*
 * ─── OBSERVATION, NON CONCLUANTE ET VOLONTAIREMENT NON BLOQUANTE ───
 *
 * Sur une production active, de vrais joueurs font varier ces totaux entre deux
 * lectures. Un écart ne signale pas le lot, et une absence d'écart ne
 * l'innocente pas. Ces chiffres sont là pour l'œil de l'opérateur.
 *
 * La ligne qui compte vraiment est la dernière : à partir du \`commit\` de
 * l'étape 3, les tickets NOUVEAUX doivent porter un snapshot. Elle ne vaut donc
 * que si des gains ont eu lieu depuis.
 */
select (select count(*) from public.games)   as jeux,
       (select count(*) from public.prizes)  as lots,
       (select count(*) from public.winners) as tickets,
       (select count(*) from public.winners where min_spend_cents_snapshot is not null) as tickets_avec_snapshot,
       'observation non concluante — ne pas en faire un critere' as portee;
`;

/* ═══════════════════ 05 — RETOUR ARRIÈRE (lecteurs seuls) ═══════════════════ */

const retourArriere = `/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 — RETOUR ARRIÈRE DE L'ÉTAPE 3 SEULEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CE FICHIER RÉOUVRE LE DÉFAUT D'AFFICHAGE. Un minimum décimal redeviendra
 *    « aucun minimum » pour le scanner du restaurateur.
 *
 * À ne jouer que sur décision explicite de Samy, après avoir établi que
 * l'incident vient de ce lot — et non d'autre chose survenu au même moment.
 * La marche à suivre reste : arrêt, preuves, neutralisation, correction
 * forward, et CE fichier en dernier.
 *
 * ─── CE QU'IL NE DÉFAIT PAS, ET C'EST VOULU ───
 *
 * 1. \`register_win\` revient à son état POST-HOTFIX. L'isolation lot/jeu du
 *    19/08/2026 est CONSERVÉE, et le fichier le vérifie. Annuler un correctif
 *    d'affichage ne doit jamais rouvrir un P0 de sécurité.
 *
 * 2. Les colonnes de l'étape 2 restent en place, et les snapshots déjà écrits
 *    restent écrits. Ils sont simplement ignorés par les corps restaurés. Rien
 *    n'est effacé — voir \`DANGER-retour-arriere-contrat.md\`.
 *
 * ─── BORNÉ ET IDEMPOTENT ───
 *
 * Refuse tout corps qui n'est ni le corrigé, ni celui d'avant. Rejoué sur un
 * état déjà revenu en arrière : ne fait rien.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('lot-3:lecteurs-monetaires'));
${CAPTURE}
-- ═══════════════════════════════════════════════════════════════════════════
--  CONTENU VERBATIM DE supabase/rollback/20260819100000_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

${RB_LECTEURS}
${VERIFICATION_DONNEES}
commit;
`;

/* ═══════════════════ Sortie ═══════════════════ */

/**
 * Rend le paquet sous forme de chaînes, sans rien écrire.
 *
 * Le README n'est pas généré : il est rédigé à la main et porte les résultats
 * mesurés de la répétition générale, qu'aucun script ne saurait produire.
 */
export function construire() {
  return {
    '01-preflight-production.sql': preflight,
    '02-appliquer-contrat-monetaire.sql': appliquerContrat,
    '03-appliquer-lecteurs.sql': appliquerLecteurs,
    '04-controles-post.sql': controlesPost,
    '05-retour-arriere-lecteurs.sql': retourArriere,
  };
}

/* Lancé directement : (ré)écrit les fichiers du paquet. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [nom, contenu] of Object.entries(construire())) {
    fs.writeFileSync(path.join(PAQUET, nom), contenu);
    console.log(nom.padEnd(40), String(contenu.length).padStart(6), 'octets');
  }
}
