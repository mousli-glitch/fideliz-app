# Checkpoint — hotfix P0 Server Actions

**Statut : ACTIF ET STABLE en production.** 18/08/2026.

## Écart entre le SHA autorisé et le SHA servi

| | |
|---|---|
| SHA initialement autorisé | `eb3763c` |
| SHA finalement servi | `a99cb0c` |
| Différence | **un seul fichier Markdown**, `docs/dette-p0-server-actions.md` |
| Code exécutable | **identique**, au bit près |
| Acceptation | **explicite** de Samy, rollback refusé pour ne pas déclencher un troisième déploiement |

### Comment l'écart est arrivé

Le hotfix a été déployé sur `eb3763c`, conformément à l'autorisation. J'ai ensuite
committé le document de dette et poussé sur `main` — ce qui a déclenché un
**second déploiement de production** et fait passer le SHA servi à `a99cb0c`.

### Leçon

**Toute poussée sur `main`, même purement documentaire, déclenche un déploiement
de production.** Il n'existe pas de commit inerte sur cette branche. Un document
destiné à accompagner un hotfix se commit *avec* le hotfix, ou attend la
livraison suivante — jamais entre les deux.

Conséquence pratique : un SHA autorisé ne reste le SHA servi que si plus rien
n'est poussé sur `main` après le déploiement.

## Déploiements

| Rôle | Déploiement | SHA |
|---|---|---|
| Production actuelle | `dpl_GEC3YYNcYrQEvgBwLh91Q2Nph1yn` | `a99cb0c` |
| Hotfix autorisé (intermédiaire) | `dpl_7ETGmQFAsQy4gBhasbuncgdAPPwR` | `eb3763c` |
| Preview du candidat | `dpl_HChskdBcy6DcaQu6Gv3M9Hq9oFwQ` | `eb3763c` |
| **Cible de rollback** | `dpl_87RDP4btWcvExJnqzS2W6szAtDmJ` | `41659a8` |

```bash
npx vercel rollback fideliz-37ars39w5-fidelizs-projects.vercel.app
```

## Ce que le P0 a fermé

Cinq fichiers réellement joignables, autorisés sur l'objet résolu côté serveur et
non sur ce que le client déclare : `update-game`, `create-game`, `google-business`
(7 actions), `get-sales-data`, `log-system-error`.

Quatre fichiers `service_role` sans garde sont **absents du manifeste des Server
Actions** — donc injoignables — et volontairement laissés hors du hotfix :
`admin.ts`, `player.ts`, `get-customers-page.ts`, `get-winners-page.ts`. Leur
durcissement attend sur `candidat/p0-dormant` (`f0ab909`). Un test suit les
imports depuis les routes réelles et échoue si l'un redevient atteignable.

## Dette ouverte

Voir `docs/dette-p0-server-actions.md` : absence de transaction dans
`updateGameAction`, et `"use server"` sur `lib/securite/garde-action.ts`.
