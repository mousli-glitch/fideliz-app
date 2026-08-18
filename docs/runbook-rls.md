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

- Empreinte des policies = `06ab49edad36e17d41ddd2defcbf7bdf`.
- 41 policies, **0** portant l'UUID, 3 sur `profiles`, 2 sur `crm_notes`.
- `current_role()` en `SECURITY DEFINER`, `search_path` vide.
- `/login` 200 · `/admin/*` 307 · `/verify` 200 · témoins QR verts.
- **Aucun test inter-tenant sur des données réelles.**

### GO / NO-GO

**GO** si les six contrôles ci-dessus passent.

**NO-GO immédiat** si : un restaurateur légitime perd son dashboard ; root
perd l'administration ; une erreur `54001` apparaît ; une route QR casse ;
les 500 augmentent.

### Rollback — dans cet ordre

1. **Rollback applicatif d'abord**, s'il suffit. `vercel rollback` vers le
   déploiement précédent. **Il conserve la RLS corrigée** — c'est mesuré :
   l'ancienne application fonctionne sur la base corrigée. Aucune
   vulnérabilité n'est rouverte.
2. **Correction en avant** ensuite. Les cinq pannes probables et leur
   diagnostic SQL sont dans `docs/rollback-rls-joue.md`. Chacune se répare par
   une policy ou une donnée, plus vite qu'un cycle complet.
3. **Rollback SQL en dernier recours.** Il est exact — prouvé dans les deux
   sens — mais il **restaure les vulnérabilités** : tous les profils lisibles,
   création de restaurants ouverte, `crm_notes` transversal.

**Durée maximale acceptable dans l'état historique : 2 heures.** Au-delà, la
fuite inter-tenant redevient le risque dominant, devant l'incident qui a
motivé le retour.

## Le rattachement commercial est SÉPARÉ

`supabase/operations/rattacher-commercial.sql`. Ni prérequis, ni partie de la
transaction RLS.

Raison mesurée : `api/sales/dashboard` lit `sales_restaurants` avec la clé de
service. Le hotfix ne touche pas ce parcours, et le dashboard du commercial
est **déjà vide aujourd'hui**.

Décision validée : rattacher à **Best Pizza, La Ruche et Soukara**, jamais à
`test78`. À exécuter quand Samy le décide, avant ou après le hotfix.
