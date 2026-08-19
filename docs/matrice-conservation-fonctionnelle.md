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
(`scripts/non-regression/`, `npm run qr:verifier`) : ~185 contrôles, ~15 s,
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
| Fond d'écran du jeu | **9 jeux sur 9** tirent leur fond du Storage | **SOUS TÉMOIN** | bloc `objets` des 3 fixtures : `ETag` + poids en `HEAD` |
| Logo du restaurant | **4 sur 4** depuis le Storage | **SOUS TÉMOIN** | idem |
| Jeu 100 %-gagnant | un lot unique à poids 100 doit rester 100 %-gagnant | **PROUVÉ** | `harnais-jeu-100-gagnant.sql` — 19/19, et 2 rouges sous dégradation |

### 2. Ce qu'un restaurateur touche

| Fonction | À conserver | État | Ce qui le prouve |
|---|---|---|---|
| Connexion | 9 comptes, mot de passe, **aucun OAuth utilisateur** | **ANALYSÉ** | `auth.identities` : `email` seul |
| Scanner un ticket | validation, refus d'un ticket déjà utilisé, course entre deux caisses | **PROUVÉ** | `validate-win.test.ts`, mise à jour conditionnelle |
| Minimum affiché au comptoir | « Aucun » et « illisible » ne s'écrivent plus pareil | **PROUVÉ** | lot 3, 58 tests de parité écran ↔ base |
| Créer un jeu | design, jeu, lots dans une seule transaction | **PROUVÉ** (banc) | `harnais-creation-jeu.sql` 13/13 — **la RPC n'est pas en production** |
| Modifier un jeu | pas d'état partiel, interrupteur du minimum honoré | **PROUVÉ** | `update-game.test.ts` 50 tests ; correctif de l'interrupteur déployé le 19/08 |
| Voir ses avis Google | 1 513 avis, 2 restaurants sur 4 | **PROUVÉ** | `avis-lecture.test.ts` — 17 tests, 5 rouges si la borne de tenant saute |
| Réponse automatique aux avis | le chemin cron exige le secret, jamais l'absence de session | **PROUVÉ** | `avis-lecture.test.ts`, cinq tentatives refusées |

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
| Archivage des tickets | `archive_redeemed_winners(90, 5000)` | **PROUVÉ** | `harnais-taches-planifiees.sql` — 25/25, bords à 89 et 91 jours |
| Anonymisation | `anonymize_expired_data()` — **archives comprises depuis le 19/08** | **PROUVÉ** | idem, + 6/6 sur le cas de l'archive de 30 mois |
| Tables de sauvegarde | 4 tables, 133 lignes | ⚠️ **DÉCISION** | instruite : `decision-tables-de-sauvegarde.md` |

---

## Les trous — deux comblés le jour même, trois ouverts

### ~~Trou n°1~~ — comblé le 19/08 : le Storage est sous témoin

Les trois fixtures Fideliz portent désormais un bloc `objets` — le fond du jeu et
le logo du restaurant, contrôlés en `HEAD` sur leur poids et leur `ETag`.

Deux choses apprises en le posant, et écrites dans le témoin :

- **`etag`, et non `md5`.** Trois des six objets sont des téléversements
  multipartites (`-1`, `-2`) : leur `ETag` est l'empreinte des empreintes des
  parties, pas celle du fichier. Le poids est donc contrôlé à côté, lui ne dépend
  que du contenu. Poids constant + `ETag` changé = ré-téléversement, signalé `~` ;
  poids changé = `✗`.
- **Le fond de Soukara est partagé par trois jeux** (un autre par deux). Un
  rangement des objets par restaurant casserait les autres. Le fixture porte
  `partagePar`.

Deux défauts du témoin trouvés au passage et corrigés : `controlerObjets` plantait
dès qu'un parcours de jeu recevait un bloc `objets` sans `pages`, et l'échantillon
de ticket valide de Best Pizza produisait un **faux NO-GO** chaque semaine faute de
`peutExpirer`.

### ~~Trou n°2~~ — comblé le 19/08 : le jeu 100 %-gagnant est prouvé

`supabase/verifications/harnais-jeu-100-gagnant.sql`, joué sur le banc : **19/19**.

- 120 tirages sans limite de stock : 120 gains, **aucun refus**, jamais un autre
  lot que le seul existant, stock illimité jamais décrémenté ;
- sous limite de stock à 12 : exactement 12 gains, premier refus au tirage **13**,
  stock à zéro, jamais négatif, 8 refus tous motivés `stock_empty` ;
- stock nul au départ : refus, et **aucun ticket émis**.

**Et il mord.** Dégradé pour retirer deux unités au lieu d'une : 6 gains au lieu de
12, premier refus au tirage 7 — deux assertions au rouge, restauration vérifiée par
empreinte.

Le troisième contrôle, lui, est resté vert sous dégradation : 12 − 2×6 = 0
exactement. C'est écrit dans le fichier, parce que c'est instructif — **le nombre
de gains porte la preuve, pas l'état final du compteur**. Un invariant de fin peut
être satisfait par un chemin faux.

### ~~Trou n°3~~ — comblé le 19/08 : la lecture des avis est prouvée

`avis-lecture.test.ts` exerce `getStoredReviews` **de bout en bout** — vraie
garde, vraie résolution de tenant, vraie requête — avec une fausse base qui
**enregistre les filtres appliqués**. Compter les avis rendus ne prouverait
rien : un jeu de données à un seul restaurant donnerait le même compte sans
aucune borne.

17 tests : A ne lit que A, A demandant B est refusé **avant toute lecture**,
root passe, un compte sans rattachement non, et le chemin cron exige le secret
— un gérant connecté ne peut pas l'emprunter.

**Il mord** : la borne de tenant retirée, **5 tests virent au rouge**, dont
celui qui inspecte le filtre. Restauration vérifiée par empreinte.

### ~~Trou n°4~~ — comblé le 19/08 : l'effet est prouvé, la dette reste à trancher

`harnais-taches-planifiees.sql` : **25/25** sur le banc. Il ne teste pas
`pg_cron` — absente du banc — mais **l'effet**, en appelant les deux fonctions
exactement comme le cron les appelle. Tester la cadence reviendrait à tester
PostgreSQL.

| Bloc | Ce qui est prouvé |
|---|---|
| archivage | seuls les éligibles partent ; les bords à **89 et 91 jours** tiennent ; un `available` très vieux reste ; idempotent |
| taille du lot | un lot de 2 en prend 2, puis 1, puis 0 |
| anonymisation | les **deux** fenêtres distinguées — 24 mois sans consentement, 36 avec ; idempotente |
| trou mesuré | un ticket archivé n'est **plus jamais** anonymisé |
| contraintes | `consumed` est refusé par la table |

**Fidélité du banc vérifiée, pas supposée.** L'empreinte brute de
`archive_redeemed_winners` diverge entre banc et production ; après
normalisation des espaces, les deux coïncident — l'écart est typographique.
Le harnais revérifie cette égalité et refuse si elle tombe.

#### Deux découvertes, à trancher par Samy

**Un ticket archivé échappe à l'anonymisation, définitivement.**
`anonymize_expired_data` ne regarde que `winners` et `contacts` ; l'archivage
sort les tickets consommés à 90 jours, bien avant les 24 mois. Relevé en
production : **37 tickets archivés, les 37 portent encore prénom et e-mail**,
le plus ancien a 11 mois. Aucune infraction aujourd'hui — une certitude dans
13 mois.

**Deux contraintes contradictoires sur `winners.status`.**
`check_winner_status` autorise `consumed`, `winners_status_check` non ; la plus
stricte gagne, et la branche `consumed` de la fonction d'archivage est morte.
Inoffensif tant que personne ne « range » en supprimant la stricte, qu'il
croira redondante.

**Les deux découvertes ont été traitées le jour même**, sur autorisation de
Samy — trace dans `application-anonymisation-et-crons.md` :

- `anonymize_expired_data` couvre désormais `winners_archive`, même fenêtre de
  24 mois. **0 ligne change aujourd'hui** : le plus ancien ticket archivé a
  11 mois. Le correctif est inerte à l'arrivée et correct pour toujours.
  Anonymiser les 37 lignes *maintenant* aurait été une autre décision —
  détruire avant l'échéance — et elle n'a pas été prise.
- Les cinq tâches sont passées à **deux** : une anonymisation à `0 3`, un
  archivage à `10 3`. Le choix de garder celle de `10 3` déduplique *et*
  sépare les deux traitements, qui se disputaient les mêmes lignes.

La contradiction sur `winners.status` reste, elle, en l'état : inoffensive tant
que personne ne supprime la contrainte stricte en la croyant redondante.

### Trou n°5 — instruit le 19/08, décision toujours attendue

`docs/decision-tables-de-sauvegarde.md`. Je ne tranche pas : c'est une règle de
rétention de données personnelles.

Le fait qui change le cadrage : **aucune** des lignes sauvegardées n'existe
encore dans les tables vives — 0 sur 52 contacts, 0 sur 64 tickets. Ce ne sont
pas des copies redondantes mais les **seuls exemplaires** des données de
116 personnes, toutes avec e-mail. Les supprimer détruit ce qui n'existe nulle
part ailleurs ; les garder, c'est conserver des données personnelles qu'aucune
règle n'anonymise.

Trois options chiffrées et une recommandation motivée dans le document.

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
