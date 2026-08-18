/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — gel source Fideliz (20260818160000_gel_source_fideliz.sql)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Retire EXACTEMENT ce que la migration installe : les 10 triggers
 *  `gel_de_bascule`, les 3 fonctions (`refuser_pendant_maintenance`,
 *  `maintenance_actif`, `en_maintenance`), la table `maintenance`. Rien
 *  d'autre — ne touche ni aux couches 1-2-3 (durcissement, RLS, identité
 *  root), ni à une seule ligne de donnée métier sur les tables qui étaient
 *  gelées.
 *
 *  Idempotent : chaque instruction porte `if exists`, rejouable sans
 *  erreur que la migration ait été appliquée ou non, et rejouable
 *  plusieurs fois de suite sans effet supplémentaire après la première.
 *
 *  Borné : une seule transaction (`begin`/`commit`), tout ou rien. Si une
 *  ligne échoue, aucune des précédentes n'est retenue.
 *
 *  Mesuré le 19/08/2026 sur `fusion-tests-2` (cycle application → gel
 *  actif/tests → levée → CE rollback → réapplication) : retour exact à
 *  l'empreinte pré-gel sur les 6 dimensions mesurées (colonnes, fonctions,
 *  triggers, rls, acl_relations, acl_fonctions — comptage ET hash),
 *  réapplication ensuite identique à la première application. Voir
 *  `docs/qualification-couche-4-gel.md` pour le détail des empreintes.
 *
 *  USAGE : script manuel, PAS une migration numérotée — il ne doit jamais
 *  s'appliquer automatiquement via `supabase db push`. À exécuter à la
 *  main (ou par le runbook de bascule, en cas de rollback réel) après
 *  avoir vérifié qu'aucune écriture n'est en vol sur les tables gelées
 *  (le verrou `for share` du trigger fait de toute façon attendre le
 *  `drop trigger` derrière une transaction encore ouverte, comme il
 *  ferait attendre l'activation).
 */

begin;

drop trigger if exists gel_de_bascule on public.winners;
drop trigger if exists gel_de_bascule on public.contacts;
drop trigger if exists gel_de_bascule on public.prizes;
drop trigger if exists gel_de_bascule on public.games;
drop trigger if exists gel_de_bascule on public.restaurants;
drop trigger if exists gel_de_bascule on public.profiles;
drop trigger if exists gel_de_bascule on public.avis;
drop trigger if exists gel_de_bascule on public.crm_notes;
drop trigger if exists gel_de_bascule on public.sales_restaurants;
drop trigger if exists gel_de_bascule on public.winners_archive;

drop function if exists public.refuser_pendant_maintenance();
drop function if exists public.maintenance_actif();
drop function if exists public.en_maintenance();

drop table if exists public.maintenance;

commit;
