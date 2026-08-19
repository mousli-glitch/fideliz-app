/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK — enregistrement atomique du jeu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Annule `20260819030000_enregistrement_atomique_du_jeu.sql`. La migration
 * étant purement additive (une fonction, ses droits), le retour arrière l'est
 * aussi : aucune table, aucune donnée, aucune contrainte existante n'a été
 * touchée.
 *
 * ─── CE QUE CE ROLLBACK REND À NOUVEAU POSSIBLE ───
 *
 * Les quatre défauts fermés par la migration, si le code revient avec :
 * un jeu modifiable sans appartenir au restaurant autorisé, l'erreur du
 * DELETE des lots ignorée, un DELETE réussi suivi d'un INSERT échoué qui perd
 * tous les lots, et la règle des 100 % réduite à un contrôle d'écran.
 *
 * Le code appelle cette fonction : après ce rollback, `updateGameAction`
 * refusera et ne touchera à rien. Reculer le code dans le même mouvement, ou
 * ne pas jouer ce rollback.
 *
 * USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

drop function if exists public.enregistrer_jeu_et_lots(uuid, uuid, jsonb, jsonb);

notify pgrst, 'reload schema';

commit;
