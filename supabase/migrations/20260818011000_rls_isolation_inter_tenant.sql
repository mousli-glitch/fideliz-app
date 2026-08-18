/*
 * ═══════════════════════════════════════════════════════════════════════
 *  ISOLATION INTER-TENANT — UN SEUL FICHIER, DONC ATOMIQUE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ─── Pourquoi un seul fichier ───
 *
 * Ce lot était en deux migrations. Mesuré le 18/08 sur la branche, avec deux
 * migrations jetables dont la seconde échouait volontairement :
 *
 *     Applying 29990101000001_essai_atomicite_a.sql...  → table créée
 *     Applying 29990101000002_essai_atomicite_b.sql...  → ERREUR 22012
 *
 *     table A créée : OUI    · A inscrite au registre : OUI
 *     table B créée : non    · B inscrite au registre : non
 *
 * `supabase db push` N'EST PAS atomique entre fichiers : chaque migration a
 * sa propre transaction. Un échec du second laisse le premier appliqué ET
 * enregistré.
 *
 * L'état intermédiaire aurait été : `profiles`, `restaurants` et `crm_notes`
 * corrigés, `games` et `system_logs` encore attachés à l'identifiant du root.
 * Il est probablement sans danger — les deux moitiés donnent l'accès root,
 * l'une par le rôle, l'autre par l'identifiant, et elles se recouvrent. Mais
 * je ne peux pas le PROUVER sur la branche : il faudrait y recopier
 * l'identifiant du root réel, ce qui est interdit et ne prouverait que le
 * couplage qu'on cherche justement à retirer.
 *
 * Un seul fichier supprime la question au lieu d'y répondre à moitié. Le DDL
 * de PostgreSQL est transactionnel : tout s'applique, ou rien.
 *
 * ─── Rejouable ───
 *
 * Chaque `create policy` est précédé de son `drop policy if exists`. La
 * migration est atomique, donc un échec ne laisse rien — mais une reprise
 * après un état posé à la main, ou après une intervention d'urgence, doit
 * pouvoir passer. Une migration qui ne s'exécute qu'une fois est un script
 * d'installation.
 *
 * ─── L'ordre interne n'est pas une préférence ───
 *
 * `current_role()` passe en SECURITY DEFINER EN PREMIER. Les policies larges
 * de `profiles` masquaient une récursion : `profiles_root_select_all` appelle
 * `current_role()`, qui LIT `profiles`, ce qui réévalue la policy. Les retirer
 * avant de corriger la fonction rend `54001` sur toute lecture de profil.
 *
 * ─── Le retour arrière n'est PAS ici ───
 *
 * Il vit dans `docs/runbook-rls.md`. Deux raisons. Un fichier de migration
 * porte du SQL, pas une procédure. Et un rollback écrit en commentaire géant
 * déséquilibre le découpage des blocs — c'est arrivé, et ça a fait passer du
 * texte de commentaire pour du code aux yeux des contrôles.
 *
 * ⚠ Ce rollback restaure volontairement les failles. C'est une sortie de
 *   CONTINUITÉ, jamais un état sûr, et AUCUN rollback applicatif ne le
 *   remplace : ce hotfix est purement SQL.
 */

/*
 * ══════════ LOT 1 — profils, restaurants, crm_notes ════════════════
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
 *   · `search_path` VIDE. C'est plus strict que `pg_catalog, public, pg_temp`
 *     que j'avais d'abord posé : avec une chaîne vide, `pg_temp` n'est plus
 *     dans le chemin du tout, et `pg_catalog` y reste implicitement en tête —
 *     PostgreSQL l'y met toujours quand il n'est pas nommé. Toutes les
 *     références étant qualifiées (`public.profiles`, `auth.uid()`), rien ne
 *     dépend du chemin ;
 *   · l'interposition a été TENTÉE, pas seulement écartée : le compte A a
 *     créé une table temporaire `profiles` le déclarant `root`, puis appelé
 *     la fonction. Elle a rendu `restaurant`. La table temporaire existait
 *     bien au moment de l'appel ;
 *   · ni `anon` ni `authenticated` ne possèdent `CREATE` sur `public`,
 *     `extensions`, `auth` ou `pg_catalog` — seulement `USAGE`. Aucun schéma
 *     du chemin n'est modifiable par un rôle non privilégié ;
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
set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
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
 * `Super Admin Restaurants Access` est scindée ET débarrassée de son UUID.
 *
 * L'ancienne portait `auth.uid() = '04eb7091-…'` : le droit d'administrer
 * les restaurants était attaché à UNE PERSONNE, pas à un rôle. Deux
 * conséquences. Le jour où ce compte change, l'administration s'arrête. Et
 * un root synthétique — celui des tests — n'y a jamais accès, donc le
 * parcours root n'était pas testable ailleurs qu'en production.
 *
 * Vérifié avant de la retirer, en lecture seule sur la production :
 *   · ce compte est le SEUL à porter `role = 'root'` ;
 *   · il est actif ;
 *   · il ne possède AUCUN restaurant, et n'est rattaché à aucun.
 *
 * Ce dernier point est décisif : `owner_id = auth.uid()` ne joue jamais pour
 * lui. La branche UUID était donc son seul accès. La retirer sans
 * remplacement l'aurait enfermé dehors.
 *
 * `public.current_role() = 'root'` est donc strictement équivalent
 * aujourd'hui — un seul compte, la même identité — et correct demain.
 *
 * Le prédicat des restaurateurs (`owner_id = auth.uid()`) est repris mot
 * pour mot. Seul INSERT disparaît, et c'était l'objet.
 */
drop policy if exists "Super Admin Restaurants Access" on public.restaurants;

drop policy if exists "Super Admin Restaurants Read" on public.restaurants;
create policy "Super Admin Restaurants Read" on public.restaurants
  as permissive for select to authenticated
  using ((public."current_role"() = 'root') or (owner_id = auth.uid()));

drop policy if exists "Super Admin Restaurants Update" on public.restaurants;
create policy "Super Admin Restaurants Update" on public.restaurants
  as permissive for update to authenticated
  using ((public."current_role"() = 'root') or (owner_id = auth.uid()))
  with check ((public."current_role"() = 'root') or (owner_id = auth.uid()));

drop policy if exists "Super Admin Restaurants Delete" on public.restaurants;
create policy "Super Admin Restaurants Delete" on public.restaurants
  as permissive for delete to authenticated
  using ((public."current_role"() = 'root') or (owner_id = auth.uid()));

/*
 * ────────────────────────────────────────────────────────── crm_notes
 *
 * J'avais classé ce défaut « hors périmètre ». C'était une erreur : la
 * matrice montre qu'un commercial lit, modifie et supprimerait les notes
 * d'un restaurant auquel il n'est PAS rattaché. C'est une violation
 * inter-tenant, donc exactement l'objet de ce fichier.
 *
 * La policy unique `sales_manage_notes` porte `for all to public using
 * (is_sales() or is_root())` — aucun filtre de rattachement, et `to public`
 * inclut `anon`.
 *
 * Relevé en production avant correction : la table contient **0 ligne**,
 * `sales_restaurants` en contient **0** aussi, et `crm_notes` n'apparaît
 * **nulle part** dans le code applicatif. Aucune donnée n'est donc exposée
 * aujourd'hui, et aucun parcours ne peut casser. C'est le moment de la
 * fermer : quand la fusion y écrira, il sera trop tard pour le faire sans
 * risque.
 *
 * Le restaurateur n'y a pas accès : ce sont des notes commerciales SUR son
 * établissement, pas des notes qui lui appartiennent.
 */
drop policy if exists sales_manage_notes on public.crm_notes;

drop policy if exists crm_notes_root on public.crm_notes;
create policy crm_notes_root on public.crm_notes
  as permissive for all to authenticated
  using (public."current_role"() = 'root')
  with check (public."current_role"() = 'root');

drop policy if exists crm_notes_commercial_rattache on public.crm_notes;
create policy crm_notes_commercial_rattache on public.crm_notes
  as permissive for all to authenticated
  using (
    public."current_role"() = 'sales'
    and exists (
      select 1 from public.sales_restaurants sr
      where sr.restaurant_id = crm_notes.restaurant_id
        and sr.sales_user_id = auth.uid()
    )
  )
  with check (
    public."current_role"() = 'sales'
    and exists (
      select 1 from public.sales_restaurants sr
      where sr.restaurant_id = crm_notes.restaurant_id
        and sr.sales_user_id = auth.uid()
    )
  );


/*
 * ══════════ LOT 2 — games, system_logs, trigger ════════════════════
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
drop policy if exists "ADMIN_GAMES_FULL_ACCESS" on public.games;
create policy "ADMIN_GAMES_FULL_ACCESS" on public.games
  as permissive for all to authenticated
  using (public."current_role"() = 'root')
  with check (public."current_role"() = 'root');

/*
 * ─────────────────────────────────────── system_logs · autorisation
 */
drop policy if exists "Root Full Access" on public.system_logs;
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
