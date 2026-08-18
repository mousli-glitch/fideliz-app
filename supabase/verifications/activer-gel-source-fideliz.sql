/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ACTIVATION du gel source Fideliz — propriétaire seulement, fail-closed
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  À exécuter en SQL direct sous le rôle propriétaire de la table
 *  (connexion admin du runbook) — JAMAIS avec la clé de service de
 *  l'application, qui n'a plus aucun droit sur `maintenance` depuis le
 *  19/08/2026 (voir `20260818160000_gel_source_fideliz.sql`).
 *
 *  Ne se contente pas d'un `update` nu, et ne se contente plus non plus
 *  d'un simple COMPTE de triggers. Avant d'écrire, vérifie :
 *   1. que la table `maintenance` existe ;
 *   2. que les 10 triggers `gel_de_bascule` attendus existent EXACTEMENT
 *      comme prévu — pas seulement leur nombre.
 *  Après l'`update`, vérifie qu'EXACTEMENT une ligne est passée à `true`.
 *
 *  Signalé le 19/08/2026 : un `update ... where id;` nu, sans contrôle du
 *  nombre de lignes affectées, peut échouer silencieusement — l'opérateur
 *  du runbook croit avoir gelé la source, elle ne l'est pas.
 *
 *  ─── VÉRIFICATION EXHAUSTIVE PAR pg_trigger/pg_proc, PAS PAR TEXTE ───
 *
 *  Signalé le 19/08/2026 (5e tour) : la version précédente lisait
 *  `information_schema.triggers` et reconnaissait la fonction par
 *  `action_statement ilike '%refuser_pendant_maintenance%'` — une
 *  correspondance TEXTUELLE, pas une identité. Une fonction nommée
 *  `evil_refuser_pendant_maintenance_bypass()` aurait matché. La portée
 *  `FOR EACH ROW` n'était jamais contrôlée du tout (`information_schema`
 *  ne l'expose pas directement de façon fiable pour ce contrôle).
 *
 *  Corrigé : lecture directe de `pg_trigger`/`pg_proc`, catalogues
 *  système, pas du texte reconstruit.
 *   - `t.tgfoid = 'public.refuser_pendant_maintenance()'::regprocedure`
 *     — comparaison d'OID, identité exacte de la fonction, aucune
 *     ambiguïté possible avec un nom ressemblant.
 *   - `t.tgtype = 31` — bitmask PostgreSQL vérifié en direct sur cette
 *     branche avant d'être codé en dur (`ROW`=1 + `BEFORE`=2 +
 *     `INSERT`=4 + `DELETE`=8 + `UPDATE`=16 = 31). L'égalité STRICTE,
 *     pas une comparaison par bit, exclut aussi bien un trigger
 *     `STATEMENT` (bit `ROW` absent) qu'un trigger portant en plus
 *     `TRUNCATE` (bit 32 présent) — « aucun événement supplémentaire »,
 *     pas seulement « au moins ces trois-là ».
 *   - `t.tgenabled = 'O'` — activé normalement (`D` = désactivé,
 *     `R`/`A` = activé seulement en mode replica/always, jamais
 *     l'attendu ici).
 *   - Un trigger PAR table (compté depuis `pg_trigger` directement, pas
 *     reconstruit depuis des lignes déjà éclatées par événement).
 */

begin;

do $$
declare
  v_tables_attendues text[] := array[
    'winners', 'contacts', 'prizes', 'games', 'restaurants',
    'profiles', 'avis', 'crm_notes', 'sales_restaurants', 'winners_archive'
  ];
  v_ecarts   int;
  v_detail   text;
  v_extra    int;
  v_actif_avant boolean;
  v_lignes   int;
begin
  if to_regclass('public.maintenance') is null then
    raise exception 'ACTIVATION REFUSÉE : table public.maintenance introuvable.';
  end if;

  -- ─── Comparaison exacte, par catalogue système, table par table.
  with attendues as (
    select unnest(v_tables_attendues) as table_nom
  ),
  reels as (
    select
      c.relname as table_nom,
      count(*) as n,
      bool_and(t.tgtype = 31) as type_exact,
      bool_and(t.tgenabled = 'O') as toutes_activees,
      bool_and(t.tgfoid = 'public.refuser_pendant_maintenance()'::regprocedure) as bonne_fonction
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and t.tgname = 'gel_de_bascule' and not t.tgisinternal
    group by c.relname
  ),
  verdict as (
    select
      a.table_nom,
      coalesce(r.n, 0) = 1                as exactement_un,
      coalesce(r.type_exact, false)       as type_exact,
      coalesce(r.toutes_activees, false)  as active,
      coalesce(r.bonne_fonction, false)   as bonne_fonction
    from attendues a
    left join reels r on r.table_nom = a.table_nom
  )
  select count(*),
         string_agg(
           table_nom || ' (n=' || (select coalesce(r.n, 0) from reels r where r.table_nom = verdict.table_nom) ||
           ' type_exact=' || type_exact || ' actif=' || active || ' fonction=' || bonne_fonction || ')',
           ', '
         )
    into v_ecarts, v_detail
  from verdict
  where not (exactement_un and type_exact and active and bonne_fonction);

  if v_ecarts > 0 then
    raise exception 'ACTIVATION REFUSÉE : % table(s) sans trigger gel_de_bascule conforme (exactement 1, tgtype=31 [BEFORE+ROW+INSERT+UPDATE+DELETE, rien de plus], tgenabled=O, tgfoid=refuser_pendant_maintenance exact). Détail : %',
      v_ecarts, left(v_detail, 800);
  end if;

  -- ─── Aucun trigger gel_de_bascule sur une table HORS de la liste attendue.
  select count(*) into v_extra
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and t.tgname = 'gel_de_bascule' and not t.tgisinternal
    and c.relname <> all (v_tables_attendues);

  if v_extra > 0 then
    raise exception 'ACTIVATION REFUSÉE : % trigger(s) gel_de_bascule trouvé(s) sur une table imprévue.', v_extra;
  end if;

  -- ─── Transition stricte : refuse si déjà actif, ne réinitialise jamais
  -- silencieusement `depuis` sur une activation en cours.
  select actif into v_actif_avant from public.maintenance where id;
  if not found then
    raise exception 'ACTIVATION REFUSÉE : ligne maintenance introuvable.';
  end if;
  if v_actif_avant then
    raise exception 'ACTIVATION REFUSÉE : le gel est déjà actif — une deuxième activation ne réinitialise pas depuis. Lever explicitement avant de réactiver si c''est réellement l''intention.';
  end if;

  update public.maintenance
    set actif = true, depuis = now(),
        message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.'
    where id and actif = false;
  get diagnostics v_lignes = row_count;

  if v_lignes <> 1 then
    raise exception 'ACTIVATION REFUSÉE : % ligne(s) affectée(s) par l''activation, 1 attendue. AUCUNE activation effective.', v_lignes;
  end if;

  raise notice 'GEL SOURCE FIDELIZ ACTIVÉ — 10 triggers vérifiés conformes par catalogue système (tgtype=31 exact, tgenabled=O, tgfoid exact), 1 ligne passée à true.';
end $$;

commit;

-- Contrôle final explicite, hors du bloc do, pour l'opérateur du runbook.
select actif, depuis, message from public.maintenance where id;
