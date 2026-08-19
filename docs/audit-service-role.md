# Audit `service_role` exhaustif — lot 5

**Relevé le 19/08/2026** sur `candidat/baseline-acl`, après un `npm run build`
réel. Rien n'est déduit d'une lecture de fichier isolée : la joignabilité vient
du **manifeste de build**, le graphe d'appel de `scripts/inventaire-actions.mjs`,
la couverture d'un balayage des imports dans les fichiers de test.

## Pourquoi cette clé mérite un audit à part

`service_role` **contourne la RLS par construction**. Toute la matrice RLS des
16 tables, tous les tests d'isolation A/B, toutes les policies : rien de tout
cela ne s'applique à une requête portée par cette clé.

La seule barrière est alors la garde écrite dans l'action elle-même. D'où la
question de ce lot, posée site par site : **qui peut l'atteindre, qu'est-ce qui
l'arrête, et qu'est-ce qui le prouve ?**

---

## La surface, mesurée

| | |
|---|---|
| Fichiers créant un client à la clé de service | **44** |
| Modules de Server Actions | 31, pour **53 actions exportées** |
| Modules tenant une clé de service | **25** |
| Modules vérifiant une identité | 24 |
| Modules sans aucun appelant | 5 |
| Actions joignables depuis un bundle public | **4** |

### La surface publique est conforme

`npm run securite:surface`, sur le manifeste du build réel :

```
36 actions au total, 2 page(s) publique(s) en portent

✓ app/play/[slug]/page   — checkReplayStatusAction, playGameAction, registerWinnerAction
✓ app/verify/[id]/page   — validateWinAction

Conforme — aucune action d'administration n'est joignable publiquement.
```

**Aucune action d'administration n'est atteignable par un inconnu.** Ce n'est
pas parce qu'un contrôle l'interdit, mais parce que leur identifiant n'entre
dans aucun bundle public — une protection réelle et fragile, d'où le script qui
la vérifie à chaque build.

---

## Les trois zones, par ordre de risque

### Zone 1 — quatre actions joignables sans compte

Ce sont les seules qu'un visiteur peut invoquer. Trois tiennent la clé de
service **sans vérifier d'identité** — c'est leur raison d'être : un joueur n'a
pas de compte.

| Action | Ce qui la borne | Limite d'IP | Test |
|---|---|---|---|
| `playGameAction` | RPC `play_game` : tirage serveur, anti-rejeu, stock atomique | **oui**, 5/h réglable | via `harnais-jeu-100-gagnant.sql` |
| `registerWinnerAction` | RPC `register_win` : lot **borné au jeu** depuis le hotfix du 19/08 | **oui**, 5/h réglable | `harnais-isolation-lot-jeu.sql` |
| `checkReplayStatusAction` | RPC `get_replay_status`, dépouillée de `play_count` le 19/08 + projection explicite dans l'action | ⚠️ **aucune** — le patron des sœurs ne transpose pas, voir plus bas | `check-replay.test.ts` (14) |
| `validateWinAction` | se garde elle-même : session, rôle, appartenance du ticket | s.o. | `validate-win.test.ts` |

#### ⚠️ Ce que j'ai trouvé sur `checkReplayStatusAction` — corrigé le 19/08

C'était la seule des quatre sans limite d'IP **ni test**. Et sa RPC rendait
plus que nécessaire :

```
{ replay: true, status: 'too_soon', hours_left: N }   → cette adresse a joué récemment
{ replay: true, status: 'ok', play_count: N, … }      → et elle a joué N fois en tout
```

Les identifiants de jeu sont publics — ils sont dans la page. Un visiteur
pouvait donc demander, pour une adresse e-mail quelconque, **si cette personne
a joué chez ce restaurant et combien de fois**. Sans compte.

**Ce qui a été fait le 19/08** (trace complète :
`application-check-replay.md`) :

- `play_count` retiré de la RPC en production — `300d8bba…` → `1e372cca…`,
  borné par empreinte, 11/11 sur le banc, persistance reconfirmée hors
  transaction. Le compteur reste **calculé** : il choisit l'action du moment.
- La Server Action a cessé de faire `{ ok: true, ...result }`. **C'est ce
  spread qui publiait le champ** ; il est remplacé par une projection explicite
  de cinq champs. Les deux barrières sont indépendantes.
- 14 tests versés, dont un runner négatif — l'action n'en avait aucun.

Aucun déploiement n'était requis : vérifié sur tout le dépôt, le navigateur ne
lit que `status`, `hours_left`, `action` et `action_url`.

**Ce qui reste ouvert — la limite d'IP.** Elle n'a pas été posée, et pas par
oubli : le patron de ses deux sœurs **ne transpose pas**. `playGameAction` et
`registerWinnerAction` comptent les lignes de `winners` qu'elles écrivent
elles-mêmes ; `check-replay` n'écrit rien. Un énumérateur ne créerait aucune
ligne, et le compteur ne bougerait jamais. Copier le patron aurait donné une
garde qui ne bloque rien — et une ligne verte de plus dans ce tableau.

Il reste donc une divulgation bornée à un bit par requête (`too_soon` =
« cette adresse a joué récemment »), **inerte tant que 0 jeu sur 9 n'active la
rejouabilité**. Les trois options chiffrées et la recommandation sont dans
`application-check-replay.md` — décision en attente.

### Zone 2 — cinq modules sans aucun appelant

Confirmés hors d'atteinte **par le manifeste**, pas seulement par l'analyse
d'imports : `admin`, `get-customers-page`, `liberer-fenetre-suppression`,
`player`, `save-marketing-winner`.

Deux méritent d'être nommés :

- **`player.ts`** porte un second `registerWinnerAction` qui insère directement
  dans `winners` — sans anti-rejeu, sans décrément de stock, sans borne au jeu,
  sans expiration. Un distributeur de tickets gagnants, endormi.
- **`admin.ts`** : `getAdminWinners()` rend les gagnants de **tous** les
  restaurants — un vestige d'avant le multi-tenant.

Ils ne sont pas un défaut aujourd'hui. Ils le deviennent le jour où un
composant les importe, sans qu'aucune erreur ne s'affiche.

### Zone 3 — les seize autres, gardées mais inégalement prouvées

---

## Ce qui est prouvé, et ce qui ne l'est pas

**9 des 25 actions à clé de service ont un test qui les exerce.** Les 16 autres
sont gardées — l'inventaire le confirme — mais rien ne le vérifie.

| Action | Test |
|---|---|
| `admin-actions` | `suppressions-fail-closed.test.ts` |
| `check-replay` | `check-replay.test.ts` |
| `create-game` | `create-game.test.ts` |
| `delete-restaurant-full` | `delete-restaurant-full.test.ts` |
| `delete-sales-user` | `suppressions-fail-closed.test.ts` |
| `google-business` | `avis-lecture.test.ts` |
| `repair-orphans` | `suppressions-fail-closed.test.ts` |
| `update-game` | `update-game.test.ts` |
| `validate-win` | `validate-win.test.ts` |

Les seize sans test, par ordre d'exposition :

| Action | Garde déclarée | Pourquoi ça compte |
|---|---|---|
| `play-game` | aucune (par conception) | joignable sans compte, bornée par sa RPC |
| `register-winner` | aucune (par conception) | idem |
| `set-subscription` | rôle | change la date de fin d'abonnement d'un restaurant |
| `create-restaurant` | rôle | crée un tenant |
| `update-restaurant-email` | rôle | change l'adresse d'un compte |
| `delete-winner` | rôle | **supprime un ticket physiquement** |
| `export-customers-csv` | rôle | sort une liste nominative complète |
| `get-winners-page` | rôle | liste nominative |
| `get-sales-data` | rôle | données commerciales |
| `get-winner-info` | rôle | lecture d'un ticket |
| `update-restaurant-settings` | rôle | réglages du tenant |
| `log-system-error` | rôle | écrit dans le journal |
| `admin` | rôle | code mort |
| `get-customers-page` | aucune | code mort |
| `liberer-fenetre-suppression` | rôle | code mort |
| `player` | aucune | code mort |

**« Sans test » ne veut pas dire « sans garde ».** Les gardes sont lues et
présentes. Ce qui manque, c'est la preuve qu'elles refusent réellement — et
l'expérience de ce chantier est qu'une garde non éprouvée se révèle fausse une
fois sur cinq.

---

## Le correctif `checkReplayStatusAction` — état au 19/08/2026

| | |
|---|---|
| Retirer `play_count` de la réponse | ✅ **appliqué en production** |
| Projection explicite dans l'action | ✅ **écrit, testé, non déployé** |
| Limite d'IP | ❌ **non posée** — le patron des sœurs ne transpose pas |

Détail et décision en attente : `application-check-replay.md`.

---

## Ce que cet audit ne dit pas

- Il ne juge pas les **routes API** (`app/api/**`) ni les **pages serveur**, qui
  tiennent aussi la clé. Elles sont joignables par URL et relèvent du middleware
  et de leurs propres gardes — c'est un périmètre distinct, non couvert ici.
- Il ne rejoue aucune garde. Il constate lesquelles sont prouvées.
