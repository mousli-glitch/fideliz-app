# P-6 — Un restaurant peut porter plusieurs comptes gérants

**Tranchée par Samy le 19/08/2026.** Règle produit. **Elle fait tomber P-4.**

---

## La règle

Après fusion, la-ruche et best-pizza auront un compte de chaque côté. Les deux
cohabitent. **Aucun compte n'est supprimé** — c'était l'objet de P-4, qui n'a
plus lieu d'être.

## Aucune migration n'est nécessaire

Relevé en production Cartiz :

```
profiles_pkey            UNIQUE (user_id)
idx_profiles_restaurant  btree (restaurant_id)     ← PAS unique
```

Le schéma autorise déjà plusieurs profils par restaurant. La contrainte n'a
jamais été dans la base : elle est **entièrement dans le code**.

Et côté Fideliz, rien à faire non plus : ses `.single()` portent tous sur le
profil de l'utilisateur courant (`eq('id', user.id)`), jamais sur un
restaurant. Fideliz est compatible P-6 sans y avoir pensé.

## Trois sites Cartiz lisent le gérant. Deux se cassent.

| Site | Ce qu'il fait | Avec deux comptes |
|---|---|---|
| `lib/queries/admin.ts:134` | `.maybeSingle()`, **erreur jetée** | ⚠️ **casse en silence** |
| `lib/actions/admin.ts:186` — `reinitialiserMotDePasse` | `.maybeSingle()` puis `throw` | casse **bruyamment** |
| `lib/actions/admin.ts:286` — `deleteRestaurant` | liste, et itère | ✅ **déjà correct** |

### Le premier est le plus mauvais, et voici pourquoi

```ts
const { data: profile } = await supabase
  .from("profiles").select("user_id")
  .eq("restaurant_id", id).eq("role", "restaurateur")
  .maybeSingle();
```

PostgREST rend une **erreur** (`PGRST116`) dès qu'il y a plus d'une ligne. Ici
l'erreur n'est pas lue — seul `data` est destructuré — donc `profile` vaut
`null`. La console annonce alors **« pas de compte restaurateur »** sur un
restaurant qui en a deux, et propose d'en créer un troisième.

Ce n'est pas un affichage tronqué. C'est un mensonge, sur les deux seuls vrais
clients communs.

### Une ironie qui mérite d'être notée

Le chemin **le plus destructeur** — la suppression d'un restaurant — est le seul
qui gère déjà plusieurs comptes : il liste, puis nettoie chacun. Les deux
chemins d'affichage, eux, supposent l'unicité.

Celui qui a écrit la suppression s'est méfié. Les autres non.

## Le plan

1. **`lib/queries/admin.ts`** — rendre une **liste** de gérants (`restaurateurs:
   { user_id, email }[]`) au lieu d'un `restaurateur_id` unique. Et lire
   l'erreur, toujours.
2. **`RestaurantAdmin.tsx`** — afficher la liste au lieu d'un bloc unique.
   `hasRestaurateur` devient un compte. Le formulaire d'invitation ne change
   pas : il en ajoute un de plus.
3. **`reinitialiserMotDePasse(restaurantId)`** devient
   **`reinitialiserMotDePasse(userId)`**. C'est un changement de signature
   assumé : réinitialiser « le » mot de passe d'un restaurant n'a plus de sens
   quand il y a deux comptes. L'écran doit désigner lequel.
4. **Rien côté Fideliz.**

## Ce que ça touche ailleurs

- **P-4 tombe.** Aucun compte à supprimer chez best-pizza.
- **P-5** (mot de passe provisoire à la première connexion) devient
  **par compte**, pas par restaurant. Le drapeau `doit_changer_mdp` vit déjà
  sur l'utilisateur, donc rien ne s'y oppose.

## Ce qui n'est pas mesuré

- Les **policies RLS** de Cartiz supposent-elles un gérant unique ? Les cinq
  prédicats `role = 'restaurateur'` relevés au titre de P-1 n'ont pas été lus
  sous cet angle. À faire avant d'écrire le code.
- Aucun test ne couvre aujourd'hui le cas « deux gérants ». Il devra en exister
  un avant la bascule, sinon la règle ne sera vraie que dans ce document.

## État

**Rien n'est exécuté.**
