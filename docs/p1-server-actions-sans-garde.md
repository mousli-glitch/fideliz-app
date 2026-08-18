# P0 — Server Actions en `service_role` sans garde, en production

Trouvé le **18/08/2026** en établissant la matrice demandée, **sur le code de
`main = 41659a8`**, c'est-à-dire ce qui tourne aujourd'hui.

**Production non modifiée, non sondée.** Rien n'a été appliqué.

## Le cas le plus grave : `updateGameAction`

`app/actions/update-game.ts`, ligne 19 :

```ts
export async function updateGameAction(gameId: string, data: any) {
  // client = SUPABASE_SERVICE_ROLE_KEY  → contourne la RLS
  await supabaseAdmin.from("restaurants").update({...}).eq("id", data.restaurant_id)
  await supabaseAdmin.from("games").update({...}).eq("id", gameId)
  await supabaseAdmin.from("prizes").delete().eq("game_id", gameId)
```

Aucune vérification d'appartenance. **Le `gameId` et le `restaurant_id`
viennent tous deux du client.** L'action modifie les réglages du restaurant,
modifie le jeu, et **supprime ses lots**.

Elle est embarquée dans `/admin/[slug]/games/[id]/page.tsx`. Le middleware
laisse tout compte `restaurant` atteindre `/admin/<n'importe quoi>` — il
vérifie le rôle et le blocage de SON restaurant, jamais la correspondance
entre l'URL et son rattachement.

**C'est une écriture inter-tenant.** Plus grave que le P0 du dashboard, qui
n'était qu'une lecture.

## Les six actions vivantes concernées

| Action | Tables | Appelée depuis | Garde en production |
|---|---|---|---|
| `update-game` | restaurants, games, prizes | `/admin/[slug]/games/[id]` | **aucune** |
| `create-game` | restaurants, games, prizes | `/admin/[slug]/games/new` | **aucune** |
| `get-winners-page` | restaurants, winners | `WinnersPaginatedList` | **aucune** |
| `google-business` | restaurants | settings, reviews, 2 crons | **aucune** |
| `get-sales-data` | profiles, restaurants | page commerciale | **aucune** |
| `log-system-error` | system_logs | une page | **aucune** |

`get-customers-page` n'a **aucun appelant** : code mort, non compté.

## Le fait qui compte le plus

**Trois de ces gardes existent déjà — sur `feat/fusion-fideliz`, jamais
déployées.**

| Action | `main` | `feat/fusion-fideliz` |
|---|---|---|
| `get-sales-data` | 0 garde | **2** |
| `update-game` | 0 garde | **2** |
| `create-game` | 0 garde | **2** |
| `google-business` | 0 | 0 |

Le travail du lot A/B/C (`b08a44e`) les a écrites. Il n'est jamais parti en
production — il vit sur la branche de fusion, derrière la baseline, le
durcissement et le gel.

**La correction est donc déjà écrite et déjà éprouvée. Elle attend d'être
isolée**, exactement comme l'a été le P0 du dashboard.

## Ce que je n'ai PAS fait, volontairement

- **Rien intégré à la migration RLS.** C'est un défaut applicatif ; la
  migration est SQL. Les mélanger rendrait les deux inanalysables.
- **Aucun test d'exploitation en production.** L'analyse est statique et
  porte sur le code de `main`. Je n'ai lancé aucune Server Action contre les
  données de vrais restaurants.
- **Aucun correctif écrit dans le candidat**, qui reste strictement SQL.

## Une erreur de méthode que j'ai commise ici

Mon premier passage a rendu « 25 points d'entrée sans garde », dont les trois
pages du P0 — **déjà corrigées et déployées**. Cause : `autoriserRestaurant`
manquait à ma liste de gardes. Même faute de périmètre que pour les triggers,
que pour les ACL, et que pour les quatre routes API signalées à tort.

Et mon détecteur d'appelants rendait « 0 » partout, y compris pour des
fichiers manifestement vivants : je n'avais archivé que `app/` et `lib/`, pas
`components/`.

Aucune de ces deux erreurs n'a de conséquence sur le résultat final — mais
elles auraient pu, dans l'autre sens. **Un détecteur trop étroit crie au
loup ; un détecteur mal alimenté déclare mort ce qui est vivant.**

## Suite proposée, à ton arbitrage

1. Un hotfix applicatif minimal depuis `main`, transportant les gardes déjà
   écrites pour `update-game`, `create-game`, `get-sales-data`, et en écrivant
   une pour `google-business`, `get-winners-page`, `log-system-error`.
2. Prouvé sur `fusion-tests` avec les cinq sessions, comme le P0 du dashboard.
3. `get-customers-page` : à supprimer ou à garder, après confirmation qu'il
   est bien mort.

**Le hotfix RLS n'est pas concerné et reste prêt.** Ce sont deux couches
différentes : la RLS ne protège pas ce qui la contourne.
