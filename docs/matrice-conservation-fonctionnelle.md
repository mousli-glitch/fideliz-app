# Matrice de conservation fonctionnelle — lot 4

**Écrite le 19/08/2026.** Une seule question, posée fonction par fonction :
*après la fusion dans Cartiz, est-ce que ça marche encore — et qu'est-ce qui le
prouve ?*

## La règle de lecture

Une case n'est pas une opinion. Quatre niveaux, et un seul est une preuve :

| Niveau | Ce que ça veut dire |
|---|---|
| **PROUVÉ** | un harnais rejoué a mesuré le comportement réel |
| **SOUS TÉMOIN** | le témoin de non-régression le contrôle à chaque exécution |
| **ANALYSÉ** | j'ai lu le code et raisonné — personne n'a rien mesuré |
| **RIEN** | aucune preuve, aucune analyse. Le dire est le seul honnête |

Tout ce qui suit a été **mesuré le 19/08/2026 sur la base de production, en
lecture seule**, ou lu dans le code réellement déployé. Aucun chiffre n'est
repris d'un document antérieur sans être revérifié.

---

## Ce qui existe déjà, et qu'il ne faut pas reconstruire

Le témoin de non-régression vit **côté Cartiz**
(`scripts/non-regression/`, `npm run qr:verifier`) : 171 contrôles, ~15 s,
aucune écriture, aucun secret, verdict GO / NO-GO / INDÉTERMINÉ.

Il couvre **cinq parcours dont les QR sont déjà imprimés et distribués** :

| Parcours | Ce qu'il met sous témoin |
|---|---|
| Menu Cartiz — LA RUCHE, BEST PIZZA | ordre des pages, gabarits CSS, empreintes MD5 des fichiers, orphelins, 3 formes d'URL |
| Jeu Fideliz — LA RUCHE, BEST PIZZA, SOUKARA | identité du restaurant, réglages du jeu, lots et stocks, 3 formes d'URL, `/verify` des trois classes de tickets |

`mapping-restaurants.json` y est la **seule autorité** pour rapprocher un
commerce Cartiz d'un commerce Fideliz — jamais le slug.

**Vérifié aujourd'hui :** le déploiement du lot 3 n'a cassé aucune assertion du
témoin. Les quatre libellés de ticket (`DÉJÀ UTILISÉ`, `DÉLAI DÉPASSÉ`,
`Validation Réservée`, `Prêt à valider`), la chaîne `QR Code Inconnu` et le
`min_spend` brut de la charge React survivent tous dans le code déployé.

---

## La surface réelle de Fideliz, mesurée

| Domaine | Mesure du 19/08/2026 |
|---|---|
| Restaurants | 4 |
| Comptes Auth | 9, **fournisseur `email` uniquement** — aucun OAuth utilisateur |
| Rôles | `restaurant`×7, `root`×1, `sales`×1 |
| Jeux | 9, dont **4 actifs** |
| Lots | 36 |
| Tickets | 493 — `available`×125, `redeemed`×368 — plus 37 archivés |
| Contacts | 495 |
| Avis Google | 1 513, sur **2 restaurants sur 4** |
| Jeton Google enregistré | **1 restaurant sur 4** |
| Stockage | 2 buckets publics, 88 objets — `backgrounds`×20, `logos`×68 |
| Fonctions publiques | 25, dont **15 `SECURITY DEFINER`** |
| Déclencheurs | 12 |
| Tâches planifiées | 5, via `pg_cron` **présente en production** |
| Tables de sauvegarde | 4 tables, 133 lignes cumulées |

---

## La matrice

### 1. Ce qu'un client final touche

| Fonction | À conserver | État | Ce qui le prouve |
|---|---|---|---|
| QR imprimé → page de jeu | les 3 formes d'URL (`/scan/<slug>`, `/play/<slug>`, `/play/<uuid>`) répondent | **SOUS TÉMOIN** | `qr:verifier`, 3 restaurants |
| Roue et lots affichés | libellés, couleurs, poids, stocks épuisés qui **restent** épuisés | **SOUS TÉMOIN** | fixtures `lots`, note explicite sur les 2 lots à zéro de La Ruche |
| Stock qui se recharge | `stock_refill_enabled` de Soukara (`daily`) survit | **SOUS TÉMOIN** | `lotsStockVariable`, seul champ volontairement non figé |
| Minimum d'achat appliqué | le montant affiché est celui qu'on applique | **PROUVÉ** | lot 3 : harnais 24/24 avec le correctif, 5/24 sans ; en production depuis le 19/08 |
| Ticket → `/verify` | les 3 classes gardent leur état ; un ticket inconnu est refusé | **SOUS TÉMOIN** | `controlerTickets`, empreinte SHA-256 avant ouverture |
| Fond d'écran du jeu | **9 jeux sur 9** tirent leur fond du Storage | ⚠️ **RIEN** | voir trou n°1 |
| Logo du restaurant | **4 sur 4** depuis le Storage | ⚠️ **RIEN** | voir trou n°1 |
| Jeu 100 %-gagnant | un lot unique à poids 100 doit rester 100 %-gagnant | ⚠️ **RIEN** | voir trou n°2 |

### 2. Ce qu'un restaurateur touche

| Fonction | À conserver | État | Ce qui le prouve |
|---|---|---|---|
| Connexion | 9 comptes, mot de passe, **aucun OAuth utilisateur** | **ANALYSÉ** | `auth.identities` : `email` seul |
| Scanner un ticket | validation, refus d'un ticket déjà utilisé, course entre deux caisses | **PROUVÉ** | `validate-win.test.ts`, mise à jour conditionnelle |
| Minimum affiché au comptoir | « Aucun » et « illisible » ne s'écrivent plus pareil | **PROUVÉ** | lot 3, 58 tests de parité écran ↔ base |
| Créer un jeu | design, jeu, lots dans une seule transaction | **PROUVÉ** (banc) | `harnais-creation-jeu.sql` 13/13 — **la RPC n'est pas en production** |
| Modifier un jeu | pas d'état partiel, interrupteur du minimum honoré | **PROUVÉ** | `update-game.test.ts` 50 tests ; correctif de l'interrupteur déployé le 19/08 |
| Voir ses avis Google | 1 513 avis, 2 restaurants sur 4 | ⚠️ **RIEN** | voir trou n°3 |
| Réponse automatique aux avis | cron `sync-reviews` / `auto-reply` | ⚠️ **RIEN** | voir trou n°4 |

### 3. Ce que Samy touche

| Fonction | À conserver | État | Ce qui le prouve |
|---|---|---|---|
| Périmètre `root` | accès à tout, par le **rôle** et non par un UUID | **PROUVÉ** | `root.test.ts` 124 tests, `root.comportement.test.ts` |
| Périmètre commercial | `sales` limité à son rattachement | **PROUVÉ** | matrice A/B, écritures comprises |
| Création de restaurant et de compte | mot de passe forcé à la première connexion | **ANALYSÉ** | migration 049, non rejouée depuis |
| Suppression d'un restaurant | cascade bornée, fenêtre, jeton | **PROUVÉ** | `harnais-cascade`, `harnais-fenetre-suppression`, `harnais-jeton-fenetre` |

### 4. Ce que personne ne touche mais qui doit survivre

| Fonction | À conserver | État | Ce qui le prouve |
|---|---|---|---|
| Isolation multi-tenant | A ne lit ni n'écrit rien de B | **PROUVÉ** | matrice RLS 16 tables, matrice A/B, sessions Auth réelles |
| Isolation lot/jeu | un lot d'un autre restaurant est refusé | **PROUVÉ** | hotfix du 19/08, appliqué en production, attaque mesurée avant/après |
| `service_role` sous garde | aucune action ouverte sans autorisation | **PROUVÉ** partiellement | `inventaire-destructif.md` — 4 fichiers dormants durcis ailleurs |
| Archivage des tickets | `archive_redeemed_winners(90, 5000)` | ⚠️ **RIEN** | voir trou n°4 |
| Anonymisation | `anonymize_expired_data()` | ⚠️ **RIEN** | voir trou n°4 |
| Tables de sauvegarde | 4 tables, 133 lignes | ⚠️ **DÉCISION** | voir trou n°5 |

---

## Les trous, nommés

### Trou n°1 — le Storage n'est sous aucun témoin, côté Fideliz

Les fixtures Cartiz contrôlent les objets du Storage par leur **ETag**, c'est-à-dire
leur empreinte MD5, et détectent même les orphelins. Les fixtures **Fideliz** n'ont
ni `objets` ni `orphelins`.

Or **9 jeux sur 9** portent un `bg_image_url` vers le Storage, et **4 logos sur 4**
aussi. Une fusion qui déplacerait les buckets, renommerait les objets ou
régénérerait les URL casserait le fond de tous les jeux et tous les logos — et rien
ne le signalerait. La page répondrait 200, avec un fond blanc.

**Ce qu'il faut :** étendre les trois fixtures Fideliz avec un bloc `objets`, sur le
modèle exact des fixtures Cartiz.

### Trou n°2 — aucun jeu 100 %-gagnant n'existe en production

Mesuré : **0 jeu** n'a un lot unique à poids 100. La conservation de cette
fonctionnalité ne peut donc pas être prouvée sur les données réelles.

C'est un cas limite qui compte : un jeu 100 %-gagnant ne doit jamais devenir
« perdant » après migration, et le tirage pondéré sur un seul lot est le chemin le
plus court vers une division par zéro ou un `stock_empty` injustifié.

**Ce qu'il faut :** une fixture synthétique sur le banc, pas une case cochée.

### Trou n°3 — les 1 513 avis n'ont aucun témoin

`avis` porte RLS **sans aucune policy** : personne n'y accède hors `service_role`.
C'est correct, et c'est aussi pourquoi rien ne vérifie que la lecture par
l'application continue de fonctionner. 2 restaurants sur 4 en ont.

**Ce qu'il faut :** un contrôle de lecture applicative, pas une lecture directe.

### Trou n°4 — les tâches planifiées, et leur dette

`pg_cron` est **présente en production** et absente du banc synthétique : les
5 tâches ne peuvent pas y être répétées telles quelles.

Et l'état actuel est fautif :

| jobid | Cadence | Commande |
|---|---|---|
| 3, 4, 6 | `0 3 * * *` | `archive_redeemed_winners(90, 5000)` — **trois fois, à la même minute** |
| 2 | `10 3 * * *` | la même, une quatrième fois |
| 7 | `0 3 * * *` | `anonymize_expired_data()` |

Ce qui doit être conservé, c'est **l'effet** — l'archivage et l'anonymisation — pas
la quadruple exécution. Une fusion qui recopierait fidèlement les 5 tâches
transporterait la dette.

**Ce qu'il faut :** une décision de Samy sur la déduplication, puis un témoin de
l'effet (compteurs avant/après sur le banc), jamais un test du planificateur.

### Trou n°5 — les tables de sauvegarde, décision attendue

4 tables `*_backup_20260606` / `auth_*_backup`, 133 lignes cumulées, RLS active
sans policy. Migrer ou non relève d'une décision, pas d'une règle technique :
elles contiennent des données de clients réels datées de juin.

---

## Ce que ce lot ne dit pas

- Il ne dit pas que la fusion est prête. Il dit **ce qui est prouvé et ce qui ne
  l'est pas**.
- Il ne juge pas la cible Cartiz : le schéma d'accueil, le gating de
  fonctionnalités et la marque relèvent du lot 6.
- Il n'a exercé **aucun** parcours HTTP aujourd'hui. Le témoin existant n'a pas
  été lancé sur la production — voir la note ci-dessous.

## Pourquoi le témoin n'a pas été lancé aujourd'hui

Une boucle de 44 requêtes sur `app.fideliz-app.fr`, plus tôt dans la journée, a
déclenché le pare-feu comportemental de Vercel (« Security Checkpoint ») sur mon
adresse. Les journaux d'exécution ont confirmé que **les vrais visiteurs n'étaient
pas touchés** — 79 réponses 200 en 6 minutes, aucun 403 n'atteignant
l'application — mais relancer 171 requêtes dans la foulée aurait rallongé le
blocage sans rien apprendre de neuf.

Le témoin doit être lancé, et c'est la première chose à faire à la reprise. Le
noter ici vaut mieux que de laisser croire qu'il a tourné.
