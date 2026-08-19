# P-15 — L'anonymisation est portée sur `clients` avant le versement

**Tranchée par Samy le 19/08/2026.** Règle produit. **C'est la cinquième et
dernière des décisions structurantes.**

---

## La règle

La règle de rétention Fideliz — 24 mois, 36 avec consentement marketing — est
posée sur `clients` **avant** que les 499 contacts n'y soient versés.

Migration écrite : `cartiz/supabase/migrations/082_anonymisation_clients.sql`.
**Non appliquée.**

## ⚠️ La règle seule ne suffit pas — et c'est le point le plus important

Porter la règle ne protège rien si **le versement remet les compteurs à zéro**.

`contacts` (Fideliz) porte `last_submitted_at`. `clients` (Cartiz) n'a **pas**
de colonne équivalente : seulement `created_at`. Si les 499 contacts sont
insérés tels quels, leur `created_at` vaut le jour du versement — et un contact
qui n'a plus rien fait depuis vingt mois **repart pour vingt-quatre**.

Ce serait exactement le défaut que P-15 vise à empêcher, déplacé d'un cran.

**Ce que le versement devra faire**, et qui reste à écrire :

| Option | Ce qu'elle coûte |
|---|---|
| Créer un `pass` par contact, avec `derniere_visite_at = last_submitted_at` | cohérent avec l'ancre choisie ; mais crée 499 cartes qui n'existent pas |
| Ajouter `clients.derniere_activite_at` et l'y verser | une colonne de plus, et l'ancre devient `coalesce(pass, colonne, created_at)` |

Je n'ai pas tranché : c'est une décision de conception du versement, et elle
mérite d'être prise avec la migration de fusion sous les yeux. **Mais elle doit
être prise** — sinon la règle posée aujourd'hui protégera des dates fausses.

## La date de référence, côté Cartiz

Compter depuis la seule création anonymiserait un client **actif** au bout de
24 mois. L'ancre retenue :

```
coalesce(max(passes.derniere_visite_at), clients.created_at)
```

`max()` parce qu'un client peut porter une carte chez plusieurs restaurants —
0 cas aujourd'hui, mais la requête ne doit pas dépendre de ce zéro.

Mesuré : **4 passes sur 17** ont une `derniere_visite_at`. Le repli sur
`created_at` sert donc dans 13 cas sur 17 — il n'est pas théorique.

## Les deux tables où le prénom se recopie

Vérifié **par comptage**, sans qu'aucun contenu ne soit affiché :

| Table | Lignes contenant le prénom du client |
|---|---|
| `push_log.message` | **12** |
| `passes.message_push` | **2** |

Ce sont des messages **rendus**, conservés après envoi. Anonymiser `clients`
seule les laisserait intacts — la forme exacte du défaut `winners_archive`
fermé le matin même. La fonction les efface en même temps.

## Les clients supprimés sont inclus

`clients.deleted_at` est une suppression douce : la ligne reste, avec prénom,
e-mail et téléphone. **Un client parti est le premier à devoir être anonymisé,
pas le dernier.** La règle ne l'exclut pas.

## Inerte à l'arrivée

Simulé en lecture seule : **0 client concerné aujourd'hui**, le plus proche de
l'échéance est à **24 mois**. Un correctif de rétention doit être inerte le jour
où on le pose, et juste pour toujours.

## Ce qui n'a pas été éprouvé

Comme pour la migration `081` : **il n'existe pas de banc à la forme de
Cartiz**. Seule la sélection de la fonction a été simulée, en lecture seule,
contre la production. La fonction elle-même n'a jamais été exécutée.

## Les cinq décisions, closes

| | Décision | État |
|---|---|---|
| P-16 | le jeu garde `/scan`, le comptoir déménage | ✅ **étape 1 faite** dans cartiz |
| P-1 | `restaurateur` partout | ✅ inventaire versé, conversion au portage |
| P-6 | plusieurs comptes gérants | ✅ aucune migration ; 2 sites de code à corriger |
| P-12 | table `restaurant × module` | ✅ migration `081` écrite |
| P-13 | refus par défaut + backfill | ✅ backfill déduit de l'usage, simulé |
| P-15 | anonymisation avant versement | ✅ migration `082` écrite |

**P-4 est tombée** avec P-6.

Reste ouvert, et bloquant pour l'application du gating : **P-11** — ce qu'une
échéance dépassée coupe, et surtout ce qu'elle ne coupe **jamais**.
