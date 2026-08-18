# Qualification couche 4 — gel de bascule

Mesuré le 18/08-19/08/2026, nuit, sur la branche synthétique déjà active.
Aucune production touchée. Gel installé, mais **INACTIF** à l'état final.

## -1. Séparation gel source Fideliz / gel destination Cartiz

Le candidat initial mélangeait deux finalités dans un seul mécanisme : gel
de la SOURCE Fideliz (le migrateur y LIT seulement) et gel de la
DESTINATION Cartiz (le migrateur DOIT y écrire), avec un laissez-passer par
jeton pensé pour le second cas mais présent dans le fichier qui ne déploie
QUE le premier.

**Décision technique** : ce dépôt (`fideliz-app`) ne gouverne QUE la base
Fideliz — la source. Le migrateur n'a JAMAIS besoin d'écrire dans la
source ; un mécanisme de contournement qu'aucun besoin ne justifie est une
surface privilégiée gratuite, pas une protection. Retiré entièrement :
jeton, colonne `empreinte_jeton`, `current_setting`, toute branche de
passage dans `refuser_pendant_maintenance()`. Le refus est désormais
**inconditionnel** — `actif = true` bloque tout le monde, sans exception,
y compris un jeton falsifié ou copié (prouvé, voir plus bas).

Fichier renommé `20260818160000_gel_source_fideliz.sql` (périmètre
explicite dans le nom). Le gel de la destination Cartiz reste un
**mécanisme séparé, non conçu ici** — aucun nom de table, de fonction ou
d'hypothèse Cartiz n'est introduit dans ce fichier ; il appartiendra au
dépôt Cartiz quand le migrateur existera.

**Prouvé en live sur `fusion-tests-2`** : gel activé, un jeton arbitraire
posé via `set local bascule.jeton = '…'` avant une écriture — l'écriture
échoue quand même (`P0100`, aucune branche de passage n'existe). Cycle
empreinte avant/après/rollback/réapplication rejoué en entier avec le
nouveau fichier (SHA-256
`b283368442da2563963b4547e4eb2f2582fcb84ebdef0aac457ea09efb5ac99d`,
11 141 octets) : correspondance exacte à chaque étape.

Test permanent ajouté (`durcissement.test.ts`) : aucune mention de
« jeton », `empreinte_jeton`, ou `current_setting` n'est tolérée dans ce
fichier — regard vers l'avenir, pas seulement l'état actuel.

## 0. P0 trouvé et corrigé — le fichier versionné n'était pas celui exécuté

Un audit indépendant a signalé un commentaire bloc ouvert ligne 58, jamais
refermé. PostgreSQL imbrique les commentaires bloc (contrairement à C) :
confirmé **indépendamment**, par un scanner caractère par caractère écrit
pour l'occasion (pas en faisant confiance à l'audit) : `profondeur_finale:
1`, ouverture orpheline en ligne 58. Tracé complet : à partir de cette
ligne, tout le reste du fichier (jusqu'à la 286) vivait à l'intérieur d'un
commentaire. Exécuté tel quel via `psql -f` ou `supabase db push`, **rien
après la ligne 57 ne se serait exécuté** — ni les fonctions, ni les
triggers, ni les revokes. Seule la table `maintenance` aurait existé, sans
aucune application réelle du gel.

**Cause exacte** : un `*/` manquant après « …jamais l'empreinte. » (fin de
la section « AUCUNE LECTURE DIRECTE »), avant le prochain `--` de section.
**Corrigé** : `*/` ajouté au bon endroit. Réverifié : `profondeur_finale: 0`,
aucune ouverture orpheline, 10 `/*` pour 10 `*/`.

**Ce que ça change pour la qualification déjà faite (§ Application, ci-
dessous, mesurée avant cette découverte)** : cette qualification avait été
faite en extrayant à la main les instructions SQL du fichier (lecture,
identification des blocs `create table`/`create function`/etc., puis
soumission de ce texte reconstruit) — pas en exécutant le fichier brut. Le
risque exact que l'audit signalait : un extracteur, humain ou automatique,
pouvait avoir appliqué un texte différent du fichier réel.

**Vérifié en le rejouant avec le fichier brut, SHA-256 à l'appui** :

- SHA-256 du fichier corrigé (calculé par `shasum -a 256`, avant tout
  envoi) : `d60c34204bfbc1bad9b162468db12ca8c8e1d57dee17585f5cf041de09ad6ea6`
  (13 563 octets).
- Branche remise à l'état pré-gel (mêmes empreintes qu'avant tout ce
  chantier gel : `colonnes` 214/`8a1ce810…`, `fonctions` 22/`1776bfde…`,
  `triggers` 6/`eed0d031…`, `acl_relations` 78/`e16eae01…` — identiques).
- Fichier **complet et brut** (commentaires compris, aucune extraction)
  soumis en un seul envoi. Exécuté sans erreur.
- Empreintes après : identiques sur 7 des 8 dimensions comparées à la
  qualification manuelle précédente. **`fonctions` diffère**
  (`0f439b46b227bd02b165148f4f119aad` contre l'ancien
  `1b2c9ef55d32af72308cb0b909826718`) — la preuve concrète que le texte
  retapé à la main différait bien, légèrement, des octets réels du corps
  des fonctions. C'est exactement ce que l'audit anticipait. Rien d'autre
  n'a changé (mêmes `acl_fonctions`, `acl_relations`, `colonnes`,
  `contraintes`, `index`, `rls`, `triggers`).
- Rollback (mêmes instructions `drop`) → retour exact aux empreintes
  pré-gel, les 8 dimensions. Réapplication du même fichier brut → empreintes
  identiques à la première exécution brute, `fonctions` compris.
- Écriture normale (insert + delete sur une ligne de test) toujours non
  bloquée, `actif = false` confirmé à l'état final.

**Conclusion : la qualification structurelle et comportementale de la
couche 4 (§ ci-dessous) est reconfirmée avec le fichier réellement
versionné — les seules valeurs à corriger sont les empreintes `fonctions`,
désormais celles ci-dessus, pas celles obtenues par extraction manuelle.**
Aucune autre affirmation du rapport précédent n'est infirmée.

Test permanent ajouté : `supabase/migrations/equilibre-lexical.test.ts` —
scanner récursif réel (imbrication, chaînes simple-quote/double-quote/
dollar-quote neutralisées), appliqué à toutes les migrations, avec un test
de non-régression prouvant qu'une regex non imbriquée aurait laissé passer
ce défaut précis.

## 1-2. Audit du candidat avant exécution

**Relu intégralement** : `supabase/migrations/20260818160000_gel_de_bascule.sql`
(candidat de `candidat/baseline-acl`, 286 lignes).

**Comparé à `candidat/gel-matrice`** (`20260818160000_gel_source_migration.sql`,
120 lignes) : ce sont **deux designs différents**, pas une divergence de
rédaction du même mécanisme.

| | `candidat/gel-matrice` | `candidat/baseline-acl` (retenu) |
|---|---|---|
| Table | `gel_migration` | `maintenance` |
| Triggers | `aaa_gel_<table>` par table (préfixe alphabétique) | `gel_de_bascule` (même nom, 7 tables) |
| Portée | SOURCE seule, lecture pour le migrateur | Bidirectionnel, avec laissez-passer par jeton pour le migrateur |
| Contournement | Aucun — le migrateur n'écrit jamais côté source | Jeton `bascule.jeton` (SET LOCAL), empreinte SHA-256 stockée, jamais le jeton brut |

Le candidat de `gel-matrice` explicite lui-même qu'il ne gère PAS le cas où
le migrateur doit écrire pendant le gel ("cette décision vaut pour la
SOURCE... ne pas transposer"). Le candidat retenu résout précisément ce cas.
**Conservé tel quel** — c'est le design le plus complet, pas un brouillon à
remplacer.

## 3. Couverture des tables gelées — 10 tables, inventaire nominatif complet

**Mise à jour du 19/08/2026 : les deux questions ouvertes ci-dessous sont
tranchées.** `crm_notes` et `sales_restaurants` sont désormais gelées, avec
`winners_archive` ajoutée par prudence. Voir le detail ci-dessous et le
nouveau cycle d'empreinte en fin de section.

**Les 10 tables gelées** : `winners, contacts, prizes, games, restaurants,
profiles, avis, crm_notes, sales_restaurants, winners_archive`.

**Inventaire nominatif des 17 tables de `public`**, chacune classée
explicitement — aucun angle mort implicite accepté :

| Table | Classification | Justification |
|---|---|---|
| `winners` | Gelée | participations, gains, validations, consommations |
| `contacts` | Gelée | inscriptions clients |
| `prizes` | Gelée | stocks des lots |
| `games` | Gelée | configuration des jeux |
| `restaurants` | Gelée | réglages, abonnements, jetons |
| `profiles` | Gelée | comptes et rôles |
| `avis` | Gelée | miroir des avis Google, écrit par le cron |
| `crm_notes` | Gelée (ajoutée) | zéro usage applicatif trouvé (`grep` vide sur `app/`, `lib/`, `components/`), mais présente dans la sauvegarde logique, sans preuve exhaustive d'exclusion du périmètre de migration — le doute joue pour la geler |
| `sales_restaurants` | Gelée (ajoutée) | usage applicatif confirmé (`app/actions/admin-actions.ts`, `app/api/sales/dashboard/route.ts`, `app/actions/delete-sales-user.ts`, `app/api/restaurants/block/route.ts`) : rattachement commercial↔restaurant, participe à l'isolation multi-tenant |
| `winners_archive` | Gelée (ajoutée par prudence) | son seul écrivain, `archive_redeemed_winners()`, insère ici et supprime de `winners` dans **un seul statement à CTE** — déjà protégée transitivement par le gel de `winners`. Gelée directement aussi pour ne pas dépendre indéfiniment de ce couplage implicite si la fonction est un jour réécrite en deux statements distincts |
| `maintenance` | Exclue — état interne du gel | gelée, elle s'auto-verrouillerait (le `update actif = true` du runbook serait lui-même refusé) |
| `system_logs` | Exclue — journal technique volontairement ouvert | doit continuer à écrire pendant la bascule, c'est le moment où on en a le plus besoin |
| `activity_logs_legacy` | Exclue — journal technique volontairement ouvert | même nature que `system_logs`, vérifié : journal non bloquant (`app/actions/update-restaurant-email.ts`) |
| `auth_ghosts_backup_20260606` | Exclue — sauvegarde historique immuable | RLS activée sans policy, aucune migration ne lui ajoute de policy ni ne désactive sa RLS (vérifié par test permanent) — déjà fermée sans ce trigger |
| `auth_orphan_backup_20260606` | Exclue — sauvegarde historique immuable | idem |
| `contacts_backup_20260606` | Exclue — sauvegarde historique immuable | idem |
| `winners_backup_20260606` | Exclue — sauvegarde historique immuable | idem |

17 tables au total, 10 gelées, 7 exclues avec justification individuelle —
aucune table de `public` non classée.

### Cycle d'empreinte complet rejoué avec les 10 tables

Fichier **brut, complet, sans abréviation** (SHA-256
`c13dff1e40d2917194e925fe4dc9dc76dc82f7f9fc76f23724cb8e22bae22236`,
13 330 octets, 263 lignes) soumis en un seul envoi à `fusion-tests-2`.

| Étape | colonnes | fonctions | triggers | rls | acl_relations | acl_fonctions |
|---|---|---|---|---|---|---|
| Après 1re application | 239/`249debac…` | 25/`22e9e0f8…` | 35/`39c574bd…` | 17/`f9c98e60…` | 434/`bc634d5d…` | 88/`7d9cc34d…` |
| Rollback → | 234/`742de13e…` | 22/`e6266426…` | 5/`db9da30c…` | 16/`0cea333d…` | 423/`de253aeb…` | 80/`1f6c087c…` |
| 2e application | 239/`249debac…` ✅ | 25/`22e9e0f8…` ✅ | 35/`39c574bd…` ✅ | 17/`f9c98e60…` ✅ | 434/`bc634d5d…` ✅ | 88/`7d9cc34d…` ✅ |

(contraintes 80/75, index 46/45, policies 41/41, default_privileges 26/26,
vues 4/4 — identiques aux deux applications, écarts uniquement avec le
rollback, comme attendu.)

**Ces chiffres ne sont pas directement comparables à ceux du § « Application,
rollback, réapplication — mesuré » ci-dessus** (214/22/6/78/22...) : la
branche `fusion-tests-2` a grossi entretemps avec les migrations Soukara et
le mapping exécutable, sans rapport avec ce gel. Le nombre de `triggers`
délivré par `information_schema.triggers` compte une ligne par événement —
un trigger `BEFORE INSERT OR UPDATE OR DELETE` sur 10 tables donne 30
lignes, cohérent avec le delta 35→5 mesuré au rollback.

**Correspondance exacte, hashes inclus, sur toutes les dimensions entre la
1re et la 2e application.** État final : `actif = false`, `depuis = null`,
`par = null` — inactif par défaut, confirmé par mesure directe.

**Vérification structurelle des 10 tables** : les 10 triggers portent
tous le nom `gel_de_bascule`, `BEFORE`, `INSERT/UPDATE/DELETE`, même
fonction — vérifié par requête catalogue.

**Écriture normale pendant l'état inactif, testée en direct** sur
`restaurants`, `crm_notes`, `winners_archive` (insert + update + delete,
aucune erreur, aucune trace laissée après le test). `sales_restaurants` non
testée en écriture live — bloquée par une contrainte FK vers `auth.users`
sans rapport avec le gel (branche synthétique sans aucun utilisateur créé) ;
couverte par la vérification structurelle ci-dessus (même trigger, même
fonction que les 9 autres tables, dont 3 testées en écriture réelle).

## 4. Compatibilité avec les migrations réconciliées (couches 1-2-3)

Vérifié par requête directe sur `fusion-tests-2`, couches 1+2+3 déjà
appliquées : aucun trigger `log_profile_active`, `tr_on_commercial_deleted`,
`trg_set_prize_initial_quantity`, `trg_contacts_marketing_optin_at`,
`log_restaurant_block` n'a de nom triant alphabétiquement AVANT
`gel_de_bascule` — tous commencent par une lettre postérieure à `g`. Le gel
se déclenchera donc en premier parmi les triggers `BEFORE` sur ces tables,
sans qu'aucun préfixe `aaa_` n'ait été nécessaire ici. **Fragile mais
correct aujourd'hui** : un futur trigger nommé alphabétiquement avant `g`
(ex. `before_...`, `check_...`) romprait cette garantie sans avertissement —
signalé pour référence future, pas corrigé (hors périmètre de cette
qualification).

Aucun nom de fonction, colonne ou table que le gel référence
(`public.profiles`, `public.restaurants`, etc.) n'a été renommé par les
couches 1-2-3. Confirmé par l'application réussie sans erreur (§5).

## 5. Inactif par défaut

`actif boolean not null default false` — confirmé par mesure directe après
application (§5) : `actif = false`, `depuis = null`, `empreinte_jeton = null`.

## 6. Delta catalogue attendu, écrit avant application

| Dimension | Avant | Delta attendu |
|---|---|---|
| colonnes | 214 | +6 (les 6 colonnes de `maintenance`) |
| contraintes | 38 | +2 (clé primaire + check) |
| index | 45 | +1 (clé primaire) |
| fonctions | 22 | +3 (`en_maintenance`, `maintenance_actif`, `refuser_pendant_maintenance`) |
| acl_fonctions | 22 | +3 |
| rls | 16 | +1 (nouvelle table, RLS activée) |
| triggers | 6 | +7 (`gel_de_bascule` × 7 tables) |
| acl_relations | 78 | +2 (`maintenance` : propriétaire + `service_role`) |
| policies | 41 | inchangé (RLS activée sans policy = refus par défaut) |
| default_privileges | 4 | inchangé (aucun `alter default privileges` dans ce fichier) |
| vues | 4 | inchangé |

## Application, rollback, réapplication — mesuré

| Étape | colonnes | fonctions | triggers | rls | acl_relations | acl_fonctions |
|---|---|---|---|---|---|---|
| Avant | 214/`8a1ce810…` | 22/`1776bfde…` | 6/`eed0d031…` | 16/`80c6b750…` | 78/`e16eae01…` | 22/`d8396b8c…` |
| Après 1re application | 220/`151b0bd2…` | 25/`1b2c9ef5…` | 13/`65dc87f4…` | 17/`7985ee7a…` | 80/`01056a37…` | 25/`08eebb83…` |
| Rollback → | 214/`8a1ce810…` ✅ | 22/`1776bfde…` ✅ | 6/`eed0d031…` ✅ | 16/`80c6b750…` ✅ | 78/`e16eae01…` ✅ | 22/`d8396b8c…` ✅ |
| 2e application | 220/`151b0bd2…` ✅ | 25/`1b2c9ef5…` ✅ | 13/`65dc87f4…` ✅ | 17/`7985ee7a…` ✅ | 80/`01056a37…` ✅ | 25/`08eebb83…` ✅ |

Correspondance exacte à chaque étape sur **toutes** les dimensions mesurées
(contraintes, index, policies, default_privileges également identiques,
omises du tableau par lisibilité). Écritures normales pendant l'état
inactif prouvées : `insert`, `update`, `delete` sur `restaurants`, sans
erreur, avec `actif = false`.

**État final : installé, inactif.**

## 7. Matrice de concurrence à deux sessions — contrainte technique bloquante

**Non réalisable avec les outils disponibles dans cet environnement.**
Constaté, pas contourné par une preuve dégradée :

- `dblink` : installable, mais `dblink_connect` refuse toute connexion
  émise par un rôle non superutilisateur — `select rolsuper from pg_roles
  where rolname = current_user` retourne `false` pour le rôle `postgres` de
  cette branche (les fournisseurs Postgres managés ne donnent
  quasi-jamais le vrai superutilisateur). Erreur `2F003` obtenue même avec
  un mot de passe explicite fourni de deux façons différentes — donc la
  restriction porte sur le rôle appelant, pas sur les identifiants
  transmis.
- `pg_background` : absent de `pg_available_extensions` sur cette instance.
- Aucun client `psql` ni Docker/Postgres local sur cette machine (constaté
  en tout début de séance) — donc pas de deuxième connexion réelle possible
  depuis l'extérieur non plus, sans installer un nouveau logiciel, ce qui
  sort du périmètre synthétique/réversible d'une modification de base.

Une tentative complète a été menée (rôle jetable à mot de passe aléatoire
généré et jamais affiché, table de transit revue et supprimée, extension
installée puis retirée) avant de constater le blocage — voir l'historique
des appels pour la trace complète. Tout nettoyé, branche revenue à l'état
propre (0 rôle résiduel, 0 table de transit, 0 donnée de test).

### Analyse théorique du scénario critique, faute de pouvoir le mesurer

Le point que Samy identifie comme critique : une transaction REPEATABLE
READ dont l'instantané est fixé AVANT l'activation peut-elle encore écrire
APRÈS le point de gel ?

Le mécanisme : `refuser_pendant_maintenance()` appelle
`public.maintenance_actif()`, une fonction `STABLE` qui lit
`public.maintenance` par un `SELECT` ordinaire. Sous REPEATABLE READ, **la
documentation PostgreSQL est explicite** : l'instantané est fixé à la
première requête de la transaction et reste valable pour toute la
transaction, y compris pour les fonctions `STABLE` appelées ensuite. Une
transaction déjà ouverte et ayant déjà fixé son instantané avant qu'une
AUTRE transaction ne valide `actif = true` **ne verrait pas** cette
validation — `maintenance_actif()` continuerait de répondre `false` pour
cette transaction précise, et son écriture sur une table gelée
**passerait**.

Ce n'est pas une supposition : c'est directement ce que la norme SQL
REPEATABLE READ (implémentée par PostgreSQL via MVCC) garantit. Le
mécanisme actuel n'a AUCUN dispositif — verrou, `LOCK TABLE`, verrou
consultatif — qui forcerait une transaction déjà ouverte à voir
l'activation avant de commiter. Rien dans le fichier ne s'y oppose.

**Verdict : `NO-GO concurrence`.** Non pas parce qu'un test l'a démontré —
aucun test n'a pu tourner — mais parce que rien ne réfute un risque que la
sémantique documentée de PostgreSQL rend probable, et la consigne est
explicite : ne pas requalifier un scénario non écarté comme acceptable.

### Piste de correction, non implémentée

Un mécanisme indépendant du snapshot MVCC serait nécessaire — par exemple :
un verrou consultatif (`pg_advisory_lock`) que l'activation acquerrait en
mode exclusif après avoir DRAINÉ les transactions en vol
(`pg_stat_activity`, déjà prévu dans le runbook de bascule du fichier
lui-même, étape 2 : « laisser finir ce qui est en vol »), combiné à un
`LOCK TABLE ... IN SHARE MODE` pris par le trigger AVANT sa lecture de
`maintenance` — un verrou de table, contrairement à une lecture MVCC,
oblige une transaction à ATTENDRE si une autre le détient en mode
incompatible, y compris si son instantané est déjà fixé. Cette piste n'a
pas été implémentée ni vérifiée : elle nécessiterait elle-même d'être
prouvée par la matrice de concurrence, qui reste bloquée par la même
contrainte d'outillage.

**Ce qui lèverait le blocage** : un accès à deux connexions Postgres
réellement indépendantes — Docker + Postgres local, ou un client `psql`
installé sur cette machine, capables de maintenir chacun une transaction
ouverte pendant que l'autre agit. Aucune des deux n'est présente
actuellement ; en installer une sort du périmètre d'une modification de
base de données synthétique et réversible, et n'a pas été fait
unilatéralement.
