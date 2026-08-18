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
 *  Ne se contente pas d'un `update` nu. Avant d'écrire, vérifie :
 *   1. que la table `maintenance` existe ;
 *   2. que les 10 triggers `gel_de_bascule` attendus existent tous.
 *  Après l'`update`, vérifie qu'EXACTEMENT une ligne a été affectée — une
 *  activation à zéro ligne (table vidée, contrainte cassée, mauvaise
 *  branche) lève une exception au lieu de laisser croire que la source
 *  est gelée alors qu'elle ne l'est pas.
 *
 *  Signalé le 19/08/2026 : un `update ... where id;` nu, sans contrôle du
 *  nombre de lignes affectées, peut échouer silencieusement — l'opérateur
 *  du runbook croit avoir gelé la source, elle ne l'est pas.
 */

begin;

do $$
declare
  n_triggers int;
  n_lignes   int;
begin
  if to_regclass('public.maintenance') is null then
    raise exception 'ACTIVATION REFUSÉE : table public.maintenance introuvable.';
  end if;

  select count(*) into n_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and t.tgname = 'gel_de_bascule' and not t.tgisinternal;

  if n_triggers <> 10 then
    raise exception 'ACTIVATION REFUSÉE : % trigger(s) gel_de_bascule trouvé(s) sur 10 attendus — le gel ne couvrirait pas toutes les tables prévues.', n_triggers;
  end if;

  update public.maintenance
    set actif = true, depuis = now(),
        message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.'
    where id;
  get diagnostics n_lignes = row_count;

  if n_lignes <> 1 then
    raise exception 'ACTIVATION REFUSÉE : % ligne(s) affectée(s) par l''activation, 1 attendue. AUCUNE activation effective.', n_lignes;
  end if;

  raise notice 'GEL SOURCE FIDELIZ ACTIVÉ — % triggers vérifiés, 1 ligne mise à jour.', n_triggers;
end $$;

commit;

-- Contrôle final explicite, hors du bloc do, pour l'opérateur du runbook.
select actif, depuis, message from public.maintenance where id;
