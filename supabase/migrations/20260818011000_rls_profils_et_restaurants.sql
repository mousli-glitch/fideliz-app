/*
 * ═══════════════════════════════════════════════════════════════════════
 *  FERMER LA FUITE INTER-TENANT ET L'INJECTION DE RESTAURANTS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Deux défauts PROUVÉS par la matrice A/B du 18/08, pas supposés.
 *
 * ─── 1. Tout compte connecté lit tous les profils ───
 *
 * Le tenant A a lu le profil du tenant B — courriel, rôle, restaurant_id.
 * Les restaurateurs appartiennent à des clients distincts : c'est une fuite
 * de confidentialité inter-tenant.
 *
 * QUATRE policies en cause, pas trois comme je l'avais d'abord écrit. Les
 * policies permissives se combinent par OU : la plus large gagne, et en
 * retirer trois sur quatre ne change rien. Elles tombent ensemble ou pas du
 * tout.
 *
 *   temp_open_profiles       using (true)
 *   global_nav_profiles      using (true)
 *   final_profile_access_v3  using (true)
 *   root_read_all_profiles   using (role = 'root')   ← celle-ci dit l'inverse
 *                                                      de son nom
 *
 * La quatrième mérite un mot : `role` désigne la colonne de la LIGNE lue, pas
 * le rôle de l'appelant. Elle ne donne donc pas « à root, tous les profils » ;
 * elle donne « à tout le monde, les profils des root ». Les comptes
 * administrateurs et leurs adresses sont exposés à n'importe quel compte
 * connecté. Le nom a probablement suffi à ce que personne ne la relise.
 *
 * ─── 2. N'importe quel compte connecté crée des restaurants ───
 *
 * Mesuré : le tenant A, simple `restaurant`, a inséré trois lignes — par la
 * table et par deux vues. Elles naissent orphelines (`owner_id` et
 * `created_by` à NULL) et invisibles aux autres tenants, donc ce n'est pas une
 * mutation inter-tenant ; c'est de l'injection dans une table partagée.
 *
 * Deux chemins, et je n'avais vu que le premier :
 *
 *   "Sales can create restaurants"   with check (true), portée par
 *                                    `authenticated` — donc pas seulement les
 *                                    commerciaux, malgré son nom.
 *
 *   "Super Admin Restaurants Access" FOR ALL, avec `using` et SANS
 *                                    `with check`. PostgreSQL emploie alors
 *                                    le `using` comme contrôle d'INSERT : un
 *                                    restaurateur peut insérer une ligne dont
 *                                    il se désigne propriétaire.
 *
 * ─── Pourquoi c'est sans risque fonctionnel ───
 *
 * Vérifié dans le code, pas déduit. Les seuls accès à `profiles` soumis à la
 * RLS sont deux composants client :
 *
 *   app/login/page.tsx                       → son propre profil (`id = uid`)
 *   …/root/restaurants-management/page.tsx   → `id, email`, page root
 *
 * Tout le reste — 23 emplacements, dont `garde-action.ts`, les Server Actions
 * et les routes API — passe par la clé de service, qui contourne la RLS.
 * `create-restaurant.ts` aussi : la création réelle n'a JAMAIS eu besoin d'une
 * policy d'INSERT.
 *
 * Les deux chemins client restent couverts par `profiles_self` et
 * `profiles_root_select_all`, conservées.
 *
 * ─── Réversibilité ───
 *
 * Le retour arrière est en fin de fichier, en commentaire, prêt à coller.
 * Aucune donnée n'est touchée : uniquement des policies.
 */

/*
 * ─────────────────────────────────────────────────────────────────────
 *  D'ABORD : casser une récursion que les policies larges masquaient
 * ─────────────────────────────────────────────────────────────────────
 *
 * Trouvé en mesurant, pas en relisant. Après avoir retiré les quatre
 * policies, TOUTE lecture de `profiles` par un compte connecté rendait
 * `54001 — stack depth limit exceeded`.
 *
 * La cause : `profiles_root_select_all` évalue `current_role()`, qui LIT
 * `public.profiles` ; cette lecture déclenche la RLS, qui réévalue la policy,
 * qui rappelle `current_role()`. Boucle infinie.
 *
 * Ça ne se voyait pas parce que `temp_open_profiles` et ses jumelles
 * répondaient `true` avant qu'on en arrive là. Autrement dit : les policies
 * trop larges ne faisaient pas que fuiter, elles CACHAIENT un bug qui aurait
 * mis le dashboard par terre le jour où on les aurait retirées.
 *
 * La correction est le motif standard pour une fonction d'aide à la RLS :
 * `SECURITY DEFINER`, donc lecture hors RLS, donc pas de réentrée. Le
 * `search_path` reste figé sur `public`, comme avant.
 *
 * Les droits d'exécution sont rétablis à l'identique après coup : recréer une
 * fonction efface ses ACL, et `current_role()` est évaluée par les policies
 * sous l'identité de l'appelant — la retirer à `authenticated` casserait
 * toutes les policies qui s'en servent, sur `games` comme ailleurs.
 */
/*
 * Revue de sûreté, puisqu'elle gagne en privilège :
 *
 *   · aucun paramètre — on ne peut pas lui demander le rôle d'un AUTRE
 *     compte, elle ne sait répondre que sur `auth.uid()` de l'appelant ;
 *   · propriétaire `postgres`, celui qui crée déjà tout dans `public` ;
 *   · `pg_temp` placé EXPLICITEMENT en dernier. Sans ça il est cherché en
 *     premier, et une table temporaire nommée `profiles` détournerait une
 *     fonction DEFINER. La référence est déjà qualifiée (`public.profiles`),
 *     ce qui suffirait ; les deux ensemble ne coûtent rien ;
 *   · `pg_catalog` en tête : les opérateurs et `coalesce` ne peuvent pas être
 *     redéfinis sous elle ;
 *   · `stable` — elle lit, elle n'écrit pas, aucun effet de bord ;
 *   · EXECUTE rendu à `anon`, `authenticated` et `service_role`, soit
 *     exactement ce que le GRANT à PUBLIC donnait déjà. Restreindre `anon`
 *     serait tentant : les dix policies qui appellent `current_role()`
 *     directement visent toutes `{authenticated}`. Mais DEUX policies visent
 *     `{public}` et appellent `is_root()` / `is_sales()`, qui l'appellent à
 *     leur tour — `root_full_logs` sur activity_logs_legacy et
 *     `sales_manage_notes` sur crm_notes. Retirer `anon` ferait échouer toute
 *     requête anonyme sur ces deux tables. Mesuré, pas supposé.
 *
 * Une conception plus sûre existe : déplacer ces aides dans un schéma non
 * exposé par PostgREST, hors de portée de l'API. Elle impose de réécrire les
 * douze policies qui les référencent. Ce fichier ferme une fuite ; il n'a pas
 * à emporter une refonte avec lui. À reprendre avec la charte de fusion.
 */
create or replace function public."current_role"()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'anon'
  );
$$;
revoke all on function public."current_role"() from public;
grant execute on function public."current_role"() to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────── profiles
-- Les quatre ensemble. En laisser une seule rendrait les trois autres
-- inutiles à retirer.
drop policy if exists temp_open_profiles      on public.profiles;
drop policy if exists global_nav_profiles     on public.profiles;
drop policy if exists final_profile_access_v3 on public.profiles;
drop policy if exists root_read_all_profiles  on public.profiles;

/*
 * Ce qui subsiste, et qui suffit :
 *
 *   profiles_self         to public         using (id = auth.uid())
 *   profiles_self_select  to authenticated  using (id = auth.uid())
 *   profiles_root_select_all to authenticated using (current_role() = 'root')
 *
 * Les deux premières font double emploi. On les garde telles quelles : ce
 * n'est pas le moment de réécrire ce qui fonctionne, et une policy en trop
 * qui dit la même chose ne coûte rien. Elles seront fusionnées avec la charte
 * de fusion.
 *
 * Aucune policy d'écriture n'existe sur `profiles`, et il n'en faut pas : la
 * RLS refuse alors tout INSERT, UPDATE et DELETE aux rôles non privilégiés,
 * même si le GRANT est là — et il l'est, `anon` détient réellement INSERT et
 * UPDATE. C'est mesuré, et c'est ce qui rend ce fichier urgent.
 *
 * Le commercial n'obtient rien de plus. Aucun parcours client ne le demande :
 * `api/sales/dashboard` ne lit que son propre profil par la session, et prend
 * la clé de service pour le reste.
 */

-- ────────────────────────────────────────────────────────── restaurants
drop policy if exists "Sales can create restaurants" on public.restaurants;

/*
 * `Super Admin Restaurants Access` est scindée. Le prédicat est repris MOT
 * POUR MOT sur les trois verbes conservés — lecture, modification,
 * suppression — pour que le dashboard d'un restaurateur continue de
 * fonctionner à l'identique. Seul INSERT disparaît, et c'est tout l'objet.
 *
 * L'UUID en dur est celui de la production. Il est conservé tel quel : le
 * remplacer par un test de rôle serait une amélioration, mais ce fichier
 * ferme une fuite et n'a pas à en profiter pour changer autre chose.
 */
drop policy if exists "Super Admin Restaurants Access" on public.restaurants;

create policy "Super Admin Restaurants Read" on public.restaurants
  as permissive for select to authenticated
  using (((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid())));

create policy "Super Admin Restaurants Update" on public.restaurants
  as permissive for update to authenticated
  using (((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid())))
  with check (((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid())));

create policy "Super Admin Restaurants Delete" on public.restaurants
  as permissive for delete to authenticated
  using (((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid())));

/*
 * `Enable insert for root users only` est conservée telle quelle : c'est la
 * seule voie d'INSERT qui reste, et elle vérifie réellement le rôle. Le
 * parcours réel n'en a pas besoin — `create-restaurant.ts` emploie la clé de
 * service — mais la retirer fermerait une porte légitime sans nécessité.
 */

/*
 * ─────────────────────────────────────────────────────────────────────
 *  RETOUR ARRIÈRE — à coller tel quel, aucune donnée concernée
 * ─────────────────────────────────────────────────────────────────────
 *
 * create policy temp_open_profiles on public.profiles
 *   as permissive for select to authenticated using (true);
 * create policy global_nav_profiles on public.profiles
 *   as permissive for select to authenticated using (true);
 * create policy final_profile_access_v3 on public.profiles
 *   as permissive for select to authenticated using (true);
 * create policy root_read_all_profiles on public.profiles
 *   as permissive for select to authenticated using ((role = 'root'::text));
 * create policy "Sales can create restaurants" on public.restaurants
 *   as permissive for insert to authenticated with check (true);
 * drop policy "Super Admin Restaurants Read"   on public.restaurants;
 * drop policy "Super Admin Restaurants Update" on public.restaurants;
 * drop policy "Super Admin Restaurants Delete" on public.restaurants;
 * create policy "Super Admin Restaurants Access" on public.restaurants
 *   as permissive for all to authenticated
 *   using (((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid())));
 */
