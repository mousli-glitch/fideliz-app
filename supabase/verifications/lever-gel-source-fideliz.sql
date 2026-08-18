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
 *  `20260818160000_gel_source_fideliz.sql`).
 *
 *  Transition stricte, signalée le 19/08/2026 (3e tour) : refuse si le gel
 *  est déjà inactif — une deuxième levée n'est pas un no-op silencieux,
 *  c'est un signal que l'opérateur a perdu le fil de l'état réel. Vérifie
 *  qu'EXACTEMENT une ligne est passée à `false` — même principe fail-closed
 *  que l'activation.
 */

begin;

do $$
declare
  v_actif_avant boolean;
  v_lignes      int;
begin
  select actif into v_actif_avant from public.maintenance where id;
  if not found then
    raise exception 'LEVÉE REFUSÉE : ligne maintenance introuvable.';
  end if;
  if not v_actif_avant then
    raise exception 'LEVÉE REFUSÉE : le gel est déjà inactif.';
  end if;

  update public.maintenance
    set actif = false, depuis = null,
        message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.'
    where id and actif = true;
  get diagnostics v_lignes = row_count;

  if v_lignes <> 1 then
    raise exception 'LEVÉE REFUSÉE : % ligne(s) affectée(s), 1 attendue.', v_lignes;
  end if;

  raise notice 'GEL SOURCE FIDELIZ LEVÉ — 1 ligne passée à false.';
end $$;

commit;

-- Contrôle final explicite, hors du bloc do, pour l'opérateur du runbook.
select actif, depuis, message from public.maintenance where id;
