# Matrice des Server Actions — Fideliz

État au **18/08/2026**. 30 modules, **52 actions exportées**, dont **24 tiennent
une clé de service**.

Établi par le graphe d'appel réel (`npm run securite:inventaire`), pas par la
lecture des fichiers isolés : une action durcie que personne n'appelle ne
sécurise rien, et une action sans garde appelée depuis une page publique est
une porte ouverte.

## Ce que le middleware fait, et ce qu'il ne fait pas

Une Server Action ne s'invoque pas par son URL : elle s'invoque par son
**identifiant**, posté sur une route dont le bundle la contient. Mesuré sur le
manifeste de build : **4 identifiants sur 32** vivent dans un bundle de page
publique. Les 28 autres n'existent que dans les bundles `/admin` et
`/super-admin`, et le matcher intercepte ces routes — vérifié, `307` sur POST
anonyme.

**Cette protection est réelle, et elle ne suffit pas.** Elle tient à un graphe
d'imports, pas à un contrôle : le jour où un composant partagé importera
`set-subscription`, l'identifiant entrera dans un bundle public sans qu'aucune
erreur ne s'affiche. Et le matcher ne dit **rien du périmètre** — un
restaurateur authentifié est derrière le middleware ; ça ne lui donne pas le
droit d'agir chez son voisin.

Deux garde-fous en découlent :

- `npm run securite:surface` échoue si la surface publique change ;
- chaque action sensible **se garde elle-même**, via `lib/securite/garde-action.ts`.

## Les huit catégories

| # | Catégorie | Garde attendue |
|---|---|---|
| 1 | Publique volontaire | aucune identité — limite par IP, validation des saisies |
| 2 | Client public limité | idem + objet ciblé vérifié |
| 3 | Staff autorisé | session + rôle + appartenance de l'objet |
| 4 | Restaurateur | session + rôle + **son** restaurant |
| 5 | Commercial | session + rôle + son portefeuille |
| 6 | Root uniquement | session + rôle root |
| 7 | Cron / service interne | secret de cron, jamais de session |
| 8 | Inutilisée ou morte | à supprimer ou à garder comme les autres |

## La matrice

Légende du statut : **✅ gardée** · **▫ publique voulue** · **⏳ à traiter** · **☠ morte**

### Catégorie 6 — root uniquement

| Action | Appelants réels | Garde avant | Garde après | Statut |
|---|---|---|---|---|
| `deleteRestaurantFullAction` | `/super-admin/root/restaurants-management` | aucune | `exigerRole(['root'])` + trace | ✅ |
| `deleteSalesUserAction` | `/super-admin/root/sales-management` | cible protégée seulement | `exigerRole(['root'])` + trace | ✅ |
| `setSubscriptionAction` | `/super-admin/root/restaurants-management` | aucune | `exigerRole(['root'])` + trace | ✅ |
| `masterCreateRestaurant` | `/super-admin/root/new-restaurant` | aucune | `exigerRole(['root'])`, `creatorId` pris en session | ✅ |
| `masterCreateSalesAction` | `/super-admin/root/sales-management` | aucune | `exigerRole(['root'])` + trace | ✅ |
| `masterDeleteUser` | `/super-admin/root/sales-management` | cible protégée seulement | `exigerRole(['root'])` + trace | ✅ |
| `repairOrphansAction` | `/super-admin/root` | aucune | `exigerRole(['root'])` + trace | ✅ |
| `updateRestaurantEmailAction` | `/super-admin/root/restaurants-management` | aucune | `exigerRole(['root'])` | ✅ |
| `POST /api/admin/create-user` | **aucun** | aucune → durcie 15/08 | root + liste blanche + périmètre | ✅ ☠ |
| `getRootStats` | `/super-admin/root` | aucune | — lecture d'agrégats | ⏳ |
| `getSalesData` | `/super-admin/root/sales-management` | aucune | — | ⏳ |
| `logSystemError` | `/super-admin/root/sales-management` | aucune | — écriture de journal | ⏳ |

### Catégorie 5 — commercial

| Action | Appelants réels | Garde avant | Garde après | Statut |
|---|---|---|---|---|
| `createRestaurantAction` | `/super-admin/sales/new-restaurant` | aucune | `['sales','root']`, rôle créé figé à `restaurant`, `salesId` pris en session | ✅ |

### Catégorie 4 — restaurateur, sur son restaurant

| Action | Appelants réels | Garde avant | Garde après | Statut |
|---|---|---|---|---|
| `validateWinAction` | scanner, `/verify`, tableau des gagnants | session + rôle + étanchéité | décision partagée + **journal** | ✅ |
| `deleteWinnerAction` | `components/admin/winners-table` | aucune | slug résolu + **chaque ticket remonté à son jeu** | ✅ |
| `deleteContactAction` | `components/admin/customers-table` | RLS de session | slug résolu + filtre `restaurant_id` | ✅ |
| `exportCustomersCsvAction` | `components/admin/csv-export-button` | aucune | slug résolu + `['restaurant','root']` + trace | ✅ |
| `updateRestaurantSettings` | `/admin/[slug]/settings` | aucune | id résolu + `['restaurant','root']` | ✅ |
| `PATCH /api/admin/winners` | `ClientValidateButton` **non monté** | aucune → durcie 15/08 | session + rôle + étanchéité + journal | ✅ ☠ |
| `getWinnerInfoAction` | scanner | session | — vérifier l'étanchéité en lecture | ⏳ |
| `getWinnersPageAction` | `WinnersPaginatedList` | aucune | — | ⏳ |
| `activateGameAction`, `deleteGameAction` | `/admin/[slug]/games` | session | — ajouter l'étanchéité | ⏳ |
| `createGameAction`, `updateGameAction` | `/admin/[slug]/games/*` | aucune | — | ⏳ |
| `admin.ts` (12 actions) | `/super-admin/root/*` | aucune | — | ⏳ |
| `google-business` (8 actions) | `/admin/[slug]/reviews`, `settings`, **2 crons** | aucune | — mixte : rôle + secret de cron | ⏳ |

### Catégories 1 et 2 — le jeu public

**À ne pas garder par une identité.** Le joueur n'a pas de compte et n'en aura
jamais : lui en demander une supprimerait le produit. Ces trois-là se protègent
autrement, et le font déjà.

| Action | Page | Protection en place |
|---|---|---|
| `playGameAction` | `/play/[slug]` | limite par IP réglable par jeu, tirage et décrément dans une RPC atomique |
| `registerWinnerAction` | `/play/[slug]` | limite par IP, validation de l'e-mail et du téléphone |
| `checkReplayStatusAction` | `/play/[slug]` | lecture seule, bornée au jeu |

### Catégorie 7 — cron

`syncGoogleReviews` et les réponses automatiques sont appelées depuis
`/api/cron/*`, **hors du matcher**. Elles doivent dépendre du `CRON_SECRET`, pas
d'une session. ⏳ — à vérifier action par action.

### Catégorie 8 — morte

| Action | Constat |
|---|---|
| `get-customers-page` | aucun appelant |
| `player` (`getPublicGameData`, `registerWinnerAction`) | aucun appelant — doublon de `register-winner` |
| `save-marketing-winner` | aucun appelant |
| `ClientValidateButton` | composant non monté — seul appelant de `PATCH /api/admin/winners` |

Rien n'est supprimé pour l'instant : un retrait de code mort est un chantier à
lui, et il se fait à froid. Mais ces quatre-là ne doivent **pas** compter comme
des preuves de sécurisation.

## Ce qui reste à faire

**14 actions en ⏳**, toutes derrière le matcher, aucune joignable
anonymement aujourd'hui. Elles se répartissent en trois lots : les lectures
d'administration (agrégats et pagination), la gestion des jeux, et les actions
Google partagées avec deux crons — ce dernier lot demande une garde double
(session **ou** secret de cron) et ne se traite pas mécaniquement.

Aucune n'est bloquante pour la bascule tant que la surface publique reste
vérifiée à chaque build. Toutes le deviennent le jour où une page publique
importe l'une d'elles — et c'est précisément ce que `securite:surface`
surveille.
