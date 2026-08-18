# P0 — le dashboard d'un restaurant s'ouvre par son slug

Trouvé le **18/08/2026** pendant la traversée applicative, sur la branche
`fusion-tests`. **Production non touchée, non sondée.**

## Le fait

Tout compte connecté ouvre `/admin/<slug-de-n-importe-qui>` et voit le
tableau de bord de ce restaurant.

Mesuré avec trois sessions réelles distinctes sur la page du tenant B :

| Session | Empreinte SHA de la page |
|---|---|
| restaurateur A | `79b0386a9316` |
| root | `79b0386a9316` |
| compte **sans aucun rattachement** | `79b0386a9316` |

**Octet pour octet identiques.** Un compte qui ne possède rien voit ce que
voit l'administrateur.

Sans session : page de connexion, empreinte différente. Le garde
d'authentification fonctionne ; c'est le garde d'**autorisation** qui manque.

## Ce qui fuit

| Route | Contenu exposé |
|---|---|
| `/admin/[slug]` | nom du restaurant, jeux, nombre de gagnants, de retraits, de contacts, panier moyen, échéance d'abonnement |
| `/admin/[slug]/customers` | **les contacts clients** — adresse relevée : `client-b@exemple.invalid` |
| `/admin/[slug]/winners` | même schéma d'accès |

En production, `contacts` porte **470 lignes réelles** et `winners` **468**.

Les slugs ne sont pas des secrets : ils sont **imprimés sur les QR codes** en
service chez les restaurants.

## La cause

Les trois pages lisent avec `SUPABASE_SERVICE_ROLE_KEY`, qui contourne la RLS
par construction, puis résolvent le restaurant **par le slug de l'URL** :

```ts
const supabase = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: restaurant } = await supabase
  .from("restaurants").select("…").eq("slug", slug).single()
```

Aucune de ces pages ne vérifie que l'utilisateur connecté possède ce
restaurant. Relevé sur les trois : `garde_appartenance = 0`.

Le middleware (`proxy.ts`) vérifie bien plusieurs choses — session présente,
compte actif, restaurant non bloqué, `role` pour `/super-admin/*`, renvoi des
commerciaux hors de `/admin`. Mais **il ne compare jamais le `slug` de l'URL
au `restaurant_id` du profil.**

## Pourquoi aucune de mes mesures précédentes ne l'a vu

C'est le point qui compte pour la méthode.

La matrice RLS des 16 tables est **verte** : le restaurateur A ne lit aucune
ligne de B, ni en SQL, ni par PostgREST avec son vrai JWT. Elle est verte et
elle a raison — **la page ne passe pas par la RLS.** Elle passe par la clé de
service, qui la contourne délibérément.

Une matrice RLS ne peut pas voir une fuite dans une couche qui court-circuite
la RLS. Il fallait ouvrir la page.

Le contrôle par empreinte SHA de trois sessions différentes est ce qui l'a
rendu indiscutable : trois identités, une seule page.

## Ce que ça change pour le hotfix RLS

**Rien sur sa justesse** : il ferme des trous réels, ses preuves tiennent, et
il ne cause ni n'aggrave celui-ci.

**Tout sur son opportunité.** Appliqué seul, il ferait dire « l'isolation
inter-tenant est traitée » alors que la porte la plus large resterait
ouverte — et c'est celle qui expose des contacts clients réels.

Je n'ai pas élargi le périmètre de moi-même : la consigne était de ne rien
mélanger au lot RLS/identité. Ce correctif-ci demande un arbitrage.

## Correction proposée, à arbitrer

Une garde serveur unique, appliquée aux trois pages et au middleware :

- `root` : accès à tout slug ;
- `sales` : uniquement les slugs de `sales_restaurants` pour son compte ;
- `restaurant` : uniquement le slug de son propre `restaurant_id` ;
- sans rattachement : refus ;
- tout autre cas : refus.

`lib/securite/garde-action.ts` porte déjà `exigerRestaurantParSlug(...)` : la
brique existe, elle n'est simplement pas appelée par ces pages.

À vérifier avant d'écrire : les autres routes `/admin/[slug]/*` qui ne
lisaient rien de sensible dans ce test peuvent le faire par des composants
clients, et `/super-admin/*` mérite le même examen.

---

# `/scan/[slug]` — publique par conception, et pourquoi elle le reste

L'audit l'avait signalée : elle lit avec la clé de service, hors du matcher du
middleware. Elle n'est **pas** ajoutée au hotfix, et voici l'analyse plutôt
qu'une exception implicite.

**Elle est publique par conception.** C'est le point d'entrée du QR code
imprimé sur la table. Le client qui scanne n'a aucun compte. Lui demander de
s'authentifier viderait le produit de son sens.

**Ce qu'elle expose** : le nom de l'établissement, et l'information « le jeu
est indisponible » quand le restaurant est bloqué ou l'abonnement échu. Le nom
est sur la devanche ; le slug est sur le QR. `subscription_end` est lu mais
**jamais affiché** — il ne sert qu'à décider entre la page « indisponible » et
la redirection.

**Elle ne valide rien.** Aucune action de validation de ticket n'y existe —
vérifié, zéro occurrence de `validate-win`, `register_win` ou `redeem` sous
`app/scan/`. Son seul effet est une redirection vers `/play/<id-du-jeu-actif>`.
La validation d'un ticket se fait ailleurs, par `app/actions/validate-win.ts`,
qui porte sa propre garde d'identité.

**Aucune donnée inter-tenant.** Elle ne lit qu'un restaurant, celui du slug
demandé, et ses jeux. Un slug falsifié rend la page « restaurant introuvable »
— même surface qu'un slug inexistant. Il n'existe aucun paramètre permettant
d'atteindre un autre établissement que celui nommé dans l'URL.

**La différence avec le P0** : la page `/admin/[slug]` servait des données
d'administration — contacts clients, statistiques, abonnement — à un compte
CONNECTÉ qui n'y avait pas droit. `/scan/[slug]` sert une information publique
à un visiteur anonyme, ce qu'elle est faite pour faire.

Elle figure dans la liste `PUBLIQUES` du test permanent, nommément et non par
un motif : une exemption qui s'élargit toute seule finit par couvrir la page
qu'on voulait protéger.
