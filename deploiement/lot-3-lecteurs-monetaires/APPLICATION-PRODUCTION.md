# Lot 3 — trace d'application en production

**Appliqué le 19 août 2026.** Autorisation explicite de Samy, limitée à la
procédure de ce paquet.

---

## Ce qui a été corrigé

`play_game` et `register_win` lisaient le minimum d'achat ainsi :

```sql
v_min_spend := coalesce((case when v_game.min_spend ~ '^[0-9]+$'
                         then v_game.min_spend::int else 0 end), 0);
```

Un jeu réglé à 5,90 € porte `min_spend = '5,90'`, qui ne satisfait pas
`^[0-9]+$`. Le `else 0` en faisait « aucun minimum ». Les deux fonctions
lisent désormais par `minimum_effectif_centimes`, dans l'ordre canonique :
snapshot du ticket, puis champ en centimes du jeu, puis texte historique lu
strictement — et une valeur illisible rend `NULL`, jamais `0`.

Elles **écrivent** en outre `winners.min_spend_cents_snapshot` : la condition
est figée à l'émission, comme l'est déjà le libellé du lot.

---

## Ce qui a été exécuté, dans l'ordre

| Étape | Fichier | Nature | Issue |
|---|---|---|---|
| 1 | `01-preflight-production.sql` | lecture seule | **ETAPES 2 ET 3 REQUISES** |
| 2 | `02-appliquer-contrat-monetaire.sql` | transaction bornée | appliqué, commit |
| 3 | `03-appliquer-lecteurs.sql` | transaction bornée | appliqué, commit |
| 4 | `04-controles-post.sql` | lecture seule | **CONTROLE OK** |

`05-retour-arriere-lecteurs.sql` n'a pas été joué, et ne doit jamais l'être par
réflexe.

---

## Ce que la base répond

### Avant

```
play_game     bd472a3118470d474ea9eb26922a57c835ac97b802e2aad395757d2d871d3cc2   4227 caractères
register_win  32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442   3600 caractères
contrat monétaire : 0 colonne, 0 contrainte, 0 fonction
```

### Après

```
play_game     9e7af73ad1462bea2d458faf3499b2aa5e6a632379bc12c358fe5961fcff117d   4479 caractères
register_win  2ae951e45bb1b2b1965d0e6204648143f266ea786ff93afb6439152613e703cd   3852 caractères
contrat monétaire : 2 colonnes, 2 bornes NOT VALID, 3 fonctions
```

Relu dans un appel séparé, après commit :

| | `play_game` | `register_win` |
|---|---|---|
| lit le contrat canonique | oui | oui |
| porte encore `^[0-9]+$` | **non** | **non** |
| écrit le snapshot | oui | oui |
| `service_role` EXECUTE | oui | oui |
| `anon` / `authenticated` EXECUTE | non / non | non / non |

Le contrat éprouvé en production : `« 5,90 » → 590`, `« abc » → NULL` (et non
zéro), le snapshot prime sur le jeu.

---

## Ce qui n'a pas bougé

Chaque étape mutante a comparé, **dans sa propre transaction**, le nombre de
lignes des cinq tables et le `md5` de tous les `games.min_spend`, pris avant la
première instruction et relus avant le `commit`. Les deux comparaisons sont
passées : aucune ligne créée, supprimée ou modifiée, aucun texte réécrit.

Relevé au moment des contrôles post : 9 jeux, 36 lots, 493 tickets, dont
**0 portant un snapshot** — normal, aucun gain n'avait encore eu lieu depuis le
`commit`. Aucun backfill n'est fait : les tickets antérieurs gardent `NULL` et
sont lus sur le jeu, exactement comme avant.

L'isolation lot/jeu du hotfix du 19/08/2026 a été vérifiée **dans la
transaction** de l'étape 3, puis de nouveau aux contrôles post : elle est
intacte.

---

## Le code, déployé le même jour

Samy a autorisé le déploiement dans la foulée. Il n'a **pas** été fait en
fusionnant `candidat/baseline-acl` : cette branche est à 95 commits et
162 fichiers de `main`, et son code appelle **six RPC qui n'existent pas en
production** — `creer_jeu_et_lots`, `enregistrer_jeu_et_lots`,
`ouvrir_`/`fermer_`/`forcer_fermeture_fenetre`, `get_my_role`. La création et
la modification d'un jeu auraient cassé immédiatement.

Un déploiement **isolé** a donc été construit depuis `origin/main = 5094af3`,
le commit réellement en production, avec les onze fichiers du lot 3 et rien
d'autre :

```
commit         f655267
11 fichiers    924 insertions, 34 suppressions
RPC appelées   identiques à celles de main — aucune dépendance ajoutée
tsc            code 0
tests          164 verts, dont les 58 de parité écran ↔ base
build          vert, dans l'environnement réel
```

Point de retour arrière relevé **avant** la poussée : déploiement
`dpl_BfQoR9AzxUQWtx3VexbaD1XNUhkL`, commit `5094af3`, marqué
`isRollbackCandidate` par Vercel.

### Un supplément assumé

`app/verify/[id]/page.tsx` emporte aussi le retrait d'un UUID root codé en dur
dans un `OR` d'autorisation. Mesuré comme neutre — ce compte porte déjà
`role = 'root'`, déjà présent dans `authorizedRoles`. Le scinder aurait demandé
une édition à la main, plus risquée que de le prendre.

---

## Point ouvert, identique à celui du hotfix

Les migrations `20260819060000` et `20260819100000` ont été appliquées par ce
paquet, pas par le migrateur. Elles ne sont donc **pas inscrites** au journal de
migrations de production.

Sans danger : les deux sont fail-closed et idempotentes. `060000` n'utilise que
`if not exists` / `add column if not exists` ; `100000` est bornée par
empreinte et sortira en no-op sur le postimage. Inscrire les lignes serait une
écriture de plus en production, hors du périmètre autorisé.

---

## Si une anomalie apparaît

1. **Arrêt immédiat** — ne rien relancer.
2. **Conserver les preuves** — sortie observée, empreintes, heure.
3. **Neutraliser le parcours** si l'émission des tickets devient incohérente.
4. **Correction forward** en priorité.
5. **`05-retour-arriere-lecteurs.sql` en dernier recours**, uniquement sur
   décision explicite de Samy.

Et **jamais** le rollback de l'étape 2 : il supprime les colonnes, donc les
conditions figées de tous les tickets émis depuis. Voir
`DANGER-retour-arriere-contrat.md`.
