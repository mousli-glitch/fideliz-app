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

---

# `sales_restaurants` — décision tranchée, script éprouvé (18/08)

## Les faits correspondent à la décision

Relevé en lecture seule sur la production, avant toute préparation :

| Slug | Actif | Bloqué | Propriétaire | Jeux | Contacts |
|---|---|---|---|---|---|
| `best-pizza` | oui | non | oui | 1 | 100 |
| `la-ruche` | oui | non | oui | 1 | 253 |
| `soukara` | oui | non | oui | 1 | 104 |
| `test78` | oui | non | oui | 6 | 14 |

Exactement les trois clients et le compte de test. **La décision s'applique
telle quelle.**

## Correction de ce que j'avais écrit

J'avais annoncé que le commercial « verrait des écrans vides après le
hotfix ». **C'est faux, et la nuance compte.**

`app/api/sales/dashboard/route.ts` lit `sales_restaurants` et `restaurants`
avec la **clé de service**, qui contourne la RLS par construction. Le hotfix
ne touche pas ce parcours du tout.

Son périmètre vient de `sales_restaurants` **ou** de `created_by = son id`.
Avec zéro rattachement et zéro restaurant créé par lui, **son dashboard est
déjà vide aujourd'hui**. Et il n'existe **aucun repli « voir tout »** : la
branche `else` filtre sur `created_by`, ce qui rend zéro.

Le rattachement n'est donc pas une compensation du hotfix : c'est une
**amélioration indépendante**. Elle peut se faire avant, pendant ou après.

## `get_sales_stats()` — dead code

**Zéro appelant** dans `app/`, `lib/` et `components/`. La fonction appelle
`get_my_role()`, qui n'existe pas, donc tout appel lèverait une erreur — mais
personne ne l'appelle.

Conséquences : le défaut est **indépendant** du hotfix RLS ; l'écran
commercial ne l'invoque pas, donc il n'échoue ni ne masque rien ; et le
rattachement suffit **sans** la corriger.

Elle reste en dette. Aucun correctif n'est mêlé au hotfix.

## Le script, et ses cinq épreuves

`supabase/operations/rattacher-commercial.sql`. Le commercial est résolu par
son **rôle**, jamais par son adresse : le dépôt est public.

| Épreuve | Verdict | Lignes |
|---|---|---|
| application nominale | ACCEPTÉ | **3** |
| rejeu à l'identique | ACCEPTÉ | **3** — idempotent |
| deux comptes `sales` | **REFUS** — « 2 comptes sales » | 3 inchangé |
| un restaurant attendu absent | **REFUS** — « 2 sur 3 attendus » | 3 inchangé |
| rollback | exécuté | **0** |

Résultat du cas nominal, vérifié slug par slug : `best-pizza`, `la-ruche` et
`soukara` rattachés ; `test78` et les deux tenants synthétiques **non**.

`test78` est exclu par une **exception nommée**, pas seulement par omission de
la liste. Une exclusion qui se relit vaut mieux qu'une omission qu'un
copier-coller rattrape.

Le rollback filtre à la fois sur les trois slugs **et** sur le compte
commercial : aucune autre ligne ne peut être touchée.

## Ce qui reste avant production

Non faits, et je ne les présente pas autrement :

- parcours d'**écriture** depuis l'interface ;
- parcours `/super-admin` ;
- `supabase migration list` et dry-run contre la production ;
- candidat applicatif exécuté contre la base historique.

---

# Le mécanisme de livraison — un blocage, puis sa réponse

## Le CLI refuse un candidat qui ne contient que les deux migrations

`supabase db push --dry-run` contre la production, depuis le candidat à
2 fichiers :

```
LegacyDbPushMissingLocalError
"Remote migration versions not found in local migrations directory."
suggestion: supabase migration repair --status reverted 20260724002837 … 20260817235046
```

Le CLI demande de marquer **révoquées** les huit migrations historiques —
c'est-à-dire de mentir au registre sur des migrations réellement appliquées.
La consigne était d'arrêter si le CLI demandait ça. **Arrêté.**

Mon raisonnement précédent était donc incomplet : j'avais conclu que
l'absence de `supabase/` sur `main` garantissait l'isolation. C'est vrai du
**contenu** de ce qui pourrait partir, et faux du **fonctionnement** du CLI.
L'isolation était acquise, la livraison ne l'était pas.

## La réponse : ajouter les huit descriptions, pas les huit effets

Les huit migrations historiques sont **déjà réconciliées** avec le registre
de production, empreinte par empreinte (`npm run migrations:reconcilier`,
0 écart). Les ajouter au candidat ne change **rien** à la base : elles y sont
déjà enregistrées, donc le CLI les saute.

Dry-run après ajout :

```
Would push these migrations:
 • 20260818011000_rls_profils_et_restaurants.sql
 • 20260818012000_identite_root_par_le_role.sql
```

**Exactement les deux attendues.** Aucune baseline, aucun durcissement, aucun
gel, aucun `repair`.

## Ce que ça change au diff

Le candidat passe de 11 à 19 fichiers. Les huit ajoutés ne sont **pas** des
changements : ce sont les descriptions verbatim de ce que la production
contient déjà. Un `db push` ne les exécute pas.

C'est la seule façon d'employer l'outil officiel sans toucher au registre.
L'alternative — appliquer le SQL à la main — laisserait le registre muet sur
deux migrations réellement appliquées, et casserait la réconciliation.
