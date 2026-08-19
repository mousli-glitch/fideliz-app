# P-13 — L'absence de droit vaut refus, avec backfill du parc

**Tranchée par Samy le 19/08/2026.** Règle produit. **Elle débloque l'écriture
de la table de P-12.**

---

## La règle

Pas de ligne dans `habilitations` = **pas le droit**. Et le parc existant reçoit
ses droits explicitement, à la migration — sinon la règle couperait tout le
monde le jour où elle s'applique.

## Le backfill se déduit de l'usage, jamais d'une liste de slugs

Aucun nom de restaurant n'est écrit en dur dans la migration. Les droits se
dérivent de ce que chaque commerce **utilise réellement** — ce qui la rend
rejouable, et juste même si le parc a changé depuis sa rédaction.

Migration écrite : `cartiz/supabase/migrations/081_habilitations_par_module.sql`.
**Non appliquée.**

## Deux pièges, trouvés en simulant le backfill en lecture seule

### Le mien d'abord

Ma première règle accordait `carte` à qui possédait des `scans`. Simulée, elle
donnait le module à un restaurant qui a **0 page de flyer, 0 produit et un seul
scan**. Un scan sans carte derrière ne prouve rien — et un `deny-by-default`
n'a de sens que si les droits qu'il accorde sont vrais.

Corrigé : le droit suit le **contenu**, pas la fréquentation.

### Celui du produit

`la-ruche` et `best-pizza` n'ont **aucun `menu_items`** — 0 produit, 0
catégorie. Ils servent leur carte **en images**, par `flyer_pages` : 12 et 4
pages, 266 et 98 scans.

Un backfill qui n'aurait regardé que les produits aurait refusé le module
`carte` **aux deux seuls vrais clients**. C'est le genre d'erreur qu'on ne
découvre qu'en production, un lundi midi.

## La matrice, simulée en lecture seule

| Restaurant | `carte` | `fidelite` | Ce qui le justifie |
|---|---|---|---|
| `la-ruche` | **oui** | — | 12 pages de flyer ; programme éteint, 0 client |
| `best-pizza` | **oui** | **oui** ⚠️ | 4 pages ; **1 client, 0 passage, programme éteint** |
| `chez-samy` | **oui** | **oui** | 56 produits, 3 pages ; tampons actifs, 22 passages |
| `mpbmeru` | — | **oui** | 0 page et 0 produit ; points actifs, 6 passages |
| `testmicro` | — | — | rien du tout — **et c'est voulu** |

`jeu` et `avis` ne sont pas peuplés ici : leurs données vivent encore dans
Fideliz. Ils seront accordés par la migration de fusion, sur le même principe —
mesuré, la-ruche et best-pizza ont chacun un jeu actif, seule la-ruche a des
avis (752, Google connecté).

## ⚠️ Le seul cas qui demande ton arbitrage

**`best-pizza` obtient `fidelite`** sur un unique client inscrit, zéro passage,
et un programme éteint. Quelqu'un s'est bien inscrit — il détient une carte
Wallet — mais le commerce ne s'en sert pas.

| Option | Conséquence |
|---|---|
| **Accorder** (ce que fait la migration) | il garde l'accès à un module qu'il n'utilise pas ; le client inscrit reste servi |
| **Refuser** | le module disparaît de son dashboard, et **la carte Wallet déjà installée** chez ce client devient orpheline |

**Je recommande d'accorder.** Retirer un module dont un client final détient
déjà la preuve installée, c'est casser quelque chose qui est dans une poche.

## Ce qui reste avant d'appliquer

1. **Ton arbitrage sur `best-pizza`.**
2. **P-11** — ce qu'une échéance dépassée coupe. Poser le droit et le faire
   respecter sont deux gestes ; rien ne consulte encore cette table.
3. **Régénérer les types** (`supabase gen types`) après application, comme
   l'impose le CLAUDE.md de Cartiz.

## Ce qui n'a pas été éprouvé, et pourquoi

**Il n'existe pas de banc à la forme de Cartiz.** Le banc synthétique
`fusion-tests-2` a le schéma de Fideliz. Cette migration n'a donc **pas** été
jouée avant d'être proposée — seule la simulation de son backfill a tourné, en
lecture seule, contre la production.

C'est une lacune réelle du dispositif, et elle vaut pour toute migration Cartiz
à venir. Elle mérite d'être comblée avant la fusion.
