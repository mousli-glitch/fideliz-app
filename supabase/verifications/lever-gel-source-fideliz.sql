/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LEVÉE du gel source Fideliz — propriétaire seulement, fail-closed
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  À exécuter en SQL direct sous le rôle propriétaire de la table
 *  (connexion admin du runbook) — JAMAIS avec la clé de service de
 *  l'application, qui n'a plus aucun droit sur `maintenance` depuis le
 *  19/08/2026.
 *
 *  Seulement après le GO (voir l'étape 5 du runbook dans
 *  `20260818160000_gel_source_fideliz.sql`). Vérifie qu'EXACTEMENT une
 *  ligne a été affectée par la levée — même principe fail-closed que
 *  l'activation.
 */

begin;

do $$
declare
  n_lignes int;
begin
  update public.maintenance
    set actif = false, depuis = null,
        message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.'
    where id;
  get diagnostics n_lignes = row_count;

  if n_lignes <> 1 then
    raise exception 'LEVÉE REFUSÉE : % ligne(s) affectée(s), 1 attendue.', n_lignes;
  end if;

  raise notice 'GEL SOURCE FIDELIZ LEVÉ — 1 ligne mise à jour.';
end $$;

commit;

-- Contrôle final explicite, hors du bloc do, pour l'opérateur du runbook.
select actif, depuis, message from public.maintenance where id;
