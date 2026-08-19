/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LOT 3 · ÉTAPE 2 — LE CONTRAT MONÉTAIRE (migration 20260819060000)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NE PAS EXÉCUTER SANS L'ACCORD EXPLICITE DE SAMY, ET SANS UN PRÉFLIGHT
 *    (`01-preflight-production.sql`) QUI RÉCLAME CETTE ÉTAPE.
 *
 * ─── CE QUE FAIT CETTE ÉTAPE ───
 *
 * Deux colonnes NULLABLES, deux contraintes NOT VALID, trois fonctions. C'est
 * tout. Rien n'est converti, rien n'est réécrit, `min_spend` reste en place et
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
 * `commit` restaure l'état précédent, colonnes et droits compris.
 *
 * ─── CE QU'IL NE FAIT PAS ───
 *
 * Aucun `insert`, `update` ou `delete` sur une table métier. Aucun backfill :
 * les jeux et les tickets existants gardent `NULL`, et sont lus comme avant sur
 * leur texte historique. La vérification finale le PROUVE par empreinte, elle
 * ne se contente pas de l'affirmer.
 *
 * ─── RETOUR ARRIÈRE ───
 *
 * ⚠️ Il n'y en a pas dans ce paquet, et c'est délibéré : `supabase/rollback/
 * 20260819060000_rollback.sql` SUPPRIME les deux colonnes. Jouer ce fichier
 * après l'étape 3 détruirait tous les `min_spend_cents_snapshot` écrits
 * depuis — c'est-à-dire la condition figée de chaque ticket émis entre-temps.
 * Voir `DANGER-retour-arriere-contrat.md`.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('lot-3:lecteurs-monetaires'));

/*
 * EMPREINTE DES DONNÉES MÉTIER, PRISE AU DÉBUT DE LA TRANSACTION.
 *
 * Ce fichier prétend ne toucher aucune donnée. Une affirmation ne vaut rien :
 * l'empreinte est relue avant le `commit` et comparée. Si une seule ligne a
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

-- ═══════════════════════════════════════════════════════════════════════════
--  CONTENU VERBATIM DE supabase/migrations/20260819060000_contrat_monetaire_centimes.sql
--  (recopié mécaniquement — `deploiement/lot-3-lecteurs-monetaires/paquet.test.ts`
--   vérifie que ce bloc est identique au fichier de migration)
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE MINIMUM D'ACHAT : UN CONTRAT, ET NON TROIS INTERPRÉTATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LE DÉFAUT, MESURÉ SUR LA PRODUCTION LE 19/08/2026 ───
 *
 * `games.min_spend` est de type `text`. Trois lecteurs, trois lectures :
 *
 *   `play_game` / `register_win`   `min_spend ~ '^[0-9]+$'` sinon 0
 *   page publique de vérification  `parseFloat`
 *   `getWinnerInfoAction`          entiers seulement
 *
 * Et l'écriture produit `"5.9"` pour une saisie « 5,90 ». Cette valeur ne
 * satisfait pas `^[0-9]+$` : le minimum APPLIQUÉ retombe donc à zéro, pendant
 * que le client voit « 5.9 » sur son ticket. La condition disparaît du côté
 * qui l'applique et survit du côté qui l'affiche.
 *
 * Relevé en lecture seule sur la base de production, par agrégats — aucun
 * identifiant, aucun montant individuel :
 *
 *     jeux total ..................................  9  (4 actifs)
 *     minimum a zero ..............................  5
 *     minimum ENTIER (seule categorie appliquee) ..  3
 *     minimum DECIMAL (affiche, applique comme 0) .  1  — ACTIF
 *     autre forme invalide ........................  0
 *     tickets rattaches a un minimum decimal ...... 127
 *
 * Un jeu actif, 127 tickets émis sous une condition jamais appliquée.
 *
 * ─── LA REPRÉSENTATION CANONIQUE ───
 *
 * Des CENTIMES ENTIERS. Pas de flottant, ni en SQL ni en JavaScript : un
 * montant n'est pas une quantité continue, et `0.1 + 0.2` ne vaut pas `0.3`.
 * `integer` suffit largement — la borne à 999999 € tient dans `int4` avec
 * quatre ordres de grandeur de marge.
 *
 * ─── ADDITIF, ET COMPATIBLE DANS LES DEUX SENS ───
 *
 * Rien n'est converti, rien n'est réécrit, `min_spend` reste en place. Le
 * nouveau code écrit les DEUX (texte historique + centimes) et lit dans
 * l'ordre : snapshot du ticket, puis champ canonique du jeu, puis lecture
 * stricte du texte historique. L'ancien code continue donc de fonctionner
 * pendant toute la transition, et les valeurs historiques `5`, `5.9`, `5.90`
 * deviennent correctes dès le nouveau code, sans exiger la moindre mutation.
 *
 * ─── UNE VALEUR ILLISIBLE NE DEVIENT JAMAIS ZÉRO ───
 *
 * C'est le cœur du défaut : `else 0` transformait « je ne sais pas lire » en
 * « aucun minimum ». `centimes_depuis_saisie` REFUSE (`P0120`) au lieu de
 * deviner, et `minimum_effectif_centimes` rend NULL — « indéterminé » — qui
 * ne se confond pas avec 0 — « aucun minimum ». Les deux se lisent
 * différemment, et c'est voulu.
 *
 * ─── LE SNAPSHOT ───
 *
 * `winners.prize_label_snapshot` fige déjà le libellé du lot au moment du
 * gain. Le minimum, lui, était relu sur le jeu COURANT : modifier le jeu
 * changeait donc rétroactivement la condition d'un ticket déjà émis.
 * `min_spend_cents_snapshot` ferme ça, sur le même modèle.
 *
 * Colonne NULLABLE et AUCUN backfill ici : les tickets existants gardent
 * `NULL` et retombent sur la lecture du jeu, exactement comme avant. Le
 * migrateur de reprise est un fichier séparé, en dry-run, et il n'est joué
 * sur aucune donnée réelle.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Migration AVANT code. Les colonnes étant nullables et les fonctions
 * nouvelles, l'ancien code continue de tourner sans les voir : cette
 * migration est sûre à appliquer seule.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer, prouver, puis ATTENDRE sa validation
 * finale avant toute application réelle. Ce fichier n'est pas à jouer en
 * production sans son aval explicite.
 *
 * MIGRATION ADDITIVE : deux colonnes nullables, trois fonctions. Aucune
 * colonne existante n'est modifiée, aucune donnée n'est réécrite.
 */

-- ────────────────────────────── lire une saisie, ou refuser de la lire

create or replace function public.centimes_depuis_saisie(p_saisie text)
returns integer
language plpgsql
immutable
as $$
declare
  v       text;
  v_norm  text;
  v_euros text;
  v_cents text;
begin
  v := btrim(coalesce(p_saisie, ''));

  /*
   * Rien de saisi = « aucun minimum ». C'est la règle existante, et elle est
   * conservée : NULL ici, que l'appelant lit comme « pas de condition ».
   * Distinct d'une valeur ILLISIBLE, qui lève.
   */
  if v = '' then
    return null;
  end if;

  -- Euros entiers.
  if v ~ '^[0-9]{1,6}$' then
    return v::int * 100;
  end if;

  /*
   * Euros et centimes, virgule ou point, une ou deux décimales.
   * `rpad` porte la règle qui manquait : « 5,9 » vaut 5,90 € — donc 590
   * centimes, pas 509 ni 59. Le calcul est entier de bout en bout.
   */
  if v ~ '^[0-9]{1,6}[.,][0-9]{1,2}$' then
    v_norm  := replace(v, ',', '.');
    v_euros := split_part(v_norm, '.', 1);
    v_cents := rpad(split_part(v_norm, '.', 2), 2, '0');
    return v_euros::int * 100 + v_cents::int;
  end if;

  /*
   * Tout le reste refuse : lettres, négatif, exponentiel, suffixe (`5abc`),
   * plus de deux décimales, dépassement. Jamais de repli silencieux sur zéro
   * — c'est précisément le défaut qu'on ferme.
   */
  raise exception using
    errcode = 'P0120',
    message = format('Montant invalide : « %s ». Attendu un nombre d''euros, avec au plus deux décimales (exemples : 0, 5, 5,90).', p_saisie),
    hint    = 'montant_invalide';
end;
$$;

comment on function public.centimes_depuis_saisie(text) is
  'Convertit une saisie monétaire en centimes entiers, sans flottant. Vide = NULL (aucun minimum). Toute valeur illisible LÈVE (P0120) au lieu de devenir zéro.';

-- ───────────────────────────────────── les deux colonnes canoniques

alter table public.games
  add column if not exists min_spend_cents integer;

comment on column public.games.min_spend_cents is
  'Minimum d''achat en centimes entiers — représentation canonique. NULL = pas encore renseigné ; lire alors `min_spend` (texte historique) via centimes_depuis_saisie.';

alter table public.winners
  add column if not exists min_spend_cents_snapshot integer;

comment on column public.winners.min_spend_cents_snapshot is
  'Minimum d''achat FIGÉ à l''émission du ticket, en centimes. Sur le modèle de prize_label_snapshot. NULL pour les tickets antérieurs : la lecture retombe alors sur le jeu, comme avant.';

/*
 * Bornes de cohérence, posées comme NOT VALID : elles s'appliquent aux
 * écritures NOUVELLES sans exiger de valider les lignes existantes, donc sans
 * balayage ni verrou long sur une table en service. La validation viendra
 * après le backfill, dans un lot séparé.
 */
/*
 * La détection est bornée à la TABLE, pas au seul nom.
 *
 * Signalé le 19/08/2026, et c'est juste : dans PostgreSQL un nom de contrainte
 * est unique par table, pas globalement. Un `conname = '…'` non qualifié
 * trouve donc une homonyme posée sur une AUTRE table — ou dans un autre
 * schéma — conclut « elle existe déjà », et saute silencieusement l'ALTER.
 * La borne n'est alors jamais posée, et rien ne le signale.
 *
 * C'est exactement la leçon du harnais de cascade, où une garde reconnaissait
 * un nom au lieu d'une sémantique. Elle vaut ici aussi.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.games'::regclass
      and contype  = 'c'
      and conname  = 'games_min_spend_cents_borne'
  ) then
    alter table public.games
      add constraint games_min_spend_cents_borne
      check (min_spend_cents is null or (min_spend_cents >= 0 and min_spend_cents <= 99999900))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.winners'::regclass
      and contype  = 'c'
      and conname  = 'winners_min_spend_cents_borne'
  ) then
    alter table public.winners
      add constraint winners_min_spend_cents_borne
      check (min_spend_cents_snapshot is null or (min_spend_cents_snapshot >= 0 and min_spend_cents_snapshot <= 99999900))
      not valid;
  end if;
end $$;

-- ──────────────────── la lecture, dans un ordre unique pour tout le monde

create or replace function public.minimum_effectif_centimes(
  p_snapshot         integer,
  p_jeu_centimes     integer,
  p_texte_historique text
)
returns integer
language plpgsql
immutable
as $$
begin
  /*
   * L'ordre est le contrat, et il vaut pour TOUS les lecteurs — scanner,
   * page publique, fonctions de jeu. Trois lecteurs qui appliquaient trois
   * règles, c'est ce qui a produit le défaut.
   *
   *   1. le snapshot du ticket   — la condition telle qu'elle était au gain
   *   2. le champ canonique      — pour un ticket antérieur au snapshot
   *   3. le texte historique     — lu STRICTEMENT, jamais deviné
   */
  if p_snapshot is not null then
    return p_snapshot;
  end if;
  if p_jeu_centimes is not null then
    return p_jeu_centimes;
  end if;

  /*
   * Une valeur historique illisible rend NULL — « indéterminé » — et NON
   * zéro. Les deux ne se lisent pas pareil : zéro veut dire « aucun
   * minimum », NULL veut dire « on ne sait pas, ne décide rien ». Confondre
   * les deux est exactement le bug d'origine.
   *
   * On rend NULL plutôt que de lever : une lecture qui échoue casserait la
   * page d'un client pour une donnée qui, mesurée, n'existe pas en production
   * (0 valeur invalide sur 9 jeux). L'anomalie reste visible sans être
   * bloquante.
   */
  begin
    return public.centimes_depuis_saisie(p_texte_historique);
  exception when sqlstate 'P0120' then
    return null;
  end;
end;
$$;

comment on function public.minimum_effectif_centimes(integer, integer, text) is
  'Le minimum applicable d''un ticket, en centimes : snapshot, puis champ canonique du jeu, puis lecture stricte du texte historique. Rend NULL pour « indéterminé », qui ne se confond pas avec 0 « aucun minimum ».';

-- Confort de lecture : la même règle, à partir d'un ticket.
create or replace function public.minimum_effectif_du_ticket(p_winner_id uuid)
returns integer
language sql
stable
as $$
  select public.minimum_effectif_centimes(w.min_spend_cents_snapshot, g.min_spend_cents, g.min_spend)
  from public.winners w
  join public.games g on g.id = w.game_id
  where w.id = p_winner_id;
$$;

comment on function public.minimum_effectif_du_ticket(uuid) is
  'Le minimum applicable d''un ticket donné, en centimes. Applique l''ordre de lecture canonique.';

revoke all on function public.centimes_depuis_saisie(text) from public, anon, authenticated;
revoke all on function public.minimum_effectif_centimes(integer, integer, text) from public, anon, authenticated;
revoke all on function public.minimum_effectif_du_ticket(uuid) from public, anon, authenticated;
grant execute on function public.centimes_depuis_saisie(text) to service_role;
grant execute on function public.minimum_effectif_centimes(integer, integer, text) to service_role;
grant execute on function public.minimum_effectif_du_ticket(uuid) to service_role;

notify pgrst, 'reload schema';

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

commit;
