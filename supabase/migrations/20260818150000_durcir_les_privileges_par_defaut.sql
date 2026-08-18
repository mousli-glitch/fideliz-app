/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  DURCIR LES PRIVILÈGES PAR DÉFAUT DU SCHÉMA public
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Aujourd'hui, toute NOUVELLE table du schéma `public` naît lisible ET
 *  modifiable par `anon`. Ce n'est pas une hypothèse : mesuré par sentinelles
 *  sur une copie de la production, une table créée à l'instant donne à `anon`
 *  SELECT et INSERT, à une séquence neuve USAGE, à une fonction neuve EXECUTE.
 *
 *  RLS ne rattrape pas ça toute seule : une table créée sans `enable row level
 *  security` est lisible par tout le monde. La règle « RLS deny-by-default sur
 *  TOUTES les tables » suppose qu'on n'oublie jamais. Ce fichier fait en sorte
 *  qu'un oubli ne coûte rien.
 *
 *  ─── Le piège, et pourquoi la forme globale ───
 *
 *  Les privilèges par défaut limités à un schéma s'AJOUTENT aux privilèges
 *  globaux : ils ne peuvent pas retirer un droit accordé globalement par
 *  défaut. J'ai perdu du temps à essayer quatre variantes `IN SCHEMA public`
 *  avant de le comprendre.
 *
 *  D'où la forme GLOBALE pour retirer l'EXECUTE des fonctions à PUBLIC — et
 *  l'exception sur `extensions`, sans laquelle `gen_random_bytes` devient
 *  inexécutable et la valeur par défaut d'une colonne casse.
 *
 *  ─── Ce fichier ne touche AUCUN objet existant ───
 *
 *  Uniquement les défauts des objets FUTURS. Les droits explicites des
 *  parcours vivants restent intacts — vérifié.
 *
 *  Rollback : `supabase/rollback/20260818150000_rollback_durcissement.sql`.
 *  Empreinte des défauts attendue après application :
 *  `2d2e463f3246d8292045a4de8afe2e30`.
 */

do $$
declare v_createur text;
begin
  /*
   * Les privilèges par défaut sont attachés au RÔLE CRÉATEUR. Les durcir pour
   * un rôle qui ne crée pas les objets ne protège rien — la migration doit
   * refuser plutôt que de donner une fausse assurance.
   */
  select distinct pg_get_userbyid(c.relowner) into v_createur
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  limit 1;

  if current_user <> 'postgres' then
    raise exception 'Migration exécutée en tant que « % », attendu « postgres ». '
      'Durcir les défauts d''un rôle qui ne crée pas les objets ne protège rien.', current_user;
  end if;

  if v_createur is distinct from 'postgres' then
    raise exception 'Les tables de public appartiennent à « % » et non à « postgres ». '
      'Le rôle créateur a changé : revoir cette migration avant de l''appliquer.', v_createur;
  end if;
end $$;

-- ═══ Tables ═══
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

-- ═══ Séquences ═══
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

-- ═══ Fonctions — forme GLOBALE, seule à retirer réellement ═══
alter default privileges for role postgres
  revoke execute on functions from public;
-- Exception indispensable : `gen_random_bytes` sert de valeur par défaut de colonne.
alter default privileges for role postgres in schema extensions
  grant execute on functions to public;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
