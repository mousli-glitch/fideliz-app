# Lot 3 — paquet d'application production

**Le minimum d'achat affiché au client doit être celui qu'on lui applique.**

Ce paquet corrige, côté base, le défaut mesuré en production le 19/08/2026 :
un jeu réglé à 5,90 € s'affiche correctement sur la roue et se lit
« Minimum de commande : Aucun » dans le scanner du restaurateur.

> ⚠️ **Rien ici ne doit être exécuté sans l'accord explicite de Samy.**

---

## Ce que le paquet fait — et ce qu'il ne fait pas

| | |
|---|---|
| ✅ | `play_game` et `register_win` lisent le contrat canonique |
| ✅ | Chaque ticket émis porte désormais `min_spend_cents_snapshot` — la condition est **figée au moment du gain** |
| ✅ | Les colonnes, contraintes et fonctions du contrat monétaire sont installées |
| ❌ | **Le scanner continuera d'afficher « Aucun »** — cet écran lit le code déployé, pas la base |

**Cette étape est nécessaire, elle n'est pas suffisante.** L'écran ne suivra
qu'au déploiement du code du lot 3 (commit `bbef844`).

Elle est néanmoins utile seule : à partir du `commit` de l'étape 3, les
snapshots écrits sont corrects, et ils le resteront — y compris pour des
tickets remis avant le déploiement du code.

### Ordre imposé : base d'abord, code ensuite

Le code du lot 3 lit `winners.min_spend_cents_snapshot`. Déployé sur une base
qui n'a pas la colonne, PostgREST renvoie une erreur et le scanner répond
**« QR code invalide ou introuvable » pour tous les tickets**.

L'inverse est parfaitement sûr : colonnes nullables, signatures inchangées,
aucun backfill. La base peut rester en avance sur le code aussi longtemps
qu'on veut.

### Compatibilité avec le code actuellement en ligne

Vérifiée sur `origin/main` le 19/08/2026. Les deux seuls consommateurs de la
valeur rendue écrivent `result.min_spend || 0`, et le navigateur ne lit que
`ticket.qr_code`. Sur un jeu décimal la valeur passe de `0` à `5.9` : personne
ne s'en sert, rien ne casse.

---

## Procédure

| Étape | Fichier | Nature |
|---|---|---|
| 1 | `01-preflight-production.sql` | lecture seule — dit quelles étapes sont nécessaires |
| 2 | `02-appliquer-contrat-monetaire.sql` | transaction bornée — colonnes, bornes, 3 fonctions |
| 3 | `03-appliquer-lecteurs.sql` | transaction bornée — les deux lecteurs |
| 4 | `04-controles-post.sql` | lecture seule |
| — | `05-retour-arriere-lecteurs.sql` | **dernier recours**, voir plus bas |

Le préflight rend l'un de trois verdicts, et **c'est lui qui décide** :

```
ETAPES 2 ET 3 REQUISES   → jouer 02, puis 03
ETAPE 3 REQUISE          → jouer 03 seulement
DEJA APPLIQUE            → ne rien exécuter
```

Tout autre état lève. Le préflight refuse notamment un contrat **partiel**
(entre 1 et 4 objets sur 5) et un état **mixte** où l'un des deux lecteurs
serait corrigé et pas l'autre.

État mesuré en production le 19/08/2026 : contrat absent, lecteurs d'origine.
Le verdict attendu est donc **ETAPES 2 ET 3 REQUISES**.

### Une précondition non négociable

`register_win` doit porter l'isolation lot/jeu du hotfix du 19/08/2026. Si la
production portait encore le corps baseline, le préflight s'arrête : il
faudrait d'abord rejouer `hotfix/isolation-lot-jeu/`.

Appliquer le lot 3 par-dessus une base non corrigée écraserait un correctif de
**sécurité** par un correctif d'**affichage**.

---

## Ce que chaque étape garantit d'elle-même

Les étapes 2, 3 et 5 ouvrent leur **propre transaction** — elles ne dépendent
pas du comportement de l'outil qui les exécute. Chacune :

- borne ses délais (`lock_timeout` 5 s, `statement_timeout` 60 s) : sur une
  production active, le correctif **refuse** plutôt que d'attendre derrière une
  transaction longue et de bloquer le parcours joueur ;
- prend un verrou consultatif (`lot-3:lecteurs-monetaires`) : deux opérateurs
  simultanés se sérialisent proprement au lieu de se marcher dessus ;
- **prouve** par empreinte qu'aucune donnée métier n'a bougé — nombre de lignes
  des cinq tables, et `md5` de tous les `games.min_spend`. Si une seule valeur
  a changé, la transaction est annulée. Ce n'est pas une affirmation, c'est une
  mesure ;
- relit le manifeste complet (signature, propriétaire, `SECURITY DEFINER`,
  `search_path`, volatilité, ACL) **après** les `revoke`/`grant`, dans la même
  transaction. Sans cette relecture, un écart de droits apparu entre le
  préflight et l'application serait normalisé en silence.

Les étapes 1 et 4 n'écrivent rien du tout, et **lèvent** au premier écart :
zéro ligne rendue par un `SELECT` ne contient aucun verdict rouge et se lit
comme un succès.

---

## Aucune dérive possible entre le paquet et les migrations

Les fichiers 02, 03 et 05 **embarquent** le contenu de leur migration ou de
leur rollback, pour être des transactions autonomes. Deux copies du même SQL,
c'est deux copies qui divergent.

`supabase/verifications/paquet-lot-3.test.ts` exige que le contenu embarqué
soit le fichier source **caractère pour caractère**, et vérifie la seule chose
que l'assemblage peut casser en silence : une collision de délimiteurs
dollar-quote entre l'enveloppe et le contenu embarqué.

---

## Répétition générale — ce qui a réellement été exécuté

Sur la branche synthétique `fusion-tests-2`, le 19/08/2026, **avec les fichiers
livrés**, replacée au préalable dans la forme exacte de la production :

| Fichier | État de départ | Résultat observé |
|---|---|---|
| `01` | tout appliqué | `DEJA APPLIQUE — ne rien executer` |
| `05` | tout appliqué | retour aux préimages, isolation lot/jeu intacte |
| `01` | contrat présent, lecteurs d'origine | `ETAPE 3 REQUISE` |
| `01` | contrat absent, lecteurs d'origine | `ETAPES 2 ET 3 REQUISES` |
| `02` | contrat absent | colonnes, bornes NOT VALID, 3 fonctions, contrat éprouvé |
| `03` | contrat présent | `bd472a31…` → `9e7af73a…`, `32a32389…` → `2ae951e4…` |
| `04` | tout appliqué | `CONTROLE OK` |

Les trois verdicts du préflight ont donc été observés, pas déduits.

Empreintes attendues :

```
play_game     bd472a31…  4227 car.  →  9e7af73a…  4479 car.
register_win  32a32389…  3600 car.  →  2ae951e4…  3852 car.
```

Le comportement, lui, est prouvé ailleurs :
`supabase/verifications/harnais-lecteurs-monetaires.sql` appelle réellement les
deux fonctions et compare — **24/24 avec le correctif, 5/24 sans lui**.

---

## Si une anomalie apparaît

**Ne pas jouer le retour arrière par réflexe.**

1. **Arrêt immédiat** — ne rien relancer, ne rien « réessayer ».
2. **Conserver les preuves** — sortie observée, empreintes, heure.
3. **Neutraliser le parcours** si l'émission des tickets devient incohérente :
   hors service est moins grave qu'incohérent.
4. **Correction forward** en priorité.
5. **`05-retour-arriere-lecteurs.sql` en dernier recours**, et uniquement sur
   décision explicite de Samy, après avoir établi que l'incident vient de *ce*
   lot — pas d'autre chose survenue au même moment.

`05` rouvre le défaut d'affichage. Il **ne rouvre pas** l'isolation lot/jeu :
`register_win` revient à son état post-hotfix, et le fichier le vérifie.

### ⚠️ Et jamais le rollback de l'étape 2

`supabase/rollback/20260819060000_rollback.sql` **supprime les deux colonnes**.
Joué après l'étape 3, il détruirait tous les `min_spend_cents_snapshot` écrits
depuis — c'est-à-dire la condition figée de chaque ticket émis entre-temps.

Voir `DANGER-retour-arriere-contrat.md`.
