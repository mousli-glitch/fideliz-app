/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — création atomique du jeu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Retire `creer_jeu_et_lots`. Purement additive à l'aller, purement
 * soustractive au retour : aucune table, aucune donnée.
 *
 * ─── CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * `createGameAction` appelle cette fonction. Après ce rollback, l'action
 * refusera et ne touchera à rien : dégradation sûre, mais totale — plus aucune
 * création de jeu ne passe. Reculer le code dans le même mouvement.
 *
 * Et si l'ancien code revenait avec : cinq requêtes séparées, erreurs non
 * lues, et le risque qu'un échec tardif laisse les anciens jeux TERMINÉS sans
 * qu'un nouveau soit créé — un restaurant sans jeu, QR imprimé compris.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.creer_jeu_et_lots(uuid, jsonb, jsonb, jsonb);

do $$
begin
  if to_regprocedure('public.creer_jeu_et_lots(uuid,jsonb,jsonb,jsonb)') is not null then
    raise exception 'ROLLBACK REFUSÉ : la fonction est toujours présente. Transaction annulée.';
  end if;
  raise notice 'ROLLBACK : creer_jeu_et_lots retirée.';
end $$;

notify pgrst, 'reload schema';

commit;
