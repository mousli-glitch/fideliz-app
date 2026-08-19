# Les neuf comptes — faits mesurés et recommandations

> **Ce document n'arbitre rien.** Il rassemble ce qui est mesuré et propose,
> pour chaque compte, une recommandation à valider ou corriger par Samy.
> Le trou est réel : `mapping-restaurants.json` arbitre 7 restaurants et
> **zéro compte**. Tant qu'il n'est pas comblé, le migrateur (7g) ne peut pas
> être écrit — il ne saurait pas quelle identité survit.
>
> Aucune adresse, aucun identifiant n'y figure : les comparaisons sont faites
> par empreinte, seul le verdict est écrit. Relevé le 19/08/2026.

## ⚠ CORRECTION DU 19/08/2026 — Cartiz n'est pas commercialisé

Samy l'a précisé après la première version de ce document : **tous les comptes
Cartiz sont des comptes de test, les siens.** Aucun restaurateur ne se
connecte à Cartiz. Le compte `best-pizza` de Cartiz qui s'est connecté le
06/08, c'était lui.

Ne pas confondre deux choses qui cohabitent :

| | En service ? | Preuve |
|---|---|---|
| Les **menus** de best-pizza et la-ruche | **oui** | 98 et 266 scans de QR |
| Les **comptes** Cartiz | **non** | ce sont ceux de Samy |

**Conséquence : mes recommandations F1 et F2 ci-dessous étaient inversées.**
Elles reposaient sur l'idée que le compte Cartiz de best-pizza appartenait au
restaurateur, et disaient « garder le Cartiz, il ne change rien pour lui ».
Faux : ce compte est celui de Samy. **L'identité réelle d'un restaurateur est
toujours celle de Fideliz.**

Recommandations rectifiées :

| # | Compte | Recommandation corrigée |
|---|---|---|
| F1 | best-pizza | **verser le compte Fideliz** ; le compte de test Cartiz est supprimé |
| F2 | la-ruche | **verser le compte Fideliz** ; idem. La question « les deux adresses sont-elles la même personne » **disparaît** — l'adresse Cartiz est celle de Samy |

Et la suppression des comptes de test est possible : les 5 restaurants Cartiz
ont tous `created_by` = le compte admin de Samy, jamais un compte de test. Le
verrou NO ACTION vers `auth.users` ne se déclenchera pas.

**Il ne reste donc qu'une vraie question**, en fin de document : le mot de
passe des restaurateurs après la bascule.

---

## Ce que la mesure a corrigé

**Une seule collision d'adresse sur 9 × 5 : best-pizza.** Le plan du lot 6
laissait craindre que les deux vrais clients communs soient concernés. La
mesure dit non : la-ruche porte **deux adresses différentes** de part et
d'autre.

**La phrase du mapping ne vaut que pour un seul des deux.** « Le compte Cartiz
n'a jamais servi » est **vraie pour la-ruche** (jamais connecté) et **fausse
pour best-pizza** (connecté le 06/08/2026, plus récemment que son homologue
Fideliz). Deux lentilles du lot 6 avaient lu cette phrase en sens opposé —
elles avaient toutes les deux raison, sur un restaurant chacune.

## Les neuf comptes Fideliz

| # | Compte | Rôle | Restaurant | Dernière connexion | Fait décisif | Recommandation |
|---|---|---|---|---|---|---|
| F1 | best-pizza | restaurant | best-pizza | 09/07/2026 | **même adresse** que le compte Cartiz, qui a servi plus récemment | **ne pas verser** — le compte Cartiz survit |
| F2 | la-ruche | restaurant | la-ruche | 06/07/2026 | adresse **différente** ; le compte Cartiz n'a **jamais** servi | garder l'UUID Cartiz, **adopter l'adresse Fideliz**, forcer le mot de passe |
| F3 | soukara | restaurant | soukara | 12/08/2026 | restaurant à créer côté Cartiz | **verser** en `restaurateur` |
| F4 | test78 | restaurant | test78 | 30/06/2026 | restaurant `exclure` au mapping | **ne pas verser** |
| F5 | orphelin A | restaurant | *aucun* | **JAMAIS** | aucune donnée, aucun restaurant ne le référence | **ne pas verser** |
| F6 | orphelin B | restaurant | *aucun* | 09/06/2026 | idem | **ne pas verser** |
| F7 | orphelin C | restaurant | *aucun* | 09/06/2026 | idem | **ne pas verser** |
| F8 | root (Samy) | root | *aucun* | 10/08/2026 | adresse différente de l'admin Cartiz, qui sert quotidiennement | **ne pas verser** |
| F9 | commercial | sales | *aucun* | 12/07/2026 | périmètre **vide** (0 rattachement, 0 note CRM) | **verser** en `sales` |

**Bilan : 2 comptes créés, 1 compte modifié, 6 non versés.**

## Les cinq comptes Cartiz, pour mémoire

| Compte | Rôle | Dernière connexion | Sort |
|---|---|---|---|
| best-pizza | restaurateur | 06/08/2026 | **survit** — rien ne change pour le restaurateur |
| la-ruche | restaurateur | **JAMAIS** | **adresse remplacée** par celle de Fideliz |
| chez-samy | restaurateur | 13/06/2026 | test, intact |
| mpbmeru | restaurateur | **JAMAIS**, mot de passe provisoire | `ne-pas-toucher`, intact |
| admin (Samy) | admin | 19/08/2026 | fondateur, intact |

`testmicro` existe comme restaurant mais **n'a aucun compte** — normal, c'est un test.

## Les trois décisions qui restent à toi

### ~~D-1 · la-ruche : les deux adresses sont-elles la même personne ?~~ — SANS OBJET

L'adresse côté Cartiz est celle de Samy, pas celle d'un restaurateur. La
seule adresse réelle est celle de Fideliz. Rien à arbitrer.

<details><summary>Formulation initiale, conservée pour mémoire</summary>

Côté Cartiz une adresse d'un fournisseur, côté Fideliz une autre. Si c'est la
même personne, la recommandation tient : on garde l'UUID Cartiz, on lui met
l'adresse Fideliz, et le restaurateur choisit un nouveau mot de passe à sa
première connexion. Si ce sont **deux personnes différentes**, la question
change entièrement et il faut décider laquelle est le gérant.

**Je ne peux pas trancher : c'est un fait que seul toi connais.**

</details>

### D-2 · les trois orphelins : ne pas verser, ou verser coupés ?

Ils ne portent rien et ne sont référencés nulle part. Deux options :

- **ne pas verser** — le plus simple, et rien n'est perdu de fonctionnel ;
- **verser désactivés** (`is_active = false`) — garde la trace de qui avait
  un accès. C'est devenu possible avec la migration 085.

Ma recommandation : **ne pas verser**. Trois comptes sans restaurant dans un
annuaire, c'est trois occasions de se tromper plus tard.

### ~~D-3 · best-pizza : confirmer que le compte Cartiz survit~~ — INVERSÉE

C'est le compte **Fideliz** qui survit : le compte Cartiz est un compte de
test. Voir la correction en tête de document.

### D-3bis · le mot de passe des restaurateurs après la bascule

Les restaurateurs de best-pizza, la-ruche et soukara se connecteront avec leur
compte Fideliz. Deux options :

- **garder leur mot de passe actuel** — rien à faire, rien à leur annoncer ;
- **réémettre un mot de passe provisoire**, avec `doit_changer_mdp` posé, à
  changer à la première connexion.

La première ne dérange personne. La seconde est plus propre si tu veux
marquer le passage à la nouvelle application. **Attention dans les deux cas :**
`doit_changer_mdp` ne s'applique qu'aux comptes créés avec le drapeau — une
réémission qui l'oublie rend les mots de passe provisoires permanents.

<details><summary>Formulation initiale de D-3, conservée pour mémoire</summary>

Les deux portent la même adresse, et dans un seul projet Supabase deux lignes
`auth.users` ne peuvent pas la partager. L'un des deux doit disparaître.

Le compte Cartiz a servi le 06/08, le compte Fideliz le 09/07. Le Cartiz est
déjà rattaché au restaurant Cartiz. Garder le Cartiz ne demande **rien** au
restaurateur : même adresse, même mot de passe.

Garder le Fideliz obligerait à recréer le rattachement et à réémettre un mot
de passe. **Recommandation : le Cartiz survit.** À confirmer.

</details>

## Ce que le versement doit conserver

**488 gagnants** — best-pizza 102, la-ruche 256, soukara 130. Les 12 de
`test78` disparaissent avec le restaurant exclu, ce qui est le sens de
`exclure`.

## Ce que ce document ne traite pas

- Les tables `games`, `winners`, `avis` **n'existent pas encore dans Cartiz**.
  Leur accueil est une tranche à part, à instruire après 7h.
- `restaurants.user_id` et `owner_id` divergent sur **les 4 restaurants**
  Fideliz, pas seulement l'un d'eux. Aucune des deux ne fait foi. Sans objet
  ici : toutes deux figurent parmi les 16 colonnes écartées de la migration
  083.
- Le `doit_changer_mdp` ne s'applique qu'aux comptes **créés** avec ce
  drapeau. Si la reprise réémet des mots de passe sans le poser, ils
  deviennent permanents à l'insu de tous — vérifié dans `proxy.ts`.
