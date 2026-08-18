-- ═══════════════════════════════════════════════════════════════════════
--  HÉRITIER ROOT — ordre total, la même règle des deux côtés
-- ═══════════════════════════════════════════════════════════════════════
--
--  ⚠ CETTE MIGRATION N'EST PAS APPLIQUÉE EN PRODUCTION. Écrite, testée
--    sur la branche synthétique, appliquée le jour de la bascule — jamais
--    avant. Rollback : `supabase/rollback/20260819000000_rollback.sql`.
--
--  ─── LE DÉFAUT ───
--
--  `handle_deleted_commercial()` choisit l'héritier des restaurants d'un
--  commercial supprimé par :
--
--      select p.id from public.profiles p
--      where p.role = 'root' order by p.created_at limit 1
--
--  `created_at` SEUL ne départage pas deux comptes root créés dans la même
--  milliseconde : PostgreSQL rend alors une ligne arbitraire. Deux appels
--  successifs peuvent désigner deux héritiers différents.
--
--  Le chemin applicatif (`lib/securite/root.ts`) ordonne, lui, par
--  `created_at ASC, id ASC` — totalement déterministe. Sur une égalité de
--  date, les deux chemins pouvaient donc désigner DEUX HÉRITIERS
--  DIFFÉRENTS pour un même événement. Ce n'est pas un simple raffinement :
--  les deux chemins coexistent réellement (l'action applicative réattribue
--  puis supprime le profil, ce qui déclenche ce trigger ; une suppression
--  hors application ne déclenche que le trigger).
--
--  ─── LA CORRECTION, ET SA LIMITE ───
--
--  On ajoute `, p.id` — rien d'autre. En particulier AUCUN filtre
--  `is_active` : ni ce trigger ni le TypeScript n'en portent, et en
--  ajouter un serait un CHANGEMENT DE RÈGLE (quels comptes peuvent
--  hériter), pas un alignement. Un tel changement se ferait des deux côtés,
--  dans sa propre couche, avec sa propre preuve.
--
--  Après cette migration, les trois résolveurs du système appliquent
--  exactement la même règle :
--    - ce trigger ;
--    - `lib/securite/root.ts`     (`resoudreRootHeritier`) ;
--    - `lib/securite/compte-root.ts` (`idDuCompteRoot`, aligné le 19/08).
--
--  ─── CE QUI NE CHANGE PAS ───
--
--  Le corps est repris à l'identique de la version déployée, à la seule
--  exception de la clause `order by`. Mêmes `security definer`,
--  `search_path` vide, même `update`, même `return old`.

create or replace function public.handle_deleted_commercial()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_root uuid;
begin
  select p.id into v_root
  from public.profiles p
  where p.role = 'root'
  order by p.created_at, p.id
  limit 1;

  update public.restaurants
     set created_by = v_root,
         owner_id   = v_root
   where created_by = old.id or owner_id = old.id;

  return old;
end;
$function$;

/*
 * Le revoke est REPRIS, pas hérité.
 *
 * `create or replace` préserve les ACL existantes — cette ligne ne corrige
 * donc rien sur une base où la fonction existe déjà. Elle est là pour deux
 * raisons : la règle du dépôt veut que toute migration qui crée une fonction
 * porte son propre revoke (garde statique dans `durcissement.test.ts`), et
 * sur une base reconstruite de zéro où cette migration créerait la fonction
 * pour la première fois, les DEFAULT PRIVILEGES lui accorderaient EXECUTE à
 * PUBLIC. Forme identique à celle de `20260818011000_rls_isolation_inter_tenant.sql`.
 */
revoke all on function public.handle_deleted_commercial() from public, anon, authenticated, service_role;
