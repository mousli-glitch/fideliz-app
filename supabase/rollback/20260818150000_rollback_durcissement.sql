/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK EXACT de 20260818150000_durcir_les_privileges_par_defaut
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ CE FICHIER REMET LES DÉFAUTS PERMISSIFS.
 *
 *  Il restaure l'état historique de la production : celui où toute nouvelle
 *  table de `public` naît lisible ET modifiable par `anon`. C'est exactement
 *  ce que le durcissement ferme. Recours de CONTINUITÉ, durée minimale ; une
 *  correction en avant est préférable si elle est sûre.
 *
 *  ─── Transcrit du vivant, pas de mémoire ───
 *
 *  Relevé en lecture seule sur la production, rôle créateur `postgres`,
 *  schéma `public` :
 *
 *    tables    anon, authenticated    → DELETE, INSERT, MAINTAIN, SELECT, UPDATE
 *              postgres, service_role → tous
 *    séquences les quatre             → SELECT, UPDATE, USAGE
 *    fonctions les quatre             → EXECUTE
 *
 *  Ni entrée globale, ni entrée sur `extensions`.
 *
 *  Détail qui aurait tout faussé : les défauts d'`anon` sur les tables
 *  n'incluent PAS REFERENCES, TRIGGER ni TRUNCATE. Un `grant all` à leur place
 *  n'aurait pas restauré l'état historique — il l'aurait ÉLARGI, en silence,
 *  avec le bon nombre de lignes. La preuve est la comparaison objet par objet.
 *
 *  Empreinte de sortie attendue : `06ee5db53926d16ea6bef8649a829254`,
 *  12 lignes ACL — celle de la production.
 *
 *  Ce fichier n'est PAS une migration : il vit hors de `supabase/migrations/`
 *  pour que le CLI ne l'applique jamais seul.
 */

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Rollback exécuté en tant que « % », attendu « postgres ». '
      'Les privilèges par défaut sont attachés au rôle créateur : '
      'les défaire sous un autre rôle ne défait rien.', current_user;
  end if;
end $$;

begin;

alter default privileges for role postgres in schema public
  grant all on tables to postgres, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete, maintain on tables to anon, authenticated;

alter default privileges for role postgres in schema public
  grant select, update, usage on sequences to anon, authenticated, postgres, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, postgres, service_role;

-- Défaire le retrait GLOBAL : c'est lui qui retirait réellement le droit.
alter default privileges for role postgres
  grant execute on functions to public;

-- L'exception `extensions` n'existait pas avant le durcissement.
alter default privileges for role postgres in schema extensions
  revoke execute on functions from public;

commit;
