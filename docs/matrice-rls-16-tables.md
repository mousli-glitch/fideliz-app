# Matrice RLS — 16 tables, 7 rôles, 4 opérations

Mesurée le **18/08/2026** sur la branche `bngtokpnuebvvxbtnayn`, après les
migrations `20260818010000` (durcissement) et `20260818011000` (RLS).
Rejouable : `supabase/verifications/matrice-rls-complete.sql`.

**Aucune donnée modifiée** : chaque sonde exécute l'opération, relève
`row_count`, puis annule le sous-bloc. Compteurs identiques avant et après —
2 contacts, 2 avis, 2 notes, 1 rattachement, 2 traces, 2 tickets, 2 archives,
2 restaurants, 5 profils, 0 ligne intruse.

## Lecture

`SELECT/INSERT/UPDATE/DELETE`. `DENY` = 42501 (GRANT **ou** RLS).
`E23502` = NOT NULL — **le GRANT et la RLS ont laissé passer**, seule
l'intégrité a arrêté l'écriture. Un chiffre = lignes touchées puis annulées.

| Table | anon | sans rattach. | A | B | commercial | root | service_role |
|---|---|---|---|---|---|---|---|
| activity_logs_legacy | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/E23502/0/0 | 0/E23502/0/0 |
| auth_ghosts_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 |
| auth_orphan_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 |
| avis | 0/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | **0**/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | 2/E23502/2/2 |
| contacts | 0/DENY/0/0 | 0/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | **0**/DENY/0/0 | 2/E23502/2/2 | 2/E23502/2/2 |
| contacts_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 |
| crm_notes | 0/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | **0**/DENY/0/0 | **2/E23502/2/2** ⚠ | 2/E23502/2/2 | 2/E23502/2/2 |
| games | 0/DENY/DENY/DENY | 0/DENY/0/0 | **1**/DENY/1/0 | **1**/DENY/1/0 | 1/DENY/0/0 | 2/E23502/2/2 | 2/E23502/2/2 |
| prizes | 0/DENY/DENY/DENY | 0/DENY/0/0 | **1**/DENY/1/1 | **1**/DENY/1/1 | 1/DENY/0/0 | 2/DENY/0/0 | 2/E23502/2/2 |
| profiles | 0/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | 5/DENY/0/0 | 5/E23502/5/5 |
| restaurants | 0/DENY/DENY/DENY | 0/DENY/0/0 | **1/DENY**/1/1 | **1/DENY**/1/1 | 1/DENY/0/0 | 2/E23502/0/0 | 2/E23502/2/2 |
| sales_restaurants | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | **1**/DENY/0/0 | 1/E23502/1/1 | 1/E23502/1/1 |
| system_logs | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 2/E23502/2/2 |
| winners | DENY×4 | DENY×4 | DENY×4 | DENY×4 | DENY×4 | DENY×4 | 2/E23502/2/2 |
| winners_archive | 0/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | **0**/DENY/0/0 | 0/DENY/0/0 | 2/E23502/2/2 | 2/E23502/2/2 |
| winners_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 | 0/1/0/0 |

## Ce que la migration corrective a fermé

- **`profiles`** — chacun ne voit que le sien ; root voit les cinq. Avant, les
  six comptes connectés voyaient les cinq. Aucune écriture possible pour
  personne : la RLS refuse, faute de policy d'écriture.
- **`restaurants`** — **INSERT `DENY` pour A, B, le commercial et le compte
  sans rattachement.** Avant, tous créaient. A et B modifient et suppriment
  toujours **leur** restaurant : le dashboard est intact.
- **`winners`** — refusée à tous, root compris. Conforme à la production.
- **Les quatre tables de sauvegarde** — refusées à tous sauf `service_role`.
  Elles portent des données personnelles réelles en production.

## Isolation A/B — vérifiée là où elle est mesurable

`contacts`, `games`, `prizes`, `profiles`, `restaurants` : A voit 1, B voit 1,
jamais celui de l'autre. `crm_notes`, `winners_archive`, `avis`,
`sales_restaurants`, `system_logs` : A et B voient **0**.

Le commercial ne voit **aucun contact** — la règle métier « commercial sans
données clients » est respectée. Il voit son unique rattachement dans
`sales_restaurants`, et le restaurant et le jeu du tenant A auquel il est
rattaché.

## Trois constats qui ne sont PAS des régressions, et qu'il faut dire

**⚠ `crm_notes` — accès transversal du commercial.** Il lit, modifie et
supprimerait les **2** notes, y compris celle du tenant B auquel il n'est pas
rattaché. La policy `sales_manage_notes` porte `using (is_sales() or
is_root())`, sans aucun filtre de rattachement.

C'est un défaut réel, **antérieur** et **hors du périmètre de ce hotfix**, qui
vise `profiles` et `restaurants`. Il est consigné ici pour être traité
séparément, conformément à la consigne de ne rien mélanger.

**`avis` invisible au restaurateur.** Personne ne lit `avis` par la RLS, pas
même root — seul `service_role` y accède. Ce n'est pas une fuite mais une
fermeture : le dashboard doit lire les avis côté serveur. État antérieur,
inchangé par ce hotfix.

**root ne modifie pas `restaurants` dans la matrice.** `0` en UPDATE/DELETE.
La cause est le fixture, pas le code : les policies `Super Admin Restaurants
*` reposent sur un UUID codé en dur (`04eb7091…`) qui est le root réel de
production. Notre root synthétique ne l'est pas et ne possède aucun
restaurant. **En production, ce chemin fonctionne.** Il n'est donc pas prouvé
par cette matrice, et c'est une raison de plus d'exiger la traversée
applicative avant tout GO.

## Limite de la sonde, à connaître avant de la relire

L'INSERT est tenté par `default values`. Sur une table dont la policy exige un
rattachement, la ligne vide ne satisfait pas le `with check` et rend `DENY` :
on ne distingue pas « pas le droit » de « la ligne ne convenait pas ». Pour la
question qui nous occupe — personne ne doit créer de restaurant — les deux
mènent au même refus, mais ce `DENY` ne prouve pas une absence de privilège.

## Le piège du premier passage

Au premier tour, **sept tables étaient vides** : `contacts`, `avis`,
`crm_notes`, `sales_restaurants`, `system_logs`, `winners`,
`winners_archive`. Tous les rôles y rendaient `0`, et ce `0` ne prouvait que
la vacuité de la table. Une matrice sur des tables vides dit oui à tout.

Le semis d'une ligne par tenant a été ajouté, et c'est lui qui a fait
apparaître l'accès transversal du commercial sur `crm_notes`. Sans lui, la
matrice serait passée au vert en ne prouvant rien.

---

# Deuxième passe — 18/08, après retrait de l'UUID et correction de `crm_notes`

## Ce qui a changé

| Cible | Rôle | Avant | Après |
|---|---|---|---|
| `crm_notes` | commercial | `2/E23502/2/2` | **`1/DENY/1/1`** |
| `restaurants` | root synthétique | `2/E23502/0/0` | **`2/E23502/2/2`** |

Le commercial ne voit plus que la note du tenant **A**, auquel il est
rattaché. Celle de B est invisible et immuable. A et B n'y accèdent pas.

Le root **synthétique** administre les deux restaurants — sans le moindre
UUID réel. Le parcours administratif est enfin prouvable ailleurs qu'en
production. Aucune régression sur les autres tables.

## L'UUID codé en dur

Vérifié en lecture seule sur la production avant de le retirer : ce compte
est le **seul** à porter `role = 'root'`, il est actif, et il ne possède
**aucun** restaurant. Ce dernier point est décisif — `owner_id = auth.uid()`
ne joue jamais pour lui, donc la branche UUID était son unique accès. La
retirer sans remplacement l'aurait enfermé dehors.

`public.current_role() = 'root'` est strictement équivalent aujourd'hui, et
correct demain.

**Deux policies le portent encore** : `games/ADMIN_GAMES_FULL_ACCESS` et
`system_logs/Root Full Access`. Elles sont hors du lot de production défini,
et volontairement non touchées. Inscrites en dette.

Les autres UUID trouvés dans le dépôt sont des **noms de fichiers d'images**
de fond de jeu — sans objet.

## API directe — l'interface n'est pas le garde

Sondes PostgREST anonymes contre la branche, jamais contre la production.

| Appel | Code | Verdict |
|---|---|---|
| `GET` sur 10 tables | `200 []` | RLS filtre tout |
| `GET winners` | `401` `42501` | aucun grant |
| `GET` les 4 sauvegardes | `200 []` | RLS sans policy |
| `POST restaurants` | `401` | fermé |
| `POST profiles` / `crm_notes` | `401` RLS | fermé |
| `PATCH restaurants` · `DELETE` | `401` | fermé |
| `PATCH profiles` | **`204`** ⚠ | **voir plus bas** |
| `rpc auditer_privileges_publics` | `401` | fermée |
| `rpc play_game`, `register_win`, `_log_event` | `404` | non exposées |
| `rpc archive_redeemed_winners`, `anonymize_expired_data`, `get_sales_stats` | `401` | fermées |
| `rpc current_role` / `is_root` | `200` `"anon"` / `false` | sans effet |

### ⚠ Le `204` qui ne prouve rien

`PATCH profiles` a répondu **204 No Content** — un code de succès. Rien n'a
été modifié : le rôle de B est resté `restaurant`, les cinq profils intacts.

PostgREST rend `204` pour un UPDATE qui touche **zéro ligne**, et la RLS les
avait toutes filtrées. Une sonde de sécurité qui ne lirait que le code HTTP
conclurait à une écriture réussie — ou, dans l'autre sens, ne distinguerait
pas une vraie brèche d'un refus. **Seul le compteur tranche.**

## Les quatre tables `_backup_20260606`

| | |
|---|---|
| Contenu | `auth_ghosts` 16 · `auth_orphan` 1 · `contacts` 52 · `winners` 64 |
| Données réelles en production | **oui — 133 lignes de données personnelles** |
| RLS | **activée** sur les quatre, `force` non |
| Policies | **aucune** → refus pour tout rôle non privilégié |
| Grants `anon` / `authenticated` | `SELECT, INSERT, UPDATE, DELETE` — présents |
| Visibilité mesurée | `anon`, restaurateur, commercial, root : **rien** |
| Dépendances SQL ou applicatives | **aucune** — zéro occurrence dans le code |
| Raison de conservation | filet d'un nettoyage du 06/06/2026 |

**Aucune fuite historique.** Mais la protection tient à la RLS seule, les
droits DML étant bien accordés — même configuration que `profiles`. Une
policy ajoutée sans clause restrictive ouvrirait 133 lignes de données
personnelles.

**Non supprimées** : leur suppression appartient à l'assainissement final,
après sauvegarde et preuve d'inutilité.

## Registre de dette ouvert par cette passe

1. `games/ADMIN_GAMES_FULL_ACCESS` et `system_logs/Root Full Access` portent
   encore l'UUID root.
2. Les quatre tables de sauvegarde : 133 lignes personnelles, protégées par
   la RLS seule.
3. `v2_owner_all_contacts` sur `contacts` teste un `restaurant_id` codé en
   dur qui **n'existe plus** — prédicat mort.
4. `mon_projet_sain.txt`, suivi par git : vidage de 15 000 lignes de code
   source. **Aucune valeur de secret** (vérifié : ni JWT, ni clé `sk-`,
   uniquement des `process.env.X`), mais une copie périmée du code qui
   contient l'ancien `ROOT_ID`.
5. `avis` n'est lisible par personne via la RLS, root compris.

---

# Troisième passe — traversée Auth réelle, 18/08

## Une erreur de méthode que la traversée a révélée

Les cinq comptes avaient été insérés **directement en SQL** dans `auth.users`.
Conséquence découverte en tentant la première connexion : GoTrue répondait
`500 — Database error querying schema` sur **toute** lecture de comptes.

Cause : `confirmation_token`, `recovery_token`, `email_change_token_new` et
`email_change` étaient à `NULL`. GoTrue les lit comme des chaînes et échoue.
L'API `/auth/v1/settings` répondait `200`, ce qui donnait l'illusion qu'Auth
fonctionnait.

Les comptes ont été supprimés et **recréés par l'API d'administration
officielle** — jamais un hash écrit à la main. GoTrue les liste depuis
(`200`, 5 comptes).

**Une base peut paraître saine et avoir un Auth cassé.** Aucune sonde SQL ne
l'aurait vu : il fallait tenter une connexion.

## Ce que la vraie création a prouvé

Le compte A a été créé avec `user_metadata = {"role":"root"}`. Le trigger
`on_auth_user_created` lui a posé **`restaurant`**, comme aux quatre autres.

Le durcissement du 17/08 tient donc **sur le parcours réel**, et pas seulement
sur une insertion SQL. C'est la preuve qui manquait.

## Cinq sessions réelles

`signInWithPassword`, mots de passe aléatoires et distincts, jamais affichés,
effacés après usage.

| Compte | Session | `auth.uid()` | `current_role()` |
|---|---|---|---|
| A | OK | `aaaa1111…` | `restaurant` |
| B | OK | `bbbb2222…` | `restaurant` |
| commercial | OK | `cccc3333…` | `sales` |
| root | OK | `dddd4444…` | `root` |
| sans rattachement | OK | `eeee5555…` | `restaurant` |

## API directe, avec ces sessions

| Rôle | profils | restos | jeux | contacts | crm |
|---|---|---|---|---|---|
| A | 1 | 1 | 1 | 1 | 0 |
| B | 1 | 1 | 1 | 1 | 0 |
| commercial | 1 | 1 | 1 | **0** | 2 |
| root | 5 | 2 | 2 | 2 | 4 |
| sans rattachement | 1 | **0** | **0** | **0** | **0** |

### A contre B, par URL directe

| Tentative | HTTP | État réel après |
|---|---|---|
| lire le resto de B | — | **0 ligne** |
| lire le profil de B | — | **0 ligne** |
| lire les contacts de B | — | **0 ligne** |
| modifier le resto de B | `204` | nom toujours « Tenant B » |
| supprimer le resto de B | `204` | **existe toujours** |
| créer un restaurant | **`403`** | 0 intrus |
| se promouvoir `root` | `204` | rôle toujours `restaurant` |

### Le commercial contre le tenant B

| Tentative | HTTP | État réel après |
|---|---|---|
| lire les notes de B | — | **0 ligne** |
| lire les notes de A | — | 2 lignes ✓ |
| modifier une note de B | `204` | **0 note piratée** |

### Le compte sans rattachement

Création de restaurant : **`403`**.

## Le piège des `204`, confirmé une seconde fois

Cinq tentatives ont reçu un code de **succès**. Aucune n'a rien modifié :
PostgREST rend `204 No Content` pour une opération à zéro ligne, et la RLS
les avait toutes filtrées.

Compteurs après les cinq `204` : 2 restaurants, 4 notes, 0 intrus, rôle de A
inchangé, resto de B intact.

**Un contrôle qui lirait le code HTTP conclurait à cinq écritures réussies.**
C'est la raison pour laquelle chaque sonde de ce dossier relève un compteur.
