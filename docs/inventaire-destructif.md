# Inventaire destructif — par provenance réelle du client

Relevé le 19/08/2026 sur la branche `candidat/baseline-acl`. Refait **par
provenance du client et garde effective**, pas par nom de table : un `.delete()`
sur `avis` n'a pas la même portée selon qu'il part d'un client de session
(soumis à la RLS) ou de la clé de service (qui la contourne).

La méthode : `grep` exhaustif de `.delete()`, `deleteUser`, `.remove(` sur
`app/`, `lib/`, `utils/`, hors tests. Chaque site est ensuite lu en entier —
client, garde, appelants réels, filtre de tenant, erreur vérifiée, atomicité,
cascade.

## Ce que chaque suppression entraîne — mesuré, pas supposé

Relevé sur la base (`pg_constraint`) :

| Ligne supprimée | Ce qui part avec |
|---|---|
| `auth.users` | `profiles` (CASCADE), `restaurants.user_id` (CASCADE), `sales_restaurants.sales_user_id` (CASCADE) |
| `restaurants` | `games`, `contacts`, `avis`, `sales_restaurants`, `activity_logs_legacy` (CASCADE) |
| `games` | `prizes` (CASCADE), **`winners` (CASCADE)** |
| `prizes` | `winners.prize_id` → SET NULL |

Le point à retenir : **supprimer un jeu efface son historique de gagnants.**
Ce n'est pas un défaut — c'est la conséquence d'un choix de schéma — mais
aucune des actions concernées ne le disait.

## Les sites

### `lib/securite/suppression-compte.ts` — `auth.admin.deleteUser`
Clé de service. **Seul point d'appel réel de `deleteUser` dans tout le dépôt.**
Appelée par `masterDeleteUser`, `deleteSalesUserAction`,
`deleteRestaurantFullAction`. Rôle exigé : `root` dans les trois cas.
Préflight à quatre issues, réattribution des trois colonnes, fenêtre de
suppression (marqueur + barrière), dernier contrôle avant l'irréversible,
relecture d'existence sur code structuré. Tests : `suppressions-fail-closed.test.ts`.
**Classée sûre.**

### `lib/securite/suppression-compte.ts` — `sales_restaurants`
Clé de service, bornée à `sales_user_id = cible`, erreur vérifiée, précède
l'irréversible. **Sûre.**

### `app/actions/delete-restaurant-full.ts` — `restaurants`
Clé de service, `root` uniquement. Owner lu sur la ligne, toutes les lectures
faillibles avant l'irréversible, intention durable, reprise. Tests :
`delete-restaurant-full.test.ts` (34 cas). **Sûre.**

### `app/actions/deleteGameAction.ts` — `games`
Client de **session** (RLS), `exigerRestaurantParSlug`. Le jeu est confronté au
restaurant résolu avant la suppression ; `error` ET `count` sont vérifiés.
C'est le seul `deleteGameAction` réellement appelé (par
`app/admin/[slug]/games/page.tsx`). **Sûre.** Réserve documentée : la cascade
emporte `winners`, et l'action ne le dit pas à l'utilisateur.

### `app/actions/delete-contact.ts` — `contacts`
Client de **session** (RLS), `exigerRestaurantParSlug`, borné par
`.eq("restaurant_id", garde.restaurant.id)` **et** `.in("id", …)`, erreur
vérifiée. Double protection : la garde applicative et la RLS. **Sûre.**

### `app/actions/delete-winner.ts` — `winners`
Clé de service, `exigerRestaurantParSlug`. Chaque ticket visé est confronté à
`games!inner(restaurant_id)`, et l'action exige
`lignes.length === winnerIds.length` : un identifiant étranger, inexistant ou
dupliqué fait échouer l'ensemble.

**Réserve, à traiter :** l'`error` de cette lecture de contrôle n'est pas lue.
En pratique le chemin reste fail-closed — une lecture en panne rend `data`
nul, donc `lignes.length` à 0, donc l'égalité des longueurs échoue et l'action
refuse. Mais la sécurité tient alors à un **effet de bord** du contrôle de
cardinalité, pas à une décision écrite. À corriger pour la lisibilité, ce
n'est pas un P0.

### `app/actions/google-business.ts` — `avis`
Clé de service, garde `autoriserGoogle(restaurantId, …)`, bornée à
`restaurant_id`. **Deux défauts corrigés le 19/08/2026 :**

1. **Le prédicat était construit par concaténation à partir de données
   externes.** `review_id` vient de l'API Google, et le filtre `not.in` était
   écrit à la main avec des guillemets. Un identifiant contenant `"`, `,` ou
   `)` produisait un prédicat différent de celui qu'on croyait écrire — sur un
   DELETE à la clé de service. Le pire cas restait borné au restaurant, mais
   « borné » n'est pas « voulu » : c'était tous ses avis. La liste est
   désormais calculée côté serveur et la suppression vise les clés primaires,
   que nous produisons. Aucune donnée externe n'entre plus dans un prédicat.
2. **L'erreur du DELETE était ignorée** (`await del` sans lire `error`), et
   celle de la mise à jour des métriques aussi. Le sync annonçait `success`
   alors que la réconciliation n'avait pas eu lieu. Les deux échouent
   désormais franchement.

Le garde-fou `if (res.complete)` reste fail-closed : une valeur absente ou
fausse empêche toute suppression.

### `app/actions/admin.ts` — `games`, `prizes`
Clé de service, garde `racine()` = `exigerRole(['root'])`. Les deux
suppressions visent un `id` sans filtre de tenant — ce qui est cohérent avec
une garde `root`, qui traverse légitimement les enseignes.

**`deleteGameAction` et `deletePrizeAction` de ce module n'ont AUCUN
appelant.** La page des jeux importe un homonyme depuis
`@/app/actions/deleteGameAction` — un fichier différent, celui qui est
réellement gardé et testé. Ces deux-là sont du code mort, gardé mais mort.
**Classées : atteignables uniquement par un appelant qui n'existe pas, garde
root correcte, aucune régression de tenant.** À supprimer dans un lot de
nettoyage séparé, pas ici : retirer du code mort et corriger des défauts de
sécurité dans le même commit rend les deux illisibles.

### `app/actions/update-game.ts` — `prizes`
Le `prizes.delete()` a **disparu du code applicatif** : le remplacement des
lots vit dans `enregistrer_jeu_et_lots`, en une transaction. La seule
occurrence restante du motif dans ce fichier est un commentaire qui décrit le
défaut corrigé.

## Aucune suppression de Storage

`grep` de `.remove(` sur l'ensemble du dépôt : aucun appel. Les fichiers
téléversés ne sont supprimés par aucun chemin applicatif.

## Ce qui reste ouvert

- `delete-winner.ts` : lire l'`error` de la lecture de contrôle, pour que le
  refus vienne d'une décision et non d'un effet de bord.
- `admin.ts` : retirer les deux actions mortes, dans un lot de nettoyage.
- Aucun test comportemental sur `delete-winner.ts`, `delete-contact.ts`,
  `deleteGameAction.ts` ni `google-business.ts`. Les trois premiers sont
  correctement gardés à la lecture ; ce n'est pas la même chose que prouvé.
