/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  P0 — UN JOUEUR POUVAIT RÉCLAMER LE LOT D'UN AUTRE RESTAURANT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LE DÉFAUT, PROUVÉ SUR CIBLE SYNTHÉTIQUE LE 19/08/2026 ───
 *
 * `register_win(p_game_id, p_prize_id, …)` chargeait le lot ainsi :
 *
 *     select * into v_prize from prizes where id = p_prize_id;
 *
 * Sans jamais vérifier, dans cette lecture ni ailleurs, que ce lot appartient
 * au jeu passé en paramètre. Et le décrément de stock héritait du même
 * défaut :
 *
 *     update prizes set quantity = quantity - 1 where id = p_prize_id …
 *
 * ─── POURQUOI C'EST ATTEIGNABLE DEPUIS INTERNET ───
 *
 * `registerWinnerAction` est l'action publique du parcours joueur — elle n'a
 * pas de garde de rôle, et c'est normal : c'est un client anonyme qui
 * enregistre son gain. Elle transmet `data.prize_id` VERBATIM depuis le
 * navigateur, à la clé de service.
 *
 * `register_win` n'est pourtant exécutable ni par `anon` ni par
 * `authenticated` — vérifié sur la production. Cette fermeture ne protège
 * rien ici : l'attaquant n'a pas besoin d'appeler la fonction, la Server
 * Action est la porte, et elle lui ouvre.
 *
 * ─── CE QUE ÇA COÛTE, MESURÉ ───
 *
 * Deux restaurants synthétiques, un lot à stock limité chez chacun. Appel
 * avec le jeu de A et le lot de B :
 *
 *     appel accepte ............................ true
 *     stock du confrere .................... 3 -> 2   (consomme)
 *     libelle fige sur le ticket ....... « MAGNUM DE CHAMPAGNE (lot de B) »
 *     le ticket appartient au restaurant ....... A
 *
 * Un inconnu draine donc le stock d'un lot qu'il ne peut pas gagner, et
 * repart avec un ticket portant le libellé d'une enseigne qui ne l'a jamais
 * offert. C'est une rupture d'isolation inter-tenant, pas une bizarrerie.
 *
 * `play_game` n'est PAS concernée : elle sélectionne le lot elle-même parmi
 * `prizes where game_id = p_game_id` et n'accepte aucun `p_prize_id`
 * (vérifié).
 *
 * ─── LA FORME DU CORRECTIF, ET POURQUOI CELLE-LÀ ───
 *
 * Cette migration NE RETRANSCRIT PAS la fonction. Elle relit sa définition
 * déployée, y remplace deux fragments EXACTS, et réexécute le résultat.
 *
 * C'est délibéré. `register_win` fait plus de deux cents lignes et porte le
 * cœur du produit : rejeu, quotas, stocks, contacts, séquences d'action. La
 * recopier à la main pour changer deux prédicats, c'est prendre le risque
 * d'altérer autre chose sans le voir. Ici, tout ce qui n'est pas ces deux
 * fragments est bit-à-bit identique, `SECURITY DEFINER` et `search_path`
 * compris.
 *
 * Le prix de cette approche est sa fragilité au texte : elle EXIGE une
 * occurrence unique de chaque fragment et refuse sinon. Une refonte future de
 * la fonction fera donc échouer cette migration au lieu de la patcher de
 * travers — ce qui est le comportement voulu.
 *
 * Elle est idempotente : rejouée sur une base déjà corrigée, elle ne fait
 * rien et le dit.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer et prouver, puis ATTENDRE sa
 * validation avant toute application réelle.
 *
 * MIGRATION ADDITIVE au sens des données : aucune table, aucune colonne,
 * aucune ligne touchée. Seul le corps d'une fonction change.
 */

do $$
declare
  v_def     text;
  v_nouveau text;
  v_n       int;

  -- Les deux fragments fautifs, et leur forme corrigée.
  c_lot_avant  constant text := 'select * into v_prize from prizes where id = p_prize_id;';
  c_lot_apres  constant text := 'select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;';
  c_stock_avant constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;';
  c_stock_apres constant text := 'update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'register_win'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean';

  if v_def is null then
    raise exception using errcode = 'P0130',
      message = 'register_win introuvable avec la signature attendue : correctif non applicable. Ce n''est pas un patch qui échoue, c''est le point de départ qui manque.';
  end if;

  -- Déjà corrigée : on ne fait rien, et on le dit.
  if position(c_lot_apres in v_def) > 0 and position(c_stock_apres in v_def) > 0 then
    raise notice 'ISOLATION LOT/JEU : déjà en place, aucune modification.';
    return;
  end if;

  /*
   * Occurrence UNIQUE exigée pour chaque fragment. Zéro : le texte a changé,
   * le patch ne s'applique plus. Deux : on ne sait pas laquelle corriger.
   * Dans les deux cas on refuse plutôt que de deviner.
   */
  v_n := (length(v_def) - length(replace(v_def, c_lot_avant, ''))) / length(c_lot_avant);
  if v_n <> 1 then
    raise exception using errcode = 'P0130',
      message = format('Chargement du lot : %s occurrence(s) du fragment attendu, 1 exigée. Correctif refusé.', v_n);
  end if;

  v_n := (length(v_def) - length(replace(v_def, c_stock_avant, ''))) / length(c_stock_avant);
  if v_n <> 1 then
    raise exception using errcode = 'P0130',
      message = format('Décrément de stock : %s occurrence(s) du fragment attendu, 1 exigée. Correctif refusé.', v_n);
  end if;

  v_nouveau := replace(replace(v_def, c_lot_avant, c_lot_apres), c_stock_avant, c_stock_apres);

  -- Ceinture : le remplacement a bien produit les deux formes corrigées.
  if position(c_lot_apres in v_nouveau) = 0 or position(c_stock_apres in v_nouveau) = 0 then
    raise exception using errcode = 'P0130',
      message = 'Le remplacement n''a pas produit les deux prédicats attendus. Correctif refusé.';
  end if;

  execute v_nouveau;
  raise notice 'ISOLATION LOT/JEU : le lot est désormais borné à son jeu, au chargement comme au décrément.';
end $$;

/*
 * L'ACL est reposée explicitement, même si `create or replace` la conserve :
 * une fonction dont les droits dépendent d'une migration antérieure est une
 * fonction qui les perd le jour où cette antérieure bouge. Règle permanente
 * du dépôt.
 */
revoke all on function public.register_win(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_win(uuid, uuid, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
