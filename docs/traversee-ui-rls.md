# Traversée UI du hotfix RLS — 18/08/2026

Environnement isolé relié à `fusion-tests` uniquement. Cinq sessions Auth
réelles. **Production ni touchée ni sondée.**

## Parcours du tenant B, vus par chaque rôle

| Rôle | Dashboard | `/customers` | `/winners` | `/games`, `/settings`, `/reviews`, `/scanner` |
|---|---|---|---|---|
| restaurateur A | **REFUS** | **REFUS** | **REFUS** | 200, aucune donnée de B |
| restaurateur B | 200 + nom | 200 + **contact** | 200 | 200 |
| commercial | **307** → son dashboard | **307** | **307** | **307** |
| root synthétique | 200 + nom | 200 + contact | 200 | 200 |
| sans rattachement | **REFUS** | **REFUS** | **REFUS** | 200, aucune donnée de B |

Les quatre dernières routes rendent `200` pour A et pour le compte sans
rattachement : ce sont des **composants clients**. Le serveur ne renvoie
qu'une coquille sans données ; le contenu arrive ensuite par le navigateur,
sous la RLS. Vérifié : ni le nom de B, ni son contact n'apparaissent dans le
HTML servi.

**Un `200` n'est donc pas un accès.** C'est le pendant du piège des `204` :
seul le contenu tranche.

## API directe, avec les vrais JWT

| Cible | restaurateur A | root |
|---|---|---|
| jeux du tenant B | **0** | 1 |
| restaurant B par son slug | **0** | 1 |
| profils | **1** | 5 |
| notes CRM | **0** | 4 |
| avis | 0 | 0 |
| gagnants | **REFUS** | **REFUS** |
| contacts du tenant B | **0** | 1 |

`winners` est refusée à tous, root compris : personne n'a de droit dessus, et
c'est conforme à la production.

## RSC direct — le contournement le plus tentant

| Requête | Nom de B | Contact de B | Refus rendu |
|---|---|---|---|
| `RSC: 1` sur le dashboard de B | non | non | oui |
| `RSC: 1` sur `/customers` de B | non | non | oui |
| `RSC: 1` sur `/winners` de B | non | non | oui |

La navigation HTML n'est pas le seul chemin, et ce n'est pas le seul gardé.

## Routes publiques et boucles

`/login` 200 · `/scan/[slug]` 200 (1 redirection, vers le jeu actif — c'est
son rôle) · `/play/[id]` 200 · `/verify/[id]` 200. **Aucune boucle, aucun
500, aucune garde administrative appelée par erreur.**

## Ce que cette traversée ne prouve pas

- Aucun parcours d'écriture n'a été joué depuis l'interface : pas de
  modification de restaurant, pas de création de jeu, pas de validation de
  ticket au scanner. La matrice SQL les couvre au niveau des droits, pas au
  niveau du parcours.
- Le dashboard commercial (`/super-admin/sales/*`) et le dashboard root
  (`/super-admin/root/*`) n'ont pas été parcourus — seulement le fait que le
  commercial y soit redirigé.
- Aucune session réelle de production n'a été testée, et ce n'est pas un
  oubli : cela demanderait un compte réel ou des données de vrais clients.
