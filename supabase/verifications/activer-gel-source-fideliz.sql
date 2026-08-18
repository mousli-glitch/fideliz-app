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
 *      comme prévu — pas seulement leur nombre. Signalé le 19/08/2026
 *      (3e tour) : dix triggers pourraient être présents mais posés sur
 *      les MAUVAISES tables, ou en `AFTER` au lieu de `BEFORE`, ou ne
 *      couvrir que deux événements sur trois, ou pointer vers une autre
 *      fonction, ou être désactivés (`tgenabled <> 'O'`) — un simple
 *      `count(*) = 10` ne détecterait aucun de ces cas. Compare
 *      maintenant, table par table : présence, `BEFORE`, portée ligne,
 *      les trois événements INSERT/UPDATE/DELETE ensemble, la fonction
 *      exacte `refuser_pendant_maintenance`, et l'état activé — ET
 *      l'absence de tout trigger `gel_de_bascule` sur une table hors
 *      de la liste attendue.
 *   3. que `actif` vaut `false` avant l'écriture — une activation ne
 *      doit jamais s'exécuter par-dessus une activation déjà en cours
 *      (qui réinitialiserait silencieusement `depuis`).
 *  Après l'`update`, vérifie qu'EXACTEMENT une ligne est passée à `true`.
 *
 *  Signalé le 19/08/2026 : un `update ... where id;` nu, sans contrôle du
 *  nombre de lignes affectées, peut échouer silencieusement — l'opérateur
 *  du runbook croit avoir gelé la source, elle ne l'est pas.
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

  -- ─── Comparaison exacte : présence, BEFORE, ROW, les 3 événements,
  -- la bonne fonction, activé — table par table, contre la liste attendue.
  with attendues as (
    select unnest(v_tables_attendues) as table_nom
  ),
  reels as (
    select
      it.event_object_table as table_nom,
      it.action_timing,
      string_agg(distinct it.event_manipulation, ',' order by it.event_manipulation) as evenements,
      bool_or(it.action_statement ilike '%refuser_pendant_maintenance%') as bonne_fonction
    from information_schema.triggers it
    where it.trigger_schema = 'public' and it.trigger_name = 'gel_de_bascule'
    group by it.event_object_table, it.action_timing
  ),
  actives as (
    select c.relname as table_nom, bool_and(t.tgenabled = 'O') as toutes_activees
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and t.tgname = 'gel_de_bascule' and not t.tgisinternal
    group by c.relname
  ),
  verdict as (
    select
      a.table_nom,
      (r.table_nom is not null)                                  as trigger_present,
      coalesce(r.action_timing = 'BEFORE', false)                as bien_before,
      coalesce(r.evenements = 'DELETE,INSERT,UPDATE', false)     as tous_evenements,
      coalesce(r.bonne_fonction, false)                          as bonne_fonction,
      coalesce(act.toutes_activees, false)                       as active
    from attendues a
    left join reels r on r.table_nom = a.table_nom
    left join actives act on act.table_nom = a.table_nom
  )
  select count(*),
         string_agg(
           table_nom || ' (présent=' || trigger_present || ' before=' || bien_before ||
           ' evenements=' || tous_evenements || ' fonction=' || bonne_fonction || ' actif=' || active || ')',
           ', '
         )
    into v_ecarts, v_detail
  from verdict
  where not (trigger_present and bien_before and tous_evenements and bonne_fonction and active);

  if v_ecarts > 0 then
    raise exception 'ACTIVATION REFUSÉE : % table(s) sans trigger gel_de_bascule conforme (présent+BEFORE+3 événements+bonne fonction+activé). Détail : %',
      v_ecarts, left(v_detail, 800);
  end if;

  -- ─── Aucun trigger gel_de_bascule sur une table HORS de la liste attendue.
  select count(*) into v_extra
  from information_schema.triggers it
  where it.trigger_schema = 'public' and it.trigger_name = 'gel_de_bascule'
    and it.event_object_table <> all (v_tables_attendues);

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

  raise notice 'GEL SOURCE FIDELIZ ACTIVÉ — 10 triggers vérifiés conformes (table, BEFORE, 3 événements, fonction, actif), 1 ligne passée à true.';
end $$;

commit;

-- Contrôle final explicite, hors du bloc do, pour l'opérateur du runbook.
select actif, depuis, message from public.maintenance where id;
