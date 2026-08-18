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
--  ─── POURQUOI CE ROLLBACK N'EXIGE AUCUN ROLLBACK APPLICATIF ───
--
--  Une version antérieure de ce fichier demandait, en note, de retirer
--  aussi le `.order("id")` du TypeScript « sinon la divergence revient ».
--  Une note qui réclame un geste manuel plus tard n'est pas un rollback.
--  Analyse refaite, et la conclusion est plus simple : les deux résolveurs
--  ne décident JAMAIS du même événement.
--
--    - Suppression PAR L'APPLICATION : elle réattribue les restaurants
--      (`update ... where created_by = <cible> or owner_id = <cible>`)
--      AVANT de supprimer le profil. Quand ce trigger se déclenche ensuite,
--      son propre `update` ne trouve plus AUCUNE ligne à modifier — son
--      choix d'héritier n'a donc aucun effet observable. Le choix
--      applicatif fait foi, quelle que soit la règle du trigger.
--
--    - Suppression HORS APPLICATION (SQL direct) : le chemin applicatif ne
--      s'exécute pas du tout. Seul le trigger décide. Là encore, un seul
--      résolveur pour un seul événement — rien avec quoi diverger.
--
--  Les quatre fenêtres de déploiement sont donc sûres, dans les deux sens :
--
--    ancien code + ancienne DB  → un seul résolveur par événement ;
--    ancien code + nouvelle DB  → idem ;
--    nouveau code + ancienne DB → idem ;
--    nouveau code + nouvelle DB → idem, et les deux règles coïncident.
--
--  Ce qui reste, après ce rollback, est le comportement d'ORIGINE pour les
--  seules suppressions hors application : sur deux roots au même
--  `created_at`, le trigger reprend un choix arbitraire. Ce n'est pas une
--  régression introduite par le rollback — c'est l'état d'avant la
--  migration, restauré fidèlement. Le départage déterministe du chemin
--  nominal (applicatif) N'EST PAS retiré.
--
--  ⚠ Ce rollback restaure aussi le comportement `v_root = null` : sans
--    root, l'`update` remet `created_by`/`owner_id` à null au lieu de
--    refuser. C'est également l'état d'origine. Le chemin applicatif, lui,
--    refuse toujours — son fail-closed ne dépend pas de cette migration.

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
