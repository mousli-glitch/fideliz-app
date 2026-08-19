# État de la préparation invisible — checkpoint durable

Écrit le 19/08/2026. Ce fichier est le point de reprise : il dit ce qui est
**prouvé**, ce qui est **préparé mais non prouvé**, et ce qui n'est **pas
commencé**. Il ne gonfle rien.

## Règle de qualification appliquée

Un artefact n'est **prouvé** que si **le fichier réellement livré** a été
exécuté sur la cible synthétique. Une réimplémentation sert à explorer, jamais
à qualifier. Cette règle a coûté deux tours (le rollback du hotfix ne
compilait pas alors que je le déclarais prouvé) ; elle est désormais tenue.

## Fermé et prouvé

| Lot | Preuve | Fichier de preuve |
|---|---|---|
| Cascade de suppression | manifeste FK identique avant/après, 4 fautes détectées | `harnais-cascade-*.sql` |
| Fenêtre de suppression | 7/7 + jeton 10/10 | `harnais-fenetre-suppression.sql`, `harnais-jeton-fenetre.sql` |
| Enregistrement du jeu | 10/10 + agrégat 19/19 | `harnais-enregistrement-jeu.sql`, `harnais-agregat-jeu.sql` |
| Isolation lot/jeu (P0) | attaque 2/5 → 5/5, machine d'état 11 transitions | `harnais-isolation-lot-jeu.sql`, `harnais-machine-etat-hotfix.sql` |
| Contrat monétaire | oracle unique, corrigé 34/34, permissif 13/34 | `harnais-contrat-monetaire.sql` |
| Création atomique du jeu | 13/13, ancien jeu actif après refus | `harnais-creation-jeu.sql` |
| Paquet hotfix | fichiers **livrés** exécutés : préimage ↔ postimage | `harnais-hotfix.test.ts` |

**631 tests** (18 fichiers), `tsc --noEmit` code 0.

## Préparé, non appliqué

Neuf migrations `20260819*`, chacune avec son rollback, toutes jouées sur la
branche synthétique, **aucune en production**.

## Hotfix P0 — appliqué en production le 19 août 2026

La faille permettant à un joueur de présenter le lot d'un autre restaurant est
**fermée en production**. Samy l'a autorisée explicitement, pour ce seul
correctif ; les trois étapes du paquet `hotfix/isolation-lot-jeu/` ont été
jouées dans l'ordre, avec le contenu exécutable des fichiers livrés.

Préflight vert, application commitée, contrôles post verts. Empreinte
`374e1382…` → `32a32389…`, manifeste et droits effectifs inchangés, aucune
donnée métier touchée. Trace complète et point ouvert (la migration n'est pas
inscrite au journal de production) : `hotfix/isolation-lot-jeu/APPLICATION-PRODUCTION.md`.

C'est **la seule opération réelle** menée en production à ce jour. Toutes les
autres migrations `20260819*` restent sur la branche synthétique.

## Non commencé — ce qu'il reste

| Lot | Contenu | Pourquoi ce n'est pas fait |
|---|---|---|
| 3 (partiel) | lecteurs monétaires : `play_game`, `register_win`, page publique, scanner, `get-winner-info`, snapshot à l'émission | le défaut reste **actif pour les clients** tant que ces lecteurs utilisent `^[0-9]+$` |
| 4 | matrice de conservation fonctionnelle | — |
| 5 | audit `service_role` exhaustif | partiellement fait (`docs/inventaire-destructif.md`) |
| 6 | compatibilité interfaces, affichage monétaire, marque | — |
| 7 | migrateur complet rejouable | le dry-run existe et est idempotent ; le reste non |
| 8 | répétition du gel | scripts prêts, non rejoués en séquence complète |
| 9 | répétition générale synthétique de bout en bout | — |
| 10 | dossier `READY_FOR_MIGRATION` | — |

### Le point le plus important du reste

Le contrat monétaire est fermé **côté écriture** (création et modification) et
**pas côté lecture**. Un jeu enregistré à 5,90 € porte donc `min_spend_cents =
590` — correct — mais `play_game` et `register_win` continuent d'appliquer 0 €.

Basculer ces lecteurs change la charge JSON rendue au navigateur : `min_spend`
y est aujourd'hui en **euros entiers**. La règle est de ne jamais changer
silencieusement l'unité d'un champ existant — il faut donc ajouter un champ
canonique `min_spend_cents` et corriger la valeur en euros, puis reprendre
tous les consommateurs. C'est un lot entier, avec son harnais sur chaque
producteur et chaque lecteur.

## Pourcentages, sans arrondi flatteur

- **Préparation invisible : ~55 %.** Les fondations de sécurité et
  d'atomicité sont fermées et prouvées ; les lecteurs, la conservation, le
  migrateur complet, la répétition générale et le dossier opératoire ne le
  sont pas.
- **Avant mise en service complète : ~25 %.** Le hotfix P0 est appliqué, mais
  c'est la seule opération réelle : ni migration de données, ni gel, ni
  bascule visible.
