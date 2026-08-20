# Lot 8 — la répétition du gel

> Jouée le 20/08/2026 sur `fusion-tests-2`, banc Fideliz ensemencé.
> Aucune production touchée.

Le gel avait été **qualifié** en août : structure, empreintes, rollback,
matrice de concurrence à deux sessions, verrouillage de `service_role`. Ce
qui n'avait jamais été fait, c'est de le **jouer en séquence** — activer,
mesurer, lever — et de regarder ce que le reste du produit devient pendant
ce temps-là.

---

## 1. Ce que la séquence a mesuré

| Étape | Résultat | Durée |
|---|---|---|
| Contrôle **avant** — les 12 tables acceptent l'écriture | vert | — |
| **Activation** (script propriétaire, 10 triggers vérifiés au catalogue) | 1 ligne à `true` | **18 ms** |
| Matrice — 12 écritures refusées, toutes en `P0100` | vert | **46 ms** |
| Les 3 tables exclues restent écrivables | vert | — |
| Les 10 lectures restent ouvertes | vert | — |
| Lectures via REST, gel actif | HTTP 200 | — |
| Parcours joueur (`play_game`) pendant le gel | refusé `P0100`, message d'opérateur | — |
| **Levée** | 1 ligne à `false` | **3 ms** |
| Contrôle **après** — les 10 tables et le parcours joueur reprennent | vert | — |

Les 12 refus couvrent les trois verbes : 10 `UPDATE`, 1 `INSERT`, 1 `DELETE`.
Un refus par un autre code que `P0100` est compté comme rouge — sans quoi un
manque de droits ou une contrainte violée passerait pour l'effet du gel.

**La vacuité est traitée comme un rouge.** Un trigger `BEFORE UPDATE` ne se
déclenche que sur des lignes réellement touchées : sur une table vide, la
moitié de la matrice passerait au vert sans rien avoir éprouvé. Chaque table
est donc comptée avant d'être éprouvée, et une table vide fait échouer la
matrice.

**Le contrôle d'avant n'est pas décoratif.** Sans preuve que ces 12 écritures
passent gel inactif, leur refus gel actif ne prouverait pas que c'est le gel
qui a agi.

---

## 2. Le défaut trouvé — ce que le joueur voyait vraiment

`lib/securite/maintenance.ts` existait depuis le 18/08 et **n'était appelé
par personne**, sauf son propre test. Son en-tête annonçait pourtant ce qu'il
évitait : « sans lui, un client qui joue pendant la fenêtre de bascule verrait
*Erreur serveur critique* ».

Mesuré gel actif, c'était pire que ça, et différent selon le parcours :

| Parcours | Ce que le joueur obtenait |
|---|---|
| **La roue** | `alert("Une erreur est survenue. Merci de réessayer.")` — une invitation à insister pendant toute la fenêtre de bascule, où chaque tentative échouera |
| **L'inscription** | l'erreur était **jetée**, rattrapée plus bas, et le rattrapage affichait un écran **TICKET portant le code `ERREUR-CONTACT-STAFF`**. Le joueur repartait avec un faux ticket, et l'employé n'avait rien à scanner |

Le second est un incident client à part entière, pendant une fenêtre choisie
précisément pour n'en causer aucun.

### Pourquoi aucun test ne l'avait vu

`estGelDeBascule()` était **correcte**, et testée. Elle n'était branchée nulle
part. Un test unitaire de la fonction ne pouvait rien voir : ce qui manquait
n'était pas la traduction, c'était son branchement.

### Le correctif

Un code métier dédié — `ERREUR_MAINTENANCE = "maintenance"` — que les deux
Server Actions rendent, et que les deux branches du client reconnaissent. Le
message vient de la base : l'opérateur peut le changer **en cours de bascule,
sans redéployer**, si la fenêtre se prolonge.

Le faux ticket `ERREUR-CONTACT-STAFF` **reste** pour les vraies pannes : c'est
la bonne réponse à un incident réel, le joueur a quelque chose à montrer. Ce
qu'on a retiré, c'est son déclenchement par une maintenance annoncée.

### La garde

`lib/securite/gel-parcours-joueur.test.ts` — 11 tests, statiques, sur le vrai
code. Elle vérifie le **branchement** et l'**ordre** : le gel doit être testé
AVANT le retour de l'erreur brute et AVANT le `throw`, sans quoi il ne serait
jamais atteint et un test « le fichier contient `estGelDeBascule` » passerait
au vert quand même.

**Contre-épreuve jouée** sur un worktree jetable au commit d'avant :
**6 des 11 rougissent**. Les 5 qui passent sont les tests unitaires du module
— exactement ceux qui ne voyaient rien.

---

## 3. Le constat qui dépasse le lot 8 — le registre de migrations ment

Mesuré en préparant ce banc, et versé en sonde rejouable :
`supabase/verifications/inventaire-reel-production.sql`.

`supabase_migrations.schema_migrations` annonce **10 migrations**, la dernière
du 18/08 à 15 h. Le dépôt en porte **25**. Sur les 15 de l'écart :

| | Nombre | Dont |
|---|---|---|
| **Appliquées, hors registre** | **7** | les trois correctifs de sécurité du 19/08 : l'oracle `play_count`, l'état fantôme `consumed`, la faille du lot d'un autre restaurant |
| **Écrites, jamais appliquées** | **8** | **le gel lui-même**, les deux fenêtres de suppression, `enregistrer_jeu_et_lots`, `creer_jeu_et_lots` |

### Trois conséquences

1. **Le gel n'est pas en production.** L'étape 3.1 de la bascule — « activer
   le gel » — est aujourd'hui **impossible** : ni table `maintenance`, ni
   fonctions, ni triggers. Il manquait au runbook une étape **3.0 : déployer
   le gel sur Fideliz**. C'est un changement de schéma sur une base vivante,
   et c'est une décision de Samy.

2. **Un banc Fideliz frais est une régression, et ne se crée même pas.**
   Le registre ne contient pas la migration de base : une branche rejoue
   10 migrations incrémentales contre une base vide et meurt à la première.
   Vérifié le 20/08 en en créant une — `MIGRATIONS_FAILED`, 0 table. Le
   fichier `00000000000000_baseline_fideliz.sql` existe pour combler ce trou,
   mais **il n'a jamais été inscrit au registre de production**.
   `fusion-tests-2` est le seul banc Fideliz utilisable : il a été reconstruit
   à la main le 18/08.

3. **`supabase db push` sur cette base est un piège.** Il tenterait de rejouer
   les 15 absentes du registre, dont 7 déjà en place. Sept sont bornées par
   empreinte et refuseraient proprement ; les autres n'ont pas cette garde.

### Ce qui n'est PAS un incident

Les 8 migrations absentes sont appelées par du code qui **n'est pas déployé**.
Vérifié fichier par fichier : les versions sur `main` — la branche réellement
en production — passent par `.from()` et n'appellent aucune de ces RPC. Le
couplage est réel mais borné : les 8 migrations et le code qui les utilise
voyagent ensemble sur `candidat/baseline-acl`, et doivent être déployés
ensemble.

---

## 4. Ce que le lot 8 ne couvre toujours pas

- **La séquence sur la vraie production**, avec ses vraies transactions en
  vol. L'étape 2 du runbook — « laisser finir ce qui est en vol » — ne se
  répète pas sur un banc sans trafic.
- **La durée réelle de la fenêtre.** Les 18 ms et 3 ms sont ceux des deux
  bascules du drapeau. La fenêtre, elle, dure le temps des étapes 3.2 à 3.8 :
  mesurées séparément, elles totalisent quelques minutes — sauvegarde
  comprise, ce sera le poste dominant.
- **Le gel de la DESTINATION Cartiz**, mécanisme séparé, non conçu.
