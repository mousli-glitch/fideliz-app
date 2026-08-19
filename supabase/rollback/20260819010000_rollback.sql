/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — intention de suppression de restaurant
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule intégralement `20260819010000_intention_suppression_restaurant.sql`.
 * La migration étant purement additive (une table, son index, ses droits),
 * le retour arrière l'est aussi : rien d'existant n'a été modifié, donc rien
 * n'a à être restauré.
 *
 * ─── CE QUE CE ROLLBACK DÉTRUIT, ET IL FAUT LE SAVOIR ───
 *
 * Les intentions NON TERMINÉES. Une ligne `etape <> 'termine'` décrit une
 * suppression commencée et pas finie : un restaurant déjà supprimé dont le
 * compte propriétaire attend encore son sort. La détruire, c'est perdre le
 * seul point de reprise de cette opération.
 *
 * Le script REFUSE donc de s'exécuter s'il en reste, plutôt que de faire
 * disparaître le problème avec la table. Terminer ces opérations d'abord —
 * ou, si c'est un choix assumé, les inspecter puis relancer avec le garde
 * neutralisé, en conscience.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

do $$
declare
  v_ouvertes int;
begin
  if to_regclass('public.suppressions_restaurant') is null then
    raise notice 'ROLLBACK : la table n''existe pas — rien à annuler.';
    return;
  end if;

  select count(*) into v_ouvertes
  from public.suppressions_restaurant
  where etape <> 'termine';

  if v_ouvertes > 0 then
    raise exception 'ROLLBACK REFUSÉ : % suppression(s) de restaurant non terminée(s). Retirer cette table maintenant supprimerait le seul point de reprise de ces opérations. Les terminer d''abord.', v_ouvertes;
  end if;
end $$;

drop index if exists public.suppressions_restaurant_ouvertes_idx;
drop table if exists public.suppressions_restaurant;

notify pgrst, 'reload schema';

commit;
