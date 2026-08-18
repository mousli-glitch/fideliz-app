/*
 * ═══════════════════════════════════════════════════════════════════════
 *  L'AUTORISATION VIENT DU RÔLE, PLUS D'UNE PERSONNE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La recherche du 18/08 a trouvé l'UUID du root réel à six endroits : trois
 * policies, une fonction, trois fichiers TypeScript (dont deux fois dans le
 * même). `20260818011000` en a traité une — celle de `restaurants`. Ce
 * fichier finit le travail côté base.
 *
 * ─── Deux natures d'usage, et elles ne se corrigent pas pareil ───
 *
 * AUTORISATION — « cette personne a le droit ». C'est le cas des deux
 * policies ci-dessous. Un droit attaché à une identité personnelle s'éteint
 * le jour où le compte change, et surtout il rend le parcours root
 * INTESTABLE : un root synthétique n'est jamais cette personne-là. On ne
 * pouvait donc pas prouver l'administration ailleurs qu'en production, ce
 * qui est exactement ce qu'on cherche à ne plus faire.
 *
 * VALEUR — « les restaurants orphelins reviennent à ce compte ». C'est le cas
 * de `handle_deleted_commercial()`. Ici l'UUID n'autorise rien, il désigne un
 * destinataire. La correction n'est pas un test de rôle mais une RECHERCHE du
 * compte root.
 *
 * Confondre les deux mènerait à écrire `current_role() = 'root'` là où il
 * faut un identifiant, ou l'inverse.
 *
 * ─── Pourquoi c'est équivalent aujourd'hui ───
 *
 * Relevé en lecture seule sur la production : un seul compte porte
 * `role = 'root'`, c'est celui-là, et il est actif.
 *
 * ─── Ce qu'on ne fait PAS ───
 *
 * On ne remplace pas un UUID par un autre identifiant codé en dur. Et on ne
 * touche pas la baseline : elle décrit l'histoire telle qu'elle fut, UUID
 * compris. C'est ici que l'histoire est corrigée, pas là-bas.
 */

/*
 * ──────────────────────────────────────────── games · autorisation
 * `auth.uid() = '04eb7091-…'` sur les quatre verbes.
 */
drop policy if exists "ADMIN_GAMES_FULL_ACCESS" on public.games;
create policy "ADMIN_GAMES_FULL_ACCESS" on public.games
  as permissive for all to authenticated
  using (public."current_role"() = 'root')
  with check (public."current_role"() = 'root');

/*
 * ─────────────────────────────────────── system_logs · autorisation
 */
drop policy if exists "Root Full Access" on public.system_logs;
create policy "Root Full Access" on public.system_logs
  as permissive for all to authenticated
  using (public."current_role"() = 'root')
  with check (public."current_role"() = 'root');

/*
 * ──────────────────────── handle_deleted_commercial() · VALEUR
 *
 * Déclenchée `before delete on profiles when (old.role = 'sales')` : quand un
 * commercial est supprimé, ses restaurants sont réattribués plutôt que
 * laissés orphelins.
 *
 * Analyse demandée, faite :
 *
 *   · appelée ?        oui, par le trigger `tr_on_commercial_deleted`.
 *   · niveau ?         SECURITY DEFINER, propriétaire `postgres`.
 *   · EXECUTE ?        ouverte à PUBLIC — mais c'est une fonction de trigger,
 *                      que PostgreSQL refuse d'appeler directement (0A000,
 *                      mesuré). Le droit est inutile, pas exploitable.
 *   · récursion ?      NON. Elle lit `profiles` alors qu'un DELETE sur
 *                      `profiles` est en cours, mais en DEFINER sous
 *                      `postgres`, qui porte BYPASSRLS : aucune policy n'est
 *                      réévaluée, donc aucune réentrée. C'est le contraire
 *                      exact de ce qui est arrivé à `current_role()`.
 *   · atteignable ?    seulement par `service_role` : les sept policies de
 *                      `profiles` sont toutes en SELECT, donc la RLS refuse
 *                      le DELETE à tout rôle non privilégié.
 *
 * Le `search_path` est figé au passage — vide, avec toutes les références
 * qualifiées. Elle en était dépourvue, ce qui est une faiblesse connue pour
 * une fonction DEFINER, et on ne réécrit pas une telle fonction pour la
 * laisser dans cet état.
 *
 * `order by created_at` rend la recherche déterministe s'il existait
 * plusieurs root. S'il n'en existe aucun, la sous-requête vaut NULL et les
 * restaurants redeviennent orphelins — exactement ce qui se produisait déjà
 * quand l'UUID pointait vers un compte supprimé, en moins silencieux.
 */
create or replace function public.handle_deleted_commercial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid;
begin
  select p.id into v_root
  from public.profiles p
  where p.role = 'root'
  order by p.created_at
  limit 1;

  update public.restaurants
     set created_by = v_root,
         owner_id   = v_root
   where created_by = old.id or owner_id = old.id;

  return old;
end;
$$;

/*
 * Recréer une fonction efface ses droits. Ici on ne les rétablit PAS à
 * l'identique : elle était ouverte à PUBLIC sans raison. Fonction de
 * trigger, elle n'a besoin d'aucun EXECUTE — le trigger l'exécute sous
 * l'identité de son propriétaire.
 */
revoke all on function public.handle_deleted_commercial() from public, anon, authenticated, service_role;

/*
 * ─────────────────────────────────────────────────────────────────────
 *  RETOUR ARRIÈRE — aucune donnée concernée
 * ─────────────────────────────────────────────────────────────────────
 *
 * drop policy "ADMIN_GAMES_FULL_ACCESS" on public.games;
 * create policy "ADMIN_GAMES_FULL_ACCESS" on public.games
 *   as permissive for all to authenticated
 *   using ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid))
 *   with check ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid));
 *
 * drop policy "Root Full Access" on public.system_logs;
 * create policy "Root Full Access" on public.system_logs
 *   as permissive for all to authenticated
 *   using ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid));
 *
 * create or replace function public.handle_deleted_commercial()
 * returns trigger language plpgsql security definer
 * as $r$
 * BEGIN
 *     UPDATE public.restaurants
 *     SET created_by = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid,
 *         owner_id = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid
 *     WHERE created_by = OLD.id OR owner_id = OLD.id;
 *     RETURN OLD;
 * END;
 * $r$;
 */
