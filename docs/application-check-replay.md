# `checkReplayStatusAction` — trace d'application

**Appliqué le 19 août 2026 en production.** Autorisation explicite de Samy
(« applique le correctif de check-replay »).

---

## 1. L'oracle de participation cesse de compter — FAIT

### Le défaut

`get_replay_status` est appelée par une Server Action **joignable sans
compte** — c'est sa raison d'être : un joueur n'en a pas. Elle rendait :

```
{ replay: true, status: 'ok', play_count: N, action, action_url }
```

Les identifiants de jeu sont publics : ils sont dans la page. N'importe qui
pouvait donc demander, pour **une adresse e-mail quelconque**, combien de fois
cette personne avait joué chez ce restaurant.

### Ce qui a été exécuté

```
get_replay_status   300d8bba…  1556 car.  →  1e372cca…  1822 car.
```

Bornée par empreinte : tout corps autre que la préimage auditée ou le corrigé
est refusé. Transaction bornée (`lock_timeout` 5 s, `statement_timeout` 60 s),
verrou consultatif, manifeste et droits relus **après** le `revoke`/`grant`.

Cinq garanties vérifiées **dans** la transaction, puis reconfirmées dans un
appel séparé — un `execute_sql` enveloppe tout l'appel, seule une relecture
indépendante prouve la persistance :

| | |
|---|---|
| `play_count` retiré des deux retours `status:'ok'` | ✅ |
| Le compteur reste **calculé** (`v_count % v_len` choisit l'action) | ✅ |
| `hours_left` / `too_soon` intacts — c'est la fonctionnalité | ✅ |
| Droits inchangés : `service_role` seul, ni `anon` ni `authenticated` | ✅ |
| Données non touchées : 497 gagnants, 9 jeux, avant = après | ✅ |

### Preuve

Jouée sur le banc synthétique avant la production : **11/11**, avec les deux
polarités. Le « avant » mesure `play_count: 3` réellement rendu ; le « après »
constate son absence, `status:'ok'` survivant, `action`/`action_url`
survivant, `too_soon` rendant `hours_left: 22`.

### Aucun déploiement n'était requis

Vérifié sur tout le dépôt : le navigateur ne lit que `ok`, `error`, `message`,
`status`, `hours_left`, `action`, `action_url`
(`components/game/public-game-client.tsx:297-320`). **Zéro lecteur** de
`play_count`. Le retrait est donc invisible pour le code en service.

### Aujourd'hui, c'était inerte

Mesuré : **0 jeu sur 9** a la rejouabilité active. La fonction court-circuite
sur `replay: false` avant toute lecture de `winners`. Le défaut était latent —
il se serait ouvert le jour où un restaurateur active la rejouabilité.

---

## 2. La seconde barrière, côté application — FAIT

`check-replay.ts` faisait `return { ok: true, ...result }`. **C'est le spread
qui publiait `play_count`** : l'action relayait tout ce que la base décidait de
rendre, connu ou non du client.

Remplacé par une **projection explicite** de cinq champs. Les deux barrières
sont désormais indépendantes : si la RPC recommençait un jour à rendre ce
champ, il ne ressortirait pas de l'action pour autant.

**14 tests** versés (`app/actions/check-replay.test.ts`) — l'action n'en avait
aucun. La fausse base **ment délibérément dans le mauvais sens** : elle rend
encore `play_count`, comme avant la migration. Un test qui n'aurait exercé que
la base corrigée serait resté vert même si l'action redevenait un spread.

Runner négatif inclus : l'ancienne projection est rejouée sur les mêmes
réponses, et les assertions la démasquent — `play_count` présent, liste de clés
non close.

---

## 3. La limite d'IP — NON APPLIQUÉE, et pourquoi

C'était la seconde moitié du correctif annoncé : « aligner la limite d'IP sur
celle de ses deux sœurs publiques ». **En l'écrivant, j'ai constaté que le
patron des sœurs ne transpose pas.**

`playGameAction` et `registerWinnerAction` comptent ainsi :

```ts
const { count } = await supabaseAdmin
  .from('winners').select('id', { count: 'exact', head: true })
  .eq('ip_hash', ipHash).gt('created_at', since)
```

Elles comptent **les lignes qu'elles écrivent elles-mêmes**. `check-replay`
n'écrit rien : c'est une lecture pure, et `get_replay_status` ne fait que des
`select`. Un énumérateur qui l'appellerait dix mille fois créerait **zéro
ligne** dans `winners` — le compteur resterait à sa valeur d'origine et la
limite ne se déclencherait jamais.

Copier le patron aurait produit **une garde qui ne bloque rien**, et une ligne
verte de plus dans le tableau d'audit. C'est précisément le défaut que ce
chantier traque depuis le début : une garde non éprouvée qui se révèle fausse.

### Ce qu'il faudrait vraiment, et ce que ça coûte

Aucune table de limitation n'existe : les 16 tables publiques ont été
inventoriées, il n'y a rien de tel.

| Option | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **A — table dédiée** | limite réelle, prouvable, testable | **nouvelle table en production** (migration additive) + purge dans le cron. Auto-bornée : on n'insère que tant qu'on est sous le seuil, donc au plus 5 lignes par IP et par heure |
| **B — compteur en mémoire** | ralentit une rafale sur une instance chaude | aucune garantie : Vercel réinstancie, le compteur repart. Invérifiable, donc indéfendable dans un audit |
| **C — ne rien poser** | statu quo | la divulgation résiduelle `too_soon` reste non bornée le jour où la rejouabilité est activée |

**Ce qui reste divulgué aujourd'hui, sans limite** : `too_soon` +
`hours_left` répond « cette adresse a joué récemment ici ». C'est un bit par
requête, contre un bit + un compte avant le correctif. Et c'est **inerte tant
qu'aucun jeu n'active la rejouabilité** — 0 sur 9 au 19/08/2026.

**Recommandation : option A, mais pas aujourd'hui.** Elle vaut d'être posée
avant qu'un restaurateur active la rejouabilité, pas avant. Créer une table en
production dépasse ce qui avait été décrit, donc rien n'a été fait.

**Décision en attente de Samy.**
