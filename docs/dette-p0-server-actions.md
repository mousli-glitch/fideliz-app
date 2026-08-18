# Dette laissée par le hotfix P0 Server Actions

Déployé le 18/08/2026 — `main = eb3763c`, production `dpl_7ETGmQFAsQy4gBhasbuncgdAPPwR`.

Ces deux points ont été **trouvés pendant la traversée**, volontairement **exclus**
du hotfix, et ne sont fermés par rien aujourd'hui.

---

## 1. `updateGameAction` n'est pas transactionnelle

**Impact : mutation partielle possible, à l'intérieur du tenant légitime.**

L'action enchaîne trois écritures — `restaurants`, puis `games`, puis la
suppression/réinsertion des `prizes` — sans transaction. Observé en traversée :
un payload invalide a fait échouer l'écriture de `games` **après** que celle de
`restaurants` soit passée. Rien n'a été annulé.

Ce n'est pas une faille d'autorisation : depuis le hotfix, toutes ces écritures
sont bornées au restaurant résolu côté serveur. C'est un défaut de cohérence.
Un restaurateur peut voir sa couleur de marque changer alors que son jeu n'a pas
été enregistré.

Défaut **pré-existant**, antérieur au hotfix.

Piste : une RPC atomique côté Postgres, comme pour les mutations sensibles déjà
en place.

---

## 2. `lib/securite/garde-action.ts` est un module `"use server"`

**Impact : helpers exposés comme Server Actions, sans escalade démontrée.**

Toute fonction exportée d'un fichier `"use server"` devient un point d'entrée
HTTP. Le manifeste du build enregistre donc `exigerRole`, `exigerRestaurant`,
`exigerRestaurantParSlug` et `tracerAction` avec un identifiant de dispatch.

Mesuré en traversée, middleware désactivé :

| Sonde | Résultat |
|---|---|
| `exigerRole(['root'])` depuis un restaurateur | refusé — pas d'escalade |
| `exigerRestaurantParSlug` visant un autre tenant | refusé |
| `exigerRestaurant` visant un autre tenant | refusé |
| `tracerAction` appelée directement, 5 fois | 0 écriture |
| `exigerRole(['restaurant'])` par son titulaire | rend **sa propre** identité |

L'exposition réelle se réduit donc à la divulgation, à l'appelant, de ses
propres `userId`, `email`, `role` et `restaurantId`. Aucune fuite inter-tenant.

Défaut **pré-existant** : le fichier est sur `main` depuis le hotfix P0 slug.

Piste : retirer `"use server"` de ce module. Il n'est jamais appelé depuis le
client — seulement importé par du code serveur. Vérifier qu'aucun composant
client ne l'importe avant de le faire.
