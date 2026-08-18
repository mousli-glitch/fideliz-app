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
--  ─── DEUX COUCHES, UN SEUL ROLLBACK : LE DÉPARTAGE, PAS LA SÉCURITÉ ───
--
--  La migration porte DEUX changements de nature differente :
--
--    1. SÉCURITÉ — le refus `P0102` quand aucun root n'existe. Sans lui,
--       l'`update` posait `created_by = null, owner_id = null`. Défaut de
--       PERTE DE DONNÉES, prouvé en vivant sur la branche synthétique.
--    2. FONCTIONNEL — le départage `, p.id`, qui aligne le trigger sur le
--       chemin applicatif en cas d'égalité de `created_at`.
--
--  Ce rollback annule UNIQUEMENT la couche 2. Il CONSERVE `P0102`.
--
--  Un rollback opérationnel n'a aucune raison de réintroduire un défaut de
--  perte de données que l'expérience vient de démontrer : revenir sur le
--  départage est un choix fonctionnel discutable, remettre l'effacement
--  silencieux ne l'est pas. Les deux se rejouent donc séparément.
--
--  ⚠ INTERDIT AU RUNBOOK NORMAL : restaurer le corps historique exact
--    (sans `P0102`) reintroduirait l'effacement. Si cette fidélité
--    historique est un jour nécessaire — reproduction d'incident,
--    archéologie — elle se fait hors runbook, en connaissance de cause, et
--    ne doit jamais être présentée comme un retour arrière sûr.

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

  -- COUCHE DE SÉCURITÉ CONSERVÉE — ce rollback n'annule que le départage.
  if not found or v_root is null then
    raise exception using
      errcode = 'P0102',
      message = 'Aucun compte root : réattribution impossible, suppression refusée.',
      hint    = 'heritier_introuvable';
  end if;

  update public.restaurants
     set created_by = v_root,
         owner_id   = v_root
   where created_by = old.id or owner_id = old.id;

  return old;
end;
$function$;
