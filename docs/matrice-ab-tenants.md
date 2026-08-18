# Matrice A/B — les droits DML des vues, mesurés

Établi le **18/08/2026** sur la branche `bngtokpnuebvvxbtnayn`, état historique
reconstruit (baseline + 8 migrations), deux tenants synthétiques, aucune
donnée réelle.

Rejouable : `supabase/verifications/ab-tenants-seed.sql` puis
`ab-tenants-matrice.sql`.

## La question qui était ouverte

Les quatre vues publiques accordent `SELECT, INSERT, UPDATE, DELETE` à `anon`
et à `authenticated`. J'avais refusé de classer ce constat tant qu'il n'était
pas mesuré : un droit accordé n'est pas un droit exploitable, et l'inverse est
tout aussi faux. Voici la mesure.

## Verdict

**Aucune écriture anonyme n'a abouti. Aucune mutation de A sur les données de
B n'a abouti.** Les compteurs avant/après le confirment ligne par ligne — pas
les codes retour, qui mentent dans les deux sens.

Les droits DML sur les vues sont **inertes** : les quatre portent
`security_invoker`, donc PostgreSQL vérifie les privilèges de l'appelant sur
la table sous-jacente. Sans droit sur la table, le droit sur la vue ne sert à
rien. **Défaut d'hygiène, pas vulnérabilité.**

Deux constats de fond en sont sortis, l'un rassurant, l'autre non.

## Ce qui protège, et ce qui ne protège pas

| Cible | `anon` | Tenant A vers B |
|---|---|---|
| `public_winners_safe` | **42501** `permission denied for table winners` | **42501** — même en lecture |
| `public_restaurants` | 42501 sur `restaurants` | UPDATE/DELETE → `OK:0` |
| `view_integrity_check` | 42501 sur `restaurants` | — |
| `v_my_access_status` | **55000** vue non modifiable | 55000 |
| `profiles` (table) | UPDATE `OK:0` · INSERT **RLS** | UPDATE/DELETE → `OK:0` |
| `games`, `prizes` (tables) | — | UPDATE → `OK:0` |

`public_winners_safe` est **refusée à tout le monde**, y compris aux comptes
authentifiés : personne n'a le moindre droit sur `winners`. La vue est morte,
et ses droits DML ne valent rien. Cohérent avec ses zéro appel dans le code.

Trois nuances qui comptent plus que le verdict :

**`anon` possède réellement INSERT et UPDATE sur `profiles`.** Le GRANT est
là. Ce qui bloque, c'est la RLS seule — `new row violates row-level security
policy`, et `OK:0` en UPDATE. Les sept policies de `profiles` sont **toutes en
SELECT** : aucune policy d'écriture n'existe, donc RLS refuse par défaut. La
protection est réelle mais tient à un seul fil. Une policy d'écriture ajoutée
sans clause restrictive ouvrirait la table aux anonymes le jour même.

**Un `REFUS:23xxx` n'est pas une protection.** Les codes 23502/23503/23514
signifient que le GRANT et la RLS ont laissé passer, et que seule l'intégrité
des données a arrêté l'écriture. La matrice les distingue explicitement des
42501.

**Aucune élévation de privilège.** A ne peut pas se passer `root` :
`UPDATE profiles SET role='root' WHERE id = moi` rend `OK:0`. Ni en créant un
profil `root` : refusé par la RLS.

## Le trou confirmé : injection dans `restaurants`

| Chemin | Résultat | Compteur |
|---|---|---|
| `INSERT INTO public_restaurants` | `OK:1` | 2 → 3 |
| `INSERT INTO view_integrity_check` | `OK:1` | 3 → 4 |
| `INSERT INTO restaurants` | `OK:1` | 4 → 5 |

**N'importe quel compte authentifié crée des restaurants.** La policy en cause
est `"Sales can create restaurants"`, `with check (true)`, portée par le rôle
`authenticated` — donc pas seulement les commerciaux. Le compte de test est un
simple `restaurant`, et il y arrive.

Portée réelle, mesurée et non supposée :

- les lignes créées naissent **orphelines** (`owner_id` et `created_by` à
  `NULL`) ;
- **B ne les voit pas** (`OK:0`) — la RLS de lecture tient ;
- A n'obtient aucun droit nouveau : il ne peut pas s'y rattacher, puisqu'il ne
  peut pas modifier son propre profil.

Ce n'est donc **pas** une mutation inter-tenant au sens de la consigne : A
n'agit pas sur les données de B. C'est une injection de lignes dans une table
partagée — abus et pollution, pas fuite. `view_integrity_check`, qui existe
précisément pour lister les restaurants orphelins, les afficherait.

## La fuite inter-tenant, mesurée

A lit **les deux profils**, le sien et celui de B — courriel, rôle,
`restaurant_id`. Trois policies `using (true)` pour `authenticated` la
produisent, et non une seule comme je l'avais écrit :

- `temp_open_profiles`
- `final_profile_access_v3`
- `global_nav_profiles`

Les policies permissives se combinent par OU : la plus large gagne, et en
supprimer une ou deux ne change rien. Les trois doivent tomber ensemble.
Classification inchangée — **NO-GO pour la production fusionnée**, correction
sur la branche avec la matrice RLS complète.

## Ce que la mesure a trouvé par accident

**`on_auth_user_created` manquait à la baseline.** La production porte ce
trigger sur `auth.users` ; la branche ne l'avait pas. Une base reconstruite
sans lui paraît saine et **ne crée aucun profil au premier compte** — donc ni
rôle, ni restaurant, ni accès, pour personne.

Il ne restait invisible que par ma faute : mon empreinte des triggers ne
regardait que le schéma `public`. Les cinq y concordaient, et j'en ai conclu
« triggers identiques ». L'erreur portait sur le périmètre de la mesure, pas
sur son résultat. Corrigé dans la baseline ; l'empreinte doit désormais couvrir
tous les schémas du projet.

C'est le seul trigger du projet hors `public` — les autres (`cron`,
`realtime`, `storage`) appartiennent à la plateforme.

**Le durcissement du rôle tient sur l'état reconstruit.** Le compte A a été
créé avec `raw_user_meta_data = {"role":"root"}`. Le trigger lui a posé
`restaurant`. Preuve vivante de la migration `20260817230642`.

## Suite

Le chantier continue : la consigne d'arrêt visait l'écriture anonyme et la
mutation inter-tenant, et aucune des deux ne s'est produite.

- Les droits DML des vues passent de « non classé » à **défaut d'hygiène**,
  à corriger dans la migration de durcissement, sans urgence de production.
- L'injection dans `restaurants` rejoint le lot RLS, avec les trois policies
  de `profiles`.
- L'empreinte des triggers est à élargir à tous les schémas avant le
  checkpoint sémantique.
