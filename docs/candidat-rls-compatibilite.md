# Candidat RLS minimal — diff, compatibilité, ordre de bascule

Branche `candidat/rls-minimal` = **`023b8f0`**, construite depuis
`main = 41659a8`. **Non déployée.**

## Le diff, depuis le commit réellement en production

11 fichiers, 1 264 insertions, 20 suppressions.

| | |
|---|---|
| Migrations | `20260818011000` (RLS profils/restaurants/crm_notes/`current_role`) · `20260818012000` (identité root par le rôle) |
| Helper | `lib/securite/compte-root.ts` |
| Test permanent | `lib/securite/identite-root.test.ts` |
| TypeScript | `admin-actions.ts`, `delete-sales-user.ts`, `repair-orphans.ts`, `verify/[id]/page.tsx` |
| Documentation | 3 fichiers de preuve, non exécutables |

Ni baseline, ni durcissement, ni gel, ni repair, ni entitlements, ni module de
fusion, ni graphisme, ni nettoyage. Contrôlé fichier par fichier.

66 tests verts, typecheck propre.

## L'isolation est structurelle, pas obtenue par précaution

**`main` ne contient aucun fichier sous `supabase/`.** Il n'y a pas de dossier
de migrations du tout.

Conséquence directe : un `db push` depuis ce candidat voit exactement **deux**
migrations locales absentes du registre de production. Il ne peut rien
appliquer d'autre — ni baseline, ni durcissement, ni gel, puisque ces fichiers
n'existent pas sur cette branche.

Je n'ai donc eu aucun garde-fou à écrire. C'est la meilleure des garanties :
celle qu'on ne peut pas oublier de poser.

**Aucune dépendance à la baseline.** Les deux migrations ne référencent que
des objets déjà présents en production : `profiles`, `restaurants`,
`crm_notes`, `games`, `system_logs`, `sales_restaurants`, `current_role()`,
`is_sales()`, `is_root()`, `handle_deleted_commercial()`.

## Matrice de compatibilité

| Application | Base | Résultat |
|---|---|---|
| `41659a8` | RLS historique | **production actuelle** — l'état de référence |
| candidat | RLS historique | **compatible** — analyse |
| `41659a8` | RLS corrigée | **compatible** — mesuré |
| candidat | RLS corrigée | **compatible** — traversée UI jouée |

### Ancienne application sur base corrigée — mesuré

Les seules requêtes de l'application soumises à la RLS sont celles exécutées
**sous la session de l'utilisateur**. Toutes les autres passent par la clé de
service et l'ignorent par construction. Chacune, rejouée sur la base corrigée :

| Requête réelle | Rôle | Lignes |
|---|---|---|
| son propre profil (`login`) | root | 1 |
| son propre profil | restaurateur A | 1 |
| `id, email` d'un lot de comptes (page root) | root | **2** |
| son propre profil (`api/sales/dashboard`) | commercial | 1 |
| `restaurant_id` du profil (layout admin) | A | 1 |
| son restaurant | A | 1 |
| ses jeux | A | 1 |

**Aucune requête ne casse.**

### Candidat sur base historique — analyse, pas mesure

Les quatre modifications TypeScript n'ajoutent qu'une requête :
`idDuCompteRoot`, qui lit `profiles` **avec la clé de service**. Elle est donc
insensible à l'état de la RLS. Les autres changements retirent un test
d'identité redondant ou remplacent une constante par une valeur cherchée.

Je le qualifie **analyse** et non mesure : je n'ai pas construit l'application
candidate contre la base historique. Le raisonnement tient, il n'est pas
prouvé par exécution.

## Ordre de bascule et de rollback

Les deux moitiés étant **indépendantes**, l'ordre est libre. Je recommande
néanmoins :

1. **Migration d'abord**, application ensuite. L'ancienne application
   fonctionne sur la base corrigée — c'est mesuré — donc la fenêtre entre les
   deux est sûre. L'inverse reposerait sur l'analyse seule.
2. **Rollback** : application d'abord si elle a été déployée, puis
   `docs/rollback-rls-joue.md`. Un ancien déploiement Vercel fonctionne sur la
   base corrigée, donc le rollback applicatif seul est déjà une porte de
   sortie — sans réouvrir les vulnérabilités.

C'est le point le plus utile de cette analyse : **on peut revenir en arrière
côté application sans toucher à la base**, donc sans restaurer la fuite.

## `sales_restaurants` — la question qui reste pour Samy

Relevé en lecture seule sur la production, anonymisé.

| | |
|---|---|
| Comptes `sales` | **1** |
| Comptes `root` | 1 |
| Comptes `restaurant` | 7 |
| Restaurants | 4, tous actifs |
| **Rattachements dans `sales_restaurants`** | **0** |
| Restaurants avec un créateur renseigné | 4 |
| Créateurs distincts | **1** |
| Restaurants créés par un compte `sales` | **0** |
| Notes CRM | **0** |

### Ce que ça change, concrètement

Les quatre restaurants ont été créés par **un seul compte**, qui n'est pas le
commercial. `sales_restaurants` est vide, et `crm_notes` aussi.

- **Aujourd'hui** : le commercial voit tous les profils (la fuite) et toutes
  les notes — mais il n'y a aucune note.
- **Après le hotfix** : il voit son propre profil, et les notes des
  restaurants qui lui sont rattachés — c'est-à-dire **aucun**.

**La perte réelle est donc nulle sur les données** : il n'y a rien à perdre.
Ce qui change, c'est que ses écrans de portefeuille afficheront des listes
vides tant que les rattachements ne sont pas renseignés.

### Ma recommandation, et la question

Je **ne** propose pas de correspondance : c'est une décision commerciale, pas
technique. Rien dans les données ne me dit quel commercial suit quel
restaurant — le seul indice possible, `created_by`, pointe vers un compte qui
n'est pas commercial.

**Ce que je ne ferai pas** : ajouter une policy de secours du type « le
commercial voit tout s'il n'a aucun rattachement ». Ce serait recréer
exactement la fuite que le hotfix ferme, avec une condition qui la rendrait
plus difficile à voir.

**Question pour Samy** : le commercial doit-il suivre les quatre restaurants,
un sous-ensemble, ou aucun pour l'instant ? Une fois la réponse connue, quatre
lignes au maximum suffisent, à insérer **avant** la migration pour qu'il n'y
ait aucune fenêtre où ses écrans sont vides.

### Un point connexe

`get_sales_stats()` appelle `get_my_role()`, qui **n'existe pas** : tout appel
lève une erreur. C'est un défaut antérieur, indépendant de ce hotfix, mais il
concerne le même parcours commercial — à traiter avec la même décision.
