/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREUVE — droits EFFECTIFS sur `maintenance` et ses fonctions internes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  P0 trouvé et corrigé le 19/08/2026 : le premier jet du gel source
 *  (`20260818160000_gel_source_fideliz.sql`) ne retirait les droits sur
 *  `maintenance` qu'à `anon` et `authenticated`. `service_role` gardait,
 *  par les DEFAULT PRIVILEGES, SELECT/INSERT/UPDATE/DELETE directs — un
 *  appel authentifié avec la clé de service pouvait remettre `actif =
 *  false`, ou supprimer l'unique ligne, puis écrire librement sur les
 *  tables gelées. Un contournement réel du gel, par le chemin même que le
 *  trigger est censé fermer.
 *
 *  Corrigé : `revoke all ... from public, anon, authenticated, service_role`
 *  sur la table ET sur la fonction interne (`refuser_pendant_maintenance()`).
 *  Seule `en_maintenance()` — qui ne rend qu'un booléen et un message, rien
 *  de modifiable — reste exécutable par les rôles applicatifs.
 *
 *  `maintenance_actif()` a existé un temps comme fonction séparée, puis a
 *  été supprimée le 19/08 (signalement : verrou et décision provenaient de
 *  deux lectures distinctes) — sa logique vit maintenant dans l'unique
 *  `select ... for share into` de `refuser_pendant_maintenance()`.
 *
 *  Utilise `has_table_privilege()` / `has_function_privilege()` — les
 *  droits EFFECTIFS (PUBLIC et héritage de rôle résolus nativement), pas
 *  les seuls grants directs. Voir `preuve-acl-avis.sql` pour le précédent
 *  qui a établi cette méthode dans ce dépôt.
 *
 *  Valeur attendue, versionnée :
 *
 *    Table `maintenance` (SELECT/INSERT/UPDATE/DELETE) :
 *      anon, authenticated, service_role : AUCUN droit direct
 *      postgres (propriétaire)           : tous (implicite, hors grant)
 *
 *    EXECUTE sur les fonctions :
 *      en_maintenance()               : anon, authenticated, service_role, postgres
 *      refuser_pendant_maintenance()  : postgres SEUL (implicite, propriétaire)
 *
 *  À rejouer après toute reconstruction du gel : la requête ci-dessous lève
 *  si l'un des 16 couples rôle×droit sur la table, ou l'un des 8 couples
 *  rôle×fonction, s'écarte de cette attente.
 */

do $$
declare
  v_ecarts_table int;
  v_detail_table text;
  v_ecarts_fn int;
  v_detail_fn text;
begin
  -- ─── Table maintenance : SELECT/INSERT/UPDATE/DELETE ───
  with roles as (
    select rolename from (values ('anon'), ('authenticated'), ('service_role'), ('postgres')) as r(rolename)
  ),
  privileges as (
    select priv from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
  ),
  mesure as (
    select r.rolename, p.priv,
           has_table_privilege(r.rolename, 'public.maintenance'::regclass, p.priv) as a_effectivement
    from roles r cross join privileges p
  )
  select count(*),
         string_agg(rolename || ':' || priv || ' = ' || a_effectivement, ', ' order by rolename, priv)
    into v_ecarts_table, v_detail_table
  from mesure
  where (rolename = 'postgres') is distinct from a_effectivement;

  if v_ecarts_table > 0 then
    raise exception 'PREUVE maintenance (table) : % écart(s) — seul postgres (propriétaire) devrait avoir des droits DML directs. Détail : %',
      v_ecarts_table, left(v_detail_table, 500);
  end if;

  -- ─── Fonctions internes : EXECUTE ───
  with roles as (
    select rolename from (values ('anon'), ('authenticated'), ('service_role'), ('postgres')) as r(rolename)
  ),
  fonctions as (
    select fn, attendu from (values
      ('public.en_maintenance()',              true),   -- ouverte aux 4 rôles (voir case ci-dessous)
      ('public.refuser_pendant_maintenance()',  false)   -- postgres seul
    ) as f(fn, attendu)
  ),
  mesure as (
    select r.rolename, f.fn,
           has_function_privilege(r.rolename, f.fn, 'EXECUTE') as a_effectivement,
           case when f.fn = 'public.en_maintenance()' then true
                else r.rolename = 'postgres'
           end as devrait_avoir
    from roles r cross join fonctions f
  )
  select count(*),
         string_agg(rolename || ':' || fn || ' = ' || a_effectivement, ', ' order by fn, rolename)
    into v_ecarts_fn, v_detail_fn
  from mesure
  where a_effectivement is distinct from devrait_avoir;

  if v_ecarts_fn > 0 then
    raise exception 'PREUVE maintenance (fonctions) : % écart(s) sur EXECUTE. Détail : %',
      v_ecarts_fn, left(v_detail_fn, 500);
  end if;

  raise notice 'PREUVE maintenance OK : aucun rôle applicatif (anon, authenticated, service_role) '
    'n''a de droit DML direct sur la table, ni d''EXECUTE sur refuser_pendant_maintenance(). '
    'Seule en_maintenance() reste exécutable par les 4 rôles.';
end $$;
