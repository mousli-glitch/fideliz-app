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

## 0bis. P0 #2 trouvé et corrigé — `service_role` pouvait lever le gel lui-même

Signalé le 19/08/2026, **vérifié indépendamment avant toute correction**
(`has_table_privilege`/`has_function_privilege` sur `fusion-tests-2`,
confirmé réel — pas seulement accepté sur la foi du signalement) :

- `revoke all on public.maintenance from anon, authenticated;` — le premier
  jet ne visait QUE ces deux rôles.
- `service_role` gardait donc, par les DEFAULT PRIVILEGES, SELECT/INSERT/
  UPDATE/DELETE **directs** sur `maintenance`, et EXECUTE sur
  `maintenance_actif()` et `refuser_pendant_maintenance()`.
- Conséquence : un appel authentifié avec la clé de service (PostgREST ou
  SDK applicatif) pouvait remettre `actif = false`, ou supprimer l'unique
  ligne — auquel cas `maintenance_actif()` retombe sur son
  `coalesce(..., false)` et redevient inerte — puis écrire librement sur
  les dix tables gelées. Un contournement réel du gel, par le chemin même
  que le trigger est censé fermer, et qui n'exigeait aucun accès privilégié
  hors de la clé de service déjà utilisée par l'application au quotidien.

**Corrigé** : `revoke all ... from public, anon, authenticated, service_role`
sur la table ET sur les deux fonctions internes. Le runbook (commentaires
« L'ORDRE DES OPÉRATIONS ») précise désormais explicitement que
l'activation/la levée se font en SQL direct sous le rôle propriétaire
(connexion admin), **jamais** avec la clé de service — qui n'a plus aucun
droit pour le faire de toute façon.

**Revérifié après correction**, sur `fusion-tests-2` :

- Catalogue : `has_table_privilege`/`has_function_privilege` pour
  `service_role`/`authenticated`/`anon`/`public` sur la table et les 3
  fonctions — 0 écart. Seule `en_maintenance()` reste exécutable par les
  rôles applicatifs.
- **Test vivant, `SET ROLE service_role`** : SELECT, INSERT, UPDATE,
  DELETE sur `maintenance` tous refusés (`insufficient_privilege`) ;
  `en_maintenance()` fonctionne toujours. Gel ensuite activé sous le rôle
  propriétaire : une tentative d'écriture métier (`restaurants`) sous
  `service_role` est refusée avec `P0100`, message du gel. Gel levé sous
  le rôle propriétaire : écriture normale sous `service_role` de nouveau
  acceptée, aucune trace laissée. État final `actif = false`.

Test permanent ajouté : `supabase/verifications/preuve-privileges-maintenance.sql`
(matrice `has_table_privilege`/`has_function_privilege`, sur le modèle de
`preuve-acl-avis.sql`) + deux gardes statiques dans `durcissement.test.ts`
qui font échouer la suite si un futur `revoke` sur `maintenance` ou ses
fonctions internes omet `service_role`.

**Observation annexe, non corrigée (hors périmètre de cette demande)** :
`maintenance_actif()` retombe sur `false` (gel inactif) si la ligne
unique venait à manquer, plutôt que sur `true` (fail-closed). Le
`DELETE` étant désormais bloqué pour tous sauf le propriétaire, ce chemin
n'est plus exploitable en pratique — signalé pour mémoire, pas changé.

## 1-2. Audit du candidat avant exécution

**⚠ Section figée : photographie de l'audit initial du 18/08, AVANT les
corrections des §0/§-1/§0bis/§7.** Le fichier s'appelait alors
`gel_de_bascule.sql`, portait 7 tables et le mécanisme bidirectionnel à
jeton décrit ci-dessous. Ce nom, ce compte de tables et ce jeton n'existent
plus dans le dépôt — voir §-1 (jeton retiré), §3 (10 tables) et §7 (fencing
ajouté) pour l'état actuel. Conservé ici tel quel pour la trace historique
de la comparaison de designs, pas comme description du candidat retenu
aujourd'hui.

**Relu intégralement à l'époque** : `supabase/migrations/20260818160000_gel_de_bascule.sql`
(candidat de `candidat/baseline-acl`, 286 lignes — depuis renommé
`gel_source_fideliz.sql`, réécrit, 313 lignes).

**Comparé à `candidat/gel-matrice`** (`20260818160000_gel_source_migration.sql`,
120 lignes) : ce sont **deux designs différents**, pas une divergence de
rédaction du même mécanisme.

| | `candidat/gel-matrice` | `candidat/baseline-acl` (retenu, à l'époque) |
|---|---|---|
| Table | `gel_migration` | `maintenance` |
| Triggers | `aaa_gel_<table>` par table (préfixe alphabétique) | `gel_de_bascule` (même nom, 7 tables à l'époque — 10 depuis, §3) |
| Portée | SOURCE seule, lecture pour le migrateur | Bidirectionnel, avec laissez-passer par jeton pour le migrateur — **le jeton a depuis été retiré, §-1** |
| Contournement | Aucun — le migrateur n'écrit jamais côté source | Jeton `bascule.jeton` (SET LOCAL), empreinte SHA-256 stockée, jamais le jeton brut — **supprimé le 19/08, §-1** |

Le candidat de `gel-matrice` explicite lui-même qu'il ne gère PAS le cas où
le migrateur doit écrire pendant le gel ("cette décision vaut pour la
SOURCE... ne pas transposer"). Le candidat retenu résout précisément ce cas.
**Le design de la table `maintenance` a été conservé** — c'est le squelette
le plus complet, pas un brouillon à remplacer — **mais pas son mécanisme de
jeton**, retiré depuis (§-1) : ce dépôt ne gouverne que la source, où le
migrateur n'a jamais besoin d'écrire, donc jamais besoin de contournement.

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
application (§ « Application, rollback, réapplication » ci-dessous) :
`actif = false`, `depuis = null`. (`empreinte_jeton` : colonne de l'époque
du mécanisme à jeton, retirée depuis — §-1 — n'existe plus dans le schéma
actuel.)

## 6. Delta catalogue attendu, écrit avant application

**⚠ Chiffres de l'audit initial du 18/08 (7 tables, avant §0bis/§7).** Pour
l'état actuel (10 tables, `service_role` verrouillé, fencing `for share`),
voir les empreintes de §7 (« Cycle d'empreinte complet », « Rollback
versionné »).

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

## Application, rollback, réapplication — mesuré (audit initial, 7 tables)

**⚠ Empreintes du 18/08, candidat à 7 tables, avant séparation/P0/fencing.**
Gardées comme trace du tout premier cycle réussi. Pour l'état actuel (10
tables), voir §7 « Rollback versionné — cycle complet rejoué avec le
fichier exact ».

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

## 7. Matrice de concurrence à deux sessions — résolue, prouvée en direct

**Mise à jour du 19/08/2026 : le blocage d'outillage ci-dessous (`dblink`,
`pg_background`, pas de `psql`/Docker local) reste vrai, mais n'empêche
plus la mesure.** Deux sessions Postgres réellement indépendantes et
concurrentes ont été obtenues sans mot de passe et sans nouveau logiciel
installé dans le dépôt, via **deux appels HTTP PostgREST authentifiés
`anon`, lancés en parallèle depuis `curl`** — chaque requête PostgREST
ouvre sa propre connexion/transaction, indépendante des autres. Testé et
confirmé au préalable que ce sont bien deux sessions distinctes (deux
`pg_backend_pid()` différents) et non deux appels sérialisés sur une même
session.

**Ce qui a été explicitement écarté** :
- `execute_sql` (l'outil utilisé pour tout le reste de ce chantier) :
  testé, et deux appels lancés en parallèle se sont révélés **sérialisés**
  (le second n'a démarré qu'après la fin complète du premier — aucun
  chevauchement mesuré). Écarté pour la matrice, faute de concurrence
  réelle.
- `dblink`/`pg_background`/`psql` local : blocages déjà documentés plus
  haut dans ce fichier, inchangés.
- Aucun mot de passe Postgres, aucune chaîne de connexion : seules l'URL
  REST du projet et la clé `anon` (publique par conception) ont servi,
  obtenues via les outils `get_project_url`/`get_publishable_keys` déjà
  autorisés.

**Garde d'identité** avant tout appel : fonction à nom aléatoire créée sur
`fusion-tests-2` uniquement, retournant un nonce synthétique généré pour
l'occasion ; appelée via l'URL REST, nonce confirmé identique avant de
poursuivre. Fonctions de test : noms aléatoires, `SECURITY DEFINER`,
`search_path` qualifié, révoquées de `PUBLIC` par défaut puis accordées
temporairement à `anon` sur cette branche seulement, toutes supprimées en
fin de cycle (confirmé : 0 fonction `temoin_*` restante).

**Isolation REPEATABLE READ** : `SET TRANSACTION ISOLATION LEVEL` échoue
si tenté depuis l'intérieur d'une fonction RPC (PostgREST a déjà exécuté
sa propre préparation de requête avant d'appeler la fonction — confirmé
par l'erreur `25001`). Contournement validé : `alter role anon set
default_transaction_isolation = 'repeatable read'` — le `BEGIN` implicite
de PostgREST pour ce rôle démarre alors directement en REPEATABLE READ,
confirmé par `current_setting('transaction_isolation')` renvoyé par la
fonction elle-même. Réinitialisé (`alter role anon reset
default_transaction_isolation`) une fois la matrice terminée.

**Barrière déterministe, pas une preuve par sommeil seul** : la session A
fixe son instantané au tout premier `select`, attend un délai borné
(`pg_sleep`, 2 s — un délai qui BORNE l'attente, ne PROUVE rien), puis
tente son écriture. La preuve d'ordre vient, après coup, de faits
observables et non du minutage : `actif_au_debut = false` rapporté par A
(son instantané voyait bien l'état pré-activation), le `xid` de la
transaction B strictement postérieur à celui de A, et l'horodatage
`clock_timestamp()` de l'activation de B strictement compris entre la
lecture de A et sa tentative d'écriture.

**Un faux départ, détecté et écarté plutôt qu'ignoré** : un premier essai
(avant l'ajout des diagnostics `pid_backend`/`xid_transaction`/
`niveau_isolation` à la fonction) a rendu un résultat incohérent
(`actif_au_debut = true` alors que l'horodatage de lecture précédait le
commit de B) — signe d'un état de connexion non fiable à ce moment précis.
Rejoué avec diagnostics complets : cohérent sur toutes les dimensions
(PID distincts, isolation confirmée, ordre des xid, chronologie). Seul ce
second résultat, entièrement vérifié, est retenu.

### Résultat du candidat AVANT correction — NO-GO confirmé

Scénario : A fixe son instantané REPEATABLE READ (`actif_au_debut =
false`), attend, B active le gel et committe pendant l'attente de A
(`xid` B = xid A + 1, horodatage d'activation strictement après la
lecture de A), A tente ensuite un `insert` sur `restaurants` (table
gelée).

**Résultat mesuré : `ecriture_ok = true`, aucune erreur.** L'écriture a
réussi alors que le gel était actif au moment de la tentative — le
mécanisme d'origine (`if maintenance_actif() then raise exception`, une
lecture MVCC ordinaire) ne voit pas une activation postérieure à
l'instantané de la transaction, exactement comme l'analyse théorique du
rapport précédent l'anticipait. **`NO-GO` confirmé par la mesure, pas
seulement déduit.** Ligne de preuve nettoyée après constat.

### Correction appliquée et prouvée

`refuser_pendant_maintenance()` acquiert désormais `perform 1 from
public.maintenance where id for share;` **avant** de lire
`maintenance_actif()`. Sous REPEATABLE READ, PostgreSQL refuse de
verrouiller silencieusement une version périmée d'une ligne modifiée par
une transaction validée après l'instantané — il lève `40001`
(`serialization_failure`) au lieu de rendre la main sur une donnée
obsolète. `for share`, pas `for update` : un `update` ordinaire sur
`maintenance` (l'activation) prend un verrou `NO KEY UPDATE`, qui entre en
conflit avec `for share` (l'activation attend donc les écritures déjà en
vol, et bloque les nouvelles jusqu'à son propre commit) — mais `for share`
n'entre pas en conflit avec un autre `for share` : des écritures
concurrentes sur des lignes différentes ne se bloquent pas entre elles
pour autant.

**Rejoué avec le même harnais, même scénario exact, après correction** :
`ecriture_ok = false`, `code_erreur = "40001"`, message `"could not
serialize access due to concurrent update"`. Isolation confirmée
`repeatable read`, `xid` B postérieur à `xid` A, chronologie identique au
run précédent. Aucune ligne laissée (l'échec en `40001` n'insère rien).

### Matrice rejouée après correction

| Scénario | Mécanisme attendu | Résultat mesuré |
|---|---|---|
| Instantané fixé avant activation, écriture après | `40001` (fermeture MVCC) | ✅ `40001`, `"could not serialize access due to concurrent update"` |
| Transaction fraîche après activation — `UPDATE` | `P0100` | ✅ `P0100` |
| Transaction fraîche après activation — `DELETE` | `P0100` | ✅ `P0100` |
| Transaction fraîche après activation — `crm_notes` | `P0100` | ✅ `P0100` |
| Écriture déjà en vol au moment de l'activation | activation **attend**, ne casse rien | ✅ activation retournée seulement après le commit de l'écriture en vol (délai mesuré ≈ durée résiduelle de l'écriture, PID distincts) |
| Lectures pendant le gel actif (`en_maintenance()` via `anon`) | reste ouvert | ✅ répond `actif:true` avec le message, sans erreur |
| Écriture normale après levée | réussit | ✅ (déjà prouvé §0bis, `service_role` compris) |
| Transaction commencée avant activation mais sans requête encore exécutée | se comporte comme une transaction fraîche (l'instantané REPEATABLE READ ne se fixe qu'à la première requête réelle — propriété MVCC de PostgreSQL, pas testée séparément : le scénario « transaction fraîche après activation » en est la démonstration directe, la première requête de cette transaction-là étant précisément l'écriture elle-même) | raisonnement direct, non re-testé séparément |

`service_role` et le RPC métier ne sont pas re-testés séparément dans ce
cycle : la garde s'applique au niveau du trigger, sur la table, quel que
soit l'appelant — déjà prouvé structurellement (même trigger, même
fonction sur les 10 tables) et pour `service_role` spécifiquement en
§0bis. `avis`/`sales_restaurants`/`winners_archive` : même trigger, même
fonction, prouvé structurellement (§3) — non rejoués individuellement en
concurrence réelle, coût jugé disproportionné par rapport à la preuve déjà
apportée sur le mécanisme lui-même (`restaurants`, `crm_notes`).

**Verdict : les scénarios mesurés passent tous. Le mécanisme corrigé
résiste à la fenêtre MVCC qui faisait échouer le candidat d'origine.**

### Rollback versionné — cycle complet rejoué avec le fichier exact

`supabase/verifications/rollback-gel-source-fideliz.sql` (nouveau,
idempotent — `if exists` partout, une seule transaction, ne touche que
les 10 triggers/3 fonctions/1 table du gel). Rejoué intégralement sur
`fusion-tests-2`, à partir de l'état déjà corrigé (P0 service_role +
fencing `for share`) :

| Étape | colonnes | fonctions | triggers | rls | acl_relations | acl_fonctions |
|---|---|---|---|---|---|---|
| Avant rollback | 239/`249debac…` | 25/`9ba8790f…`\* | 35/`39c574bd…` | 17/`f9c98e60…` | 430/`23645b75…` | 86/`37fc897b…` |
| Après CE rollback | 234/`742de13e…` | 22/`e6266426…` | 5/`db9da30c…` | 16/`0cea333d…` | 423/`de253aeb…` | 80/`1f6c087c…` |
| Réapplication (fichier brut exact) | 239/`249debac…` ✅ | 25/`ee254233…`\* | 35/`39c574bd…` ✅ | 17/`f9c98e60…` ✅ | 430/`23645b75…` ✅ | 86/`37fc897b…` ✅ |

\* **Écart trouvé et corrigé sur `fonctions` entre ces deux lignes** — pas
un défaut du rollback : mon redéploiement isolé de `refuser_pendant_maintenance()`
(juste après avoir écrit le correctif `for share`, avant ce cycle de
rollback) avait omis, par ma propre main, le commentaire `/* 57014
(query_canceled) est déjà pris... */` présent dans le fichier réellement
versionné — un texte inerte, aucun effet d'exécution, mais un texte
différent, donc un hash différent. Exactement le risque que le P0 du
18/08 avait déjà signalé, retrouvé une seconde fois par moi-même plutôt
que laissé passer. **Revérifié avec le fichier brut exact** (celui
soumis pour ce rollback/réapplication, comprenant le commentaire) : la
preuve `40001` rejouée une dernière fois contre cet état précis —
`ecriture_ok: false`, `code_erreur: 40001`, `niveau_isolation: repeatable
read`, `actif_au_debut: false` — identique aux résultats précédents. La
correction elle-même n'a jamais été en cause ; seule l'empreinte de
comparaison l'était, maintenant corrigée ci-dessus.

**Correspondance exacte sur toutes les autres dimensions.** `actif =
false`, `depuis = null`, `par = null` après réapplication — inactif par
défaut, confirmé.

### Nettoyage de fin de cycle

Toutes les fonctions `temoin_*` supprimées (confirmé : 0 restante),
`alter role anon reset default_transaction_isolation` exécuté et vérifié
(`rolconfig` ne porte plus que `statement_timeout=3s`, la valeur de
plateforme), répertoire local des identifiants REST supprimé
(`rm -rf`, confirmé absent) — répété deux fois, une par cycle de test —,
aucune connexion persistante à fermer (chaque appel `curl` est une
requête HTTP unique, refermée par PostgREST lui-même). État final de
`fusion-tests-2` : gel installé, `actif = false`, aucune donnée de test
résiduelle.

## 8. Verrou et décision fondus en une seule lecture — harnais permanent

Signalé le 19/08/2026, second tour : le trigger corrigé (§7) faisait
`perform ... for share` PUIS appelait `maintenance_actif()`, une fonction
séparée qui relisait `actif` **sans verrou**. Rien ne garantissait que ces
deux lectures portaient sur la même version de la ligne — le verrou et la
décision provenaient de deux requêtes distinctes.

**Corrigé** : `maintenance_actif()` supprimée (son unique appelante était
`refuser_pendant_maintenance()`), verrou et décision fondus dans une seule
requête — `select actif, message into ... from public.maintenance where id
for share`. Le drapeau lu est exactement celui que le verrou vient de
garantir stable, parce qu'il n'y a plus deux requêtes.

**Fail-closed sur ligne absente** : l'ancien `coalesce(actif, false)`
désactivait silencieusement le gel si la ligne unique disparaissait.
Remplacé par `if not found then raise exception ... errcode = 'P0101'` —
prouvé en direct (ligne supprimée dans une transaction, écriture métier
tentée, refusée avec `P0101`, transaction annulée, aucune trace).

**Scripts d'activation/levée versionnés**, fail-closed, jamais
`service_role` : `supabase/verifications/activer-gel-source-fideliz.sql`
vérifie l'existence de la table ET des 10 triggers attendus AVANT
d'écrire, puis contrôle via `get diagnostics ... row_count` qu'exactement
une ligne a été affectée — sinon `raise exception`, aucune activation
silencieusement ratée. `lever-gel-source-fideliz.sql` : même contrôle du
nombre de lignes. Les deux prouvés en direct sur `fusion-tests-2`,
chemin heureux ET refus (un trigger retiré délibérément → activation
refusée, `actif` resté `false`, trigger restauré).

### Harnais de concurrence permanent, versionné

La matrice précédente n'existait qu'en documentation — ses fonctions et
son script avaient été supprimés après usage, donc pas réellement
rejouable. Corrigé :

- `supabase/verifications/harnais-gel-concurrence.sql` — fonctions témoins
  (préfixe `zz_harnais_gel_`), garde d'identité par nonce régénéré à
  chaque application, `security definer` pour que des appels `anon`
  puissent activer/désactiver le gel de test sans jamais toucher aux
  droits réels d'`anon` sur `maintenance`.
- `scripts/harnais-gel-concurrence.mjs` — orchestration Node, `fetch`
  natif, **aucune dépendance ajoutée**. Variables d'environnement
  obligatoires (`SUPABASE_REST_URL`, `SUPABASE_ANON_KEY`,
  `HARNAIS_NONCE_ATTENDU`), aucune valeur en dur. Sortie : uniquement un
  tableau JSON `{ scenario, ok, detail }`, aucun secret.
- `supabase/verifications/harnais-gel-concurrence-nettoyage.sql` —
  suppression des fonctions témoins (DDL hors de portée d'un rôle `anon`,
  geste séparé et volontaire).

**Scénario clé, jusqu'ici jamais mesuré** : B active sans committer
(retient son verrou `NO KEY UPDATE`), A démarre une écriture métier en
READ COMMITTED pendant que B est en vol, A bloque sur `for share`, B
committe, A reprend. **Mesuré : A bloque bien (~1,2 s, proportionnel au
temps de rétention de B) puis reçoit `P0100` après le commit de B — jamais
un état périmé.** Rejoué aussi : écriture déjà en vol qui fait attendre
l'activation (corrigé après un premier essai bâclé — sans délai de
rétention explicite côté témoin, l'écriture committait en quelques ms et
n'était plus « en vol » au moment de l'activation, faux résultat détecté
et corrigé, pas ignoré) ; ligne absente → `P0101` ; désactivation non
committée puis écriture → écriture bloque puis réussit ; 5 répétitions
d'une course activation/écriture quasi simultanée, 0 violation (jamais
une écriture réussie avec un horodatage postérieur à un commit
d'activation).

**Limite honnête à CE moment du chantier — résolue depuis, voir §9 :**
les scénarios exigeant REPEATABLE READ pour la session `A` (transaction
fraîche testée via ce harnais permanent) n'ont pas pu être forcés avec
les mécanismes essayés à ce stade. Trois mécanismes essayés, tous
vérifiés empiriquement — aucun n'était encore l'attribut de fonction
`pg_proc.proconfig` (§9), qui s'est révélé être la forme qui fonctionne :
1. `SET default_transaction_isolation` depuis l'intérieur de la fonction
   RPC — sans effet sur la transaction en cours (confirmé : `avant` et
   `apres_set_default` identiques dans un test direct).
2. `alter role anon set default_transaction_isolation` — sans effet
   observé ; `pg_stat_activity` montre que PostgREST se connecte
   **toujours** en tant que `authenticator` (jamais `anon`), et le `SET
   ROLE anon` par requête ne réapplique pas les défauts de session du
   rôle cible.
3. `alter role authenticator set default_transaction_isolation`, avec
   `pg_terminate_backend` pour forcer de nouvelles connexions (PID
   confirmé différent après coup) — toujours sans effet. `pg_settings`
   confirme : `transaction_isolation` a `source = 'override'` — quelque
   chose (vraisemblablement PostgREST lui-même) force explicitement le
   niveau à chaque requête.

Le harnais **lit** le niveau réellement observé dans chaque réponse et
échoue honnêtement (`"NON VÉRIFIABLE ICI"`) si ce n'est pas `repeatable
read`, plutôt que de rendre un faux résultat. Cela ne retire rien à la
preuve déjà faite au §7 (cycle antérieur à ce harnais, `repeatable read`
confirmé alors, `40001` mesuré) — seulement, ce harnais permanent ne peut
pas la REJOUER à volonté sur ce projet Supabase avec les mécanismes
connus. Rôles `anon`/`authenticator` revérifiés propres après coup
(`rolconfig` sans le réglage résiduel, connexions recyclées).

### Empreinte après suppression de `maintenance_actif()`

Cycle complet rejoué sur `fusion-tests-2` : application → 24 fonctions
(`fd1b8684…`, contre 25 avant, `maintenance_actif` en moins) → rollback →
retour exact à 22 fonctions (`e6266426…`, la baseline pré-gel inchangée,
identique à tous les cycles précédents) → réapplication → 24 fonctions
(`fd1b8684…`) ✅ identique. `acl_fonctions` 85 (contre 86), même écart d'un
cran. Toutes les autres dimensions inchangées. `actif = false`, `depuis =
null`, `par = null` après réapplication.

### Tests permanents ajoutés ce tour

`supabase/migrations/durcissement.test.ts` : `maintenance_actif()`
n'existe plus (ni définition ni appel) ; le corps de
`refuser_pendant_maintenance()` ne contient qu'**une seule** lecture de
`public.maintenance` (comptage littéral des occurrences de `from
public.maintenance`) ; le verrou précède la décision (`if v_actif then`) ;
`if not found then` présent ; les deux scripts d'activation/levée
existent, contrôlent `row_count`, et ne mentionnent jamais `service_role`.
**211 tests verts.**

### Nettoyage de fin de cycle (ce tour)

Fonctions `zz_harnais_gel_*` supprimées (confirmé : 0 restante), rôles
`anon`/`authenticator` revérifiés sans réglage résiduel, répertoire local
des identifiants supprimé (`rm -rf`, confirmé absent), aucune donnée de
test résiduelle (`restaurants` filtré sur `zz-harnais-gel` : 0 ligne).
État final de `fusion-tests-2` : gel installé, `actif = false`.

## 9. REPEATABLE READ rejouable, harnais gardé, transitions strictes

Signalé le 19/08/2026 (4e tour) : quatre angles distincts, tous vérifiés
indépendamment avant correction plutôt qu'acceptés sur la foi du
signalement.

### La bonne forme pour REPEATABLE READ

`SET default_transaction_isolation` exécuté dans le corps d'une fonction,
ou posé via `alter role` (essayé aux tours précédents), n'a pas d'effet
fiable sur ce projet. La forme documentée par PostgREST — un **attribut
de fonction** (`set default_transaction_isolation to 'repeatable read'`
dans l'en-tête, stocké dans `pg_proc.proconfig`) — a été testée
isolément avant tout le reste : `pg_proc.proconfig` confirmé porter la
valeur, `notify pgrst, 'reload schema'` puis un appel REST réel
renvoient `current_setting('transaction_isolation') = 'repeatable
read'` — **sans toucher `anon` ni `authenticator`, sans terminer aucune
connexion**. `zz_harnais_gel_ecriture_rr()` porte cet attribut.

### Harnais gardé avant toute création

`harnais-gel-concurrence.sql` est désormais une seule transaction dont
la toute première action vérifie `auth.users` (0 utilisateur réel exigé),
`profiles`, et des bornes de volume sur `restaurants`/`contacts`/`winners`
— si l'une de ces conditions échoue, **aucune fonction n'est créée, aucun
grant n'est accordé**. Aucune valeur de projet codée en dur : la garde
s'appuie sur des faits observables.

### Nettoyage DDL gardé — jamais lever un vrai gel

`harnais-gel-concurrence-nettoyage.sql` vérifie maintenant l'état exact
de `maintenance` (une ligne, `actif = false`) AVANT toute suppression, et
s'arrête sans rien modifier si ce n'est pas le cas — il ne force plus
jamais `actif = false` inconditionnellement.

### Un vrai bug de course, trouvé et corrigé — pas dans le candidat

Premier essai du scénario « instantané REPEATABLE READ antérieur à une
activation déjà committée » : marge de 50 ms entre le lancement de A et
l'activation de B. Résultat incohérent observé (`ecriture_ok = true` avec
un instantané censé être périmé) — **détecté, pas ignoré**. Diagnostic :
la fonction témoin n'avait pas d'étape séparée pour fixer l'instantané
avant de tenter l'écriture ; le premier vrai statement ÉTAIT la tentative
d'écriture elle-même. Corrigé : une lecture ordinaire fixe l'instantané en
premier, une marge large (1,5 s) retient la transaction ouverte, puis
seulement la tentative d'écriture. Rejoué 3 fois de suite : 10/10
scénarios verts, code de sortie 0, à chaque fois — plus une course.

**Distinction confirmée, correcte, entre les deux niveaux d'isolation**
pour le scénario « activation non committée bloque une écriture » : sous
READ COMMITTED, le `for share` débloqué après le commit de B relit la
valeur fraîche → `P0100`. Sous REPEATABLE READ, l'instantané de A est
fixé pendant que B retient encore son verrou (donc avant son commit) → le
déblocage du `for share` après le commit de B lève `40001` **avant même
d'atteindre la décision du trigger**. Un premier test attendait `P0100`
dans les deux cas — erreur détectée et corrigée, pas dans le candidat.

### Matrice finale — 10 scénarios, harnais fail-closed

| Scénario | Résultat |
|---|---|
| Garde d'identité (nonce) | ✅ |
| Écriture déjà en vol bloque l'activation | ✅ |
| Activation non committée bloque l'écriture puis refuse — READ COMMITTED (`P0100`) | ✅ |
| Activation non committée bloque l'écriture puis refuse — REPEATABLE READ (`40001`) | ✅ |
| Instantané REPEATABLE READ antérieur à une activation déjà committée (`40001`) | ✅ |
| Ligne `maintenance` absente → refus fermé (`P0101`) | ✅ |
| Désactivation non committée puis écriture | ✅ |
| Transitions strictes : 2e activation et 2e levée refusées | ✅ |
| Course répétée × 5, 0 violation | ✅ |
| Nettoyage final (gel inactif, ligne présente, 0 fixture) | ✅ |

Rejoué 3 fois de suite, 10/10 à chaque fois. `anon`/`authenticator`
revérifiés sans réglage résiduel après coup.

### Sortie expurgée, harnais fail-closed

Le script Node ne renvoie plus `ligne_id`, PID, ni XID (retirés des
fonctions témoins elles-mêmes, pas seulement filtrés en sortie) — la
sortie ne contient que le nom du scénario, PASS/FAIL, le code SQLSTATE le
cas échéant, et des durées arrondies à la milliseconde. Chaque requête
porte un `AbortSignal.timeout()` ; toute réponse non-2xx lève une erreur ;
`reinitialiser()` propage le premier échec au lieu de l'avaler ; un échec
du bloc `finally` force le résultat global à FAIL et le code de sortie à
1 ; une vérification finale explicite (gel inactif, ligne présente, 0
fixture) suit chaque nettoyage plutôt que de faire confiance aux seuls
statuts HTTP des appels de nettoyage.

### Activation/levée : vérification exhaustive, transitions strictes

`activer-gel-source-fideliz.sql` ne compte plus seulement 10 triggers —
il compare table par table : présence, `BEFORE`, portée ligne, les trois
événements INSERT/UPDATE/DELETE ensemble, la fonction exacte
`refuser_pendant_maintenance`, l'état activé (`tgenabled = 'O'`), et
l'absence de tout trigger `gel_de_bascule` sur une table imprévue. Les
deux scripts refusent maintenant une deuxième activation/levée (au lieu
de committer un `update` silencieux qui réinitialiserait `depuis`) —
prouvé en direct sur `fusion-tests-2` : première activation acceptée,
seconde refusée (`ACTIVATION REFUSÉE : déjà actif`) ; première levée
acceptée, seconde refusée (`LEVÉE REFUSÉE : déjà inactif`).

### Cycle complet rejoué avec le fichier final inchangé

`20260818160000_gel_source_fideliz.sql` n'a pas changé ce tour — seuls
les scripts autour (harnais, activation, levée, nettoyage) ont été
corrigés. Cycle complet rejoué pour boucler la qualification :
application brute → activation (script corrigé) → levée (script corrigé)
→ rollback → empreinte exacte (24 fonctions `fd1b8684…`, identique à
avant) → réapplication (24 fonctions `fd1b8684…` ✅, `actif = false`).
**213 tests verts.**
