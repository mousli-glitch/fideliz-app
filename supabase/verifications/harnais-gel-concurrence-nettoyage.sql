/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  NETTOYAGE DDL du harnais de concurrence — jamais lever un vrai gel
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Signalé le 19/08/2026 : la version précédente faisait, sans garde,
 *
 *      insert into public.maintenance (id, actif) values (true, false)
 *        on conflict (id) do update set actif = false, depuis = null, ...
 *
 *  Exécuté sur une source RÉELLEMENT gelée (`actif = true` pour une vraie
 *  raison, pas un artefact de test), ce nettoyage aurait levé le gel —
 *  une action qui, dans le monde réel, rouvrirait les écritures pendant
 *  une bascule en cours.
 *
 *  Corrigé : ce fichier COMMENCE par vérifier l'état exact de
 *  `maintenance` et s'ARRÊTE si ce n'est pas précisément « une ligne
 *  présente, actif = false ». Il ne force JAMAIS cet état lui-même — la
 *  correction d'un état inattendu est une décision du propriétaire, pas
 *  d'un script de nettoyage. Une seule transaction : si la garde échoue,
 *  rien n'est supprimé.
 */

begin;

do $$
declare
  v_lignes int;
  v_actif  boolean;
begin
  select count(*) into v_lignes from public.maintenance;

  if v_lignes <> 1 then
    raise exception 'NETTOYAGE REFUSÉ : % ligne(s) dans public.maintenance, exactement 1 attendue. État inattendu — intervention propriétaire requise avant nettoyage. Rien n''a été supprimé.', v_lignes;
  end if;

  select actif into v_actif from public.maintenance where id;

  if v_actif is distinct from false then
    raise exception 'NETTOYAGE REFUSÉ : maintenance.actif = % (false attendu). Le gel est peut-être réellement actif — ce nettoyage ne le désactivera JAMAIS lui-même. Intervention propriétaire requise. Rien n''a été supprimé.', v_actif;
  end if;

  raise notice 'GARDE ÉTAT MAINTENANCE : OK (1 ligne, actif = false). Poursuite du nettoyage.';
end $$;

-- Uniquement les fixtures du harnais — jamais une donnée métier réelle
-- (le nom littéral 'zz-harnais-gel' est le seul filtre, aucune plage ni
-- heuristique qui pourrait accrocher une vraie ligne).
delete from public.restaurants where name = 'zz-harnais-gel';

drop function if exists public.zz_harnais_gel_identite();
drop function if exists public.zz_harnais_gel_etat();
drop function if exists public.zz_harnais_gel_activer(float);
drop function if exists public.zz_harnais_gel_desactiver(float);
drop function if exists public.zz_harnais_gel_supprimer_ligne();
drop function if exists public.zz_harnais_gel_restaurer_ligne();
drop function if exists public.zz_harnais_gel_ecriture(float, float);
drop function if exists public.zz_harnais_gel_ecriture_rr(float, float, float);
drop function if exists public.zz_harnais_gel_nettoyage();

notify pgrst, 'reload schema';

commit;

-- Contrôle final explicite : la ligne métier n'a JAMAIS été touchée par
-- ce script (elle était déjà actif=false avant, la garde l'a exigé).
select actif, depuis from public.maintenance where id;
select count(*) as fonctions_zz_restantes
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'zz_harnais_gel_%';
