# Runbook du hotfix RLS — préparé, non exécuté

`candidat/rls-minimal`. **Production intacte.** Rien de ce document n'a été
appliqué en production.

## Les quatre fichiers portant l'UUID root — décision

| Fichier | Rôle de l'UUID | Client | Parcours vivant | Risque s'il reste après la migration |
|---|---|---|---|---|
| `verify/[id]/page.tsx` | **autorisation** — `user.id === UUID` en OU avec `authorizedRoles` | session + service | `/verify` d'un ticket par le personnel | **aucun** : `'root'` figure déjà dans la liste, le test est strictement redondant |
| `admin-actions.ts` | protection (`userId === ROOT_ID`) **et** valeur (`created_by = ROOT_ID`) | **service_role** | suppression d'un compte par root | **aucun** : contourne la RLS, l'UUID reste un profil valide |
| `delete-sales-user.ts` | idem | **service_role** | suppression d'un commercial | **aucun** |
| `repair-orphans.ts` | valeur, via `ROOT_ADMIN_ID` | **service_role** | réparation des orphelins | **aucun** |

**Preuve que l'ancienne application fonctionne sur la base corrigée.** Les
seules requêtes soumises à la RLS sont celles exécutées sous session ; toutes
les autres emploient la clé de service. Chacune rejouée sur la base corrigée :

| Requête réelle | Rôle | Lignes |
|---|---|---|
| son propre profil (`login`) | root | 1 |
| son propre profil | restaurateur | 1 |
| `id, email` d'un lot (page root) | root | **2** |
| son propre profil (`api/sales/dashboard`) | commercial | 1 |
| `restaurant_id`, restaurant, jeux | restaurateur | 1 chacun |

### Décision

**Les quatre changements sont une DETTE, pas une dépendance.** Ils
n'accompagnent pas la migration RLS.

Raison : aucun ne s'exécute sous la RLS. Trois passent par la clé de service ;
le quatrième est un test redondant. La migration ne les casse pas, et eux ne
la conditionnent pas.

Leur valeur est ailleurs, et elle est réelle : sans eux, le parcours root ne
se teste qu'en production. C'est ce qui les rend importants — pas urgents.
**Hotfix applicatif séparé, plus tard.**

## Le mécanisme, prouvé

`migration list` contre la production : les 8 historiques en `remote` sans
`local`, les 2 RLS en `local` sans `remote`.

Premier dry-run, candidat à 2 fichiers → **refus** :
`LegacyDbPushMissingLocalError`, avec suggestion de `migration repair
--status reverted`. Arrêté, comme prescrit.

Après ajout des 8 descriptions — vérifiées **identiques** aux versions
réconciliées, empreinte SHA-256 par empreinte :

```
Would push these migrations:
 • 20260818011000_rls_profils_et_restaurants.sql
 • 20260818012000_identite_root_par_le_role.sql
```

Exactement les deux. Aucune baseline, aucun durcissement, aucun gel, aucun
`repair`. Aucun avertissement ignoré.

## Séquence

### Préflight — tout doit être vert avant de commencer

1. `git log -1 origin/main` = le commit attendu.
2. `npm run verifier` vert · typecheck · build.
3. `supabase migration list --project-ref <prod>` : 8 remote, 2 local.
4. `supabase db push --project-ref <prod> --dry-run` : **exactement** les deux.
5. Empreinte des policies de production = `5b6dd5bc9df9ce6068c148a3f5288c05`.
   **Si elle diffère, arrêter** : la base a bougé depuis la mesure.
6. Sauvegarde des définitions : `pg_policies` du schéma `public` et la
   définition de `current_role()`, relevées et conservées.
7. Témoins QR verts.

### Application

`supabase db push --project-ref <prod>` — **sans** `--include-all`.

Durée mesurée sur la branche : **migration ~1 s, rollback ~1 s**. Ce sont des
opérations de catalogue, pas de données.

### Contrôles immédiats, non destructifs

- Empreinte des policies = `124e7014ad36e17d41ddd2defcbf7bdf`.
- 41 policies, **0** portant l'UUID, 3 sur `profiles`, 2 sur `crm_notes`.
- `current_role()` en `SECURITY DEFINER`, `search_path` vide.
- `/login` 200 · `/admin/*` 307 · `/verify` 200 · témoins QR verts.
- **Aucun test inter-tenant sur des données réelles.**

### GO / NO-GO

**GO** si les six contrôles ci-dessus passent.

**NO-GO immédiat** si : un restaurateur légitime perd son dashboard ; root
perd l'administration ; une erreur `54001` apparaît ; une route QR casse ;
les 500 augmentent.

### Sorties — et une erreur que j'avais écrite

**J'avais mis « rollback applicatif d'abord ». C'est faux ici, et il faut le
dire clairement.**

Ce hotfix est **purement SQL** : aucune application n'est déployée avec lui.
Revenir à un déploiement Vercel antérieur ramène donc **la même
application**, et ne touche **aucune policy**. Ce n'est pas une sortie — c'est
une manœuvre sans effet sur le problème.

Le rollback Vercel ne redevient pertinent que le jour où un changement
applicatif accompagne réellement une migration. Ce n'est pas ce jour-là.

**Les vraies sorties, dans l'ordre :**

1. **Correction en avant, ciblée.** Les six cas préparés ci-dessous. Chacun se
   répare par une policy ou une donnée, en une minute, sans rien défaire.
2. **Rollback SQL exact**, si la correction en avant est impossible ET que la
   continuité est gravement touchée. Il est prouvé dans les deux sens.
3. **Surveillance renforcée** pendant tout l'état historique : il est
   vulnérable, tous les profils y sont lisibles par tout compte connecté.
4. **Réapplication au plus vite**, une fois la cause comprise.

**Durée maximale dans l'état historique : 2 heures.** Au-delà, la fuite
inter-tenant redevient le risque dominant, devant l'incident qui a motivé le
retour.

### Les six corrections en avant, exécutables

Toutes sur `public`, toutes réversibles, aucune ne touche aux données.

**1. Root légitime refusé** — il ne voit plus restaurants, jeux ou logs.

```sql
select id, role, is_active from public.profiles where role = 'root';
-- Cause quasi certaine : role <> 'root'. Corriger le rôle, jamais la policy.
update public.profiles set role = 'root' where id = '<uuid-du-root>';
```

**2. Restaurateur ne lisant plus son propre profil**

```sql
select policyname, qual from pg_policies
 where schemaname='public' and tablename='profiles' and cmd='SELECT';
-- `profiles_self` doit exister. Si elle manque :
create policy profiles_self on public.profiles
  as permissive for select to public using (id = auth.uid());
```

**3. `current_role()` en récursion — `54001`**

```sql
create or replace function public."current_role"()
returns text language sql stable security definer set search_path = ''
as $r$ select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon'); $r$;
grant execute on function public."current_role"() to anon, authenticated, service_role;
```

⚠ `anon` doit **garder** `EXECUTE` : deux policies visant `{public}` passent
par `is_root()` / `is_sales()`, qui l'appellent en cascade.

**4. Commercial légitime refusé**

```sql
select count(*) from public.sales_restaurants where sales_user_id = '<uuid>';
-- Zéro ligne = donnée manquante, pas règle trop stricte.
-- Employer supabase/operations/rattacher-commercial.sql. Ne JAMAIS ajouter
-- une policy « voit tout si aucun rattachement » : ce serait rouvrir la fuite.
```

**5. Policy `crm_notes` incorrecte**

```sql
drop policy if exists crm_notes_commercial_rattache on public.crm_notes;
create policy crm_notes_commercial_rattache on public.crm_notes
  as permissive for all to authenticated
  using (public."current_role"() = 'sales' and exists (
    select 1 from public.sales_restaurants sr
     where sr.restaurant_id = crm_notes.restaurant_id and sr.sales_user_id = auth.uid()))
  with check (public."current_role"() = 'sales' and exists (
    select 1 from public.sales_restaurants sr
     where sr.restaurant_id = crm_notes.restaurant_id and sr.sales_user_id = auth.uid()));
```

**6. Création root de restaurant refusée**

```sql
select policyname, with_check from pg_policies
 where schemaname='public' and tablename='restaurants' and cmd='INSERT';
-- « Enable insert for root users only » doit subsister. Si elle manque :
create policy "Enable insert for root users only" on public.restaurants
  as permissive for insert to authenticated
  with check (exists (select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'root'::text));
```

### Le rollback SQL complet

Il vit ici, et plus dans le fichier de migration : un fichier de migration
porte du SQL, pas une procédure — et un rollback en commentaire géant y
déséquilibrait le découpage des blocs, au point de faire passer du commentaire
pour du code aux yeux des contrôles.

⚠ **Il restaure volontairement les failles.** L'ordre inverse celui de
l'aller : les policies AVANT `current_role()`.

Le SQL exact vit dans **`supabase/rollback/20260818011000_rollback.sql`**.

⚠ Correction du 18/08 : cette section renvoyait auparavant à
`docs/rollback-rls-joue.md`, qui ne contient que des extraits de diagnostic.
Le rollback exact n'était stocké **nulle part** — un runbook qui manque
précisément là où on en a besoin. Il est désormais un fichier exécutable,
hors de `supabase/migrations/` pour que le CLI ne l'applique jamais seul.

Il a été rejoué deux fois sur la branche : empreinte de sortie
`5b6dd5bc9df9ce6068c148a3f5288c05`, **identique à la production au caractère
près**, sur les 43 policies.

Sa première version était incomplète : elle omettait `ADMIN_GAMES_FULL_ACCESS`
et `Root Full Access`, le LOT 2 de la migration. Le nombre de policies était
pourtant juste — 43 des deux côtés. Seule la comparaison policy par policy
avec la production l'a révélé. Compter ne suffit pas ; il faut comparer.

## Le rattachement commercial est SÉPARÉ

`supabase/operations/rattacher-commercial.sql`. Ni prérequis, ni partie de la
transaction RLS.

Raison mesurée : `api/sales/dashboard` lit `sales_restaurants` avec la clé de
service. Le hotfix ne touche pas ce parcours, et le dashboard du commercial
est **déjà vide aujourd'hui**.

Décision validée : rattacher à **Best Pizza, La Ruche et Soukara**, jamais à
`test78`. À exécuter quand Samy le décide, avant ou après le hotfix.
