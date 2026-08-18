# Qualification couche 4 — gel de bascule

Mesuré le 18/08/2026, nuit, sur la branche synthétique déjà active. Aucune
production touchée. Gel installé, mais **INACTIF** à l'état final.

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

## 3. Couverture des tables gelées

7 tables : `winners, contacts, prizes, games, restaurants, profiles, avis`.
Explicitement exclues par le fichier lui-même : `system_logs` (doit
continuer à journaliser) et `maintenance` (s'auto-verrouillerait).

**Deux questions ouvertes, non tranchées ici** — signalées, pas résolues :

- `crm_notes` (notes commerciales) n'est pas gelée. Si elle fait partie du
  périmètre de migration vers Cartiz, une écriture pendant la fenêtre
  créerait la même incohérence que les 7 tables gelées.
- `sales_restaurants` (rattachement commercial↔restaurant) n'est pas gelée,
  même remarque.

Ni l'une ni l'autre n'est mentionnée dans le commentaire du fichier comme
délibérément exclue (contrairement à `system_logs`/`maintenance`) — ce
pourrait être un oubli ou un choix implicite. **Décision de Samy attendue**
avant la bascule réelle.

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
