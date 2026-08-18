-- ═══════════════════════════════════════════════════════════════════════
--  ROLLBACK — héritier root, retour à l'ordre déployé
-- ═══════════════════════════════════════════════════════════════════════
--
--  Annule `20260819000000_heritier_ordre_total.sql` en restaurant le corps
--  EXACTEMENT tel qu'il est déployé en production aujourd'hui — relu depuis
--  la base le 19/08/2026 par `pg_get_functiondef()`, pas reconstruit de
--  mémoire. La seule différence avec la migration est la clause `order by`,
--  qui redevient `order by p.created_at` (sans départage).
--
--  ⚠ Après ce rollback, le trigger et le chemin applicatif redeviennent
--    divergents sur une égalité de `created_at` : deux héritiers possibles
--    pour un même événement. C'est le comportement d'origine, restauré
--    sciemment — pas un état souhaitable, seulement un retour en arrière
--    fidèle. Si ce rollback est joué, aligner aussi le TypeScript
--    (`lib/securite/root.ts` et `lib/securite/compte-root.ts`) en retirant
--    leur `.order("id")`, sinon la divergence revient sans être documentée.

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
  order by p.created_at
  limit 1;

  update public.restaurants
     set created_by = v_root,
         owner_id   = v_root
   where created_by = old.id or owner_id = old.id;

  return old;
end;
$function$;
