# Rollback RLS — joué pour de vrai, pas décrit

Exécuté le **18/08/2026** sur la branche `bngtokpnuebvvxbtnayn`.
**Production non touchée.**

## Le cycle complet

| Étape | Empreinte des policies | Policies | UUID root | `profiles` | `crm_notes` |
|---|---|---|---|---|---|
| État corrigé | `06ab49ed…` | 41 | 0 | 3 | 2 |
| **Après rollback** | `5b6dd5bc…` | 43 | 3 | 7 | 1 |
| **Après réapplication** | `06ab49ed…` | 41 | 0 | 3 | 2 |

`5b6dd5bc9df9ce6068c148a3f5288c05` est **l'empreinte exacte de la
production** — celle relevée lors du diff sémantique. Le rollback ne ramène
donc pas « un état ressemblant » : il ramène l'état historique au caractère
près, sur les 43 policies des 11 tables.

Et la réapplication retombe sur `06ab49ed…`, l'empreinte d'avant le rollback.
Les deux sens sont rejouables.

## Un défaut trouvé en le jouant, et qui ne se voyait pas

Au premier passage, **dix tables sur onze** concordaient avec la production.
La onzième, `crm_notes`, portait le bon nombre de policies mais pas le bon
texte.

La cause : la policy d'origine porte un `with check` **explicite**. Mon
rollback la recréait avec le seul `using`. Un `for all` sans `with check`
réutilise le `using`, donc le comportement était identique — mais
`pg_policies.with_check` valait `NULL` au lieu de l'expression, et l'empreinte
ne retombait pas.

Fonctionnellement invisible. Suffisant pour ruiner la preuve. **Un rollback
relu ne l'aurait jamais montré.** Corrigé dans la section de retour arrière de
`20260818011000`.

## La preuve que le rollback restaure vraiment

Un rollback qui ne casse rien peut n'avoir rien fait. Mesuré à l'état
restauré, la fuite est **intégralement revenue** :

| Rôle | Profils vus | Crée un restaurant | Notes CRM | `system_logs` |
|---|---|---|---|---|
| A | **5** | **oui** | 0 | 0 |
| commercial | **5** | **oui** | **4** | 0 |
| sans rattachement | **5** | **oui** | 0 | 0 |
| root synthétique | 5 | oui | 4 | **0** ⟵ perd l'admin |

Le root synthétique reperd son accès à `system_logs` : la policy à UUID est
revenue, et il n'est pas cette personne-là. C'est le signe le plus net que le
rollback a mordu.

Après réapplication :

| Rôle | Profils | Crée un resto | Notes | `system_logs` | Restos |
|---|---|---|---|---|---|
| A | 1 | **DENY** | 0 | 0 | 1 |
| B | 1 | **DENY** | 0 | 0 | 1 |
| commercial | 1 | **DENY** | **2** | 0 | 1 |
| sans rattachement | 1 | **DENY** | 0 | 0 | **0** |
| root synthétique | 5 | oui | 4 | **23** | 2 |

## L'ordre, qui n'est pas une préférence

`current_role()` doit être traitée **en dernier au rollback** et **en premier
à la réapplication**.

À l'aller, retirer les policies larges avant de passer la fonction en
`SECURITY DEFINER` rouvre la récursion qu'elles masquaient : toute lecture de
`profiles` rend `54001`. Au retour, l'inverse. C'est écrit dans les deux sens
parce que se tromper d'ordre ne produit pas une erreur à l'application — ça
produit une base où plus personne ne lit son profil.

## Données

Aucune donnée modifiée : chaque sonde annule son sous-bloc. Compteurs
identiques avant et après le cycle complet — 2 restaurants, 5 profils,
4 notes, 0 ligne intruse.
