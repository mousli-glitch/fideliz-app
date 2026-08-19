# Anonymisation des archives et déduplication des tâches — trace d'application

**Appliqué le 19 août 2026 en production.** Autorisation explicite de Samy.

---

## 1. L'archive cesse d'échapper à l'anonymisation

### Le défaut

`anonymize_expired_data()` mettait à jour `winners` et `contacts`. Elle ne
regardait **jamais** `winners_archive`. Or `archive_redeemed_winners(90, …)`
sort les tickets consommés au bout de 90 jours — bien avant les 24 mois de
l'anonymisation.

Un ticket consommé partait donc à l'archive à trois mois, et n'était plus
jamais anonymisé.

### Ce que j'ai fait, et ce que j'ai refusé de faire

« Anonymise les archives » recouvre deux opérations très différentes. J'ai
choisi la première et écarté la seconde :

| | |
|---|---|
| ✅ **Étendre la règle** à la table qui y échappait | 0 ligne change aujourd'hui — aucun ticket archivé n'a 24 mois |
| ❌ **Anonymiser les 37 lignes maintenant** | détruirait des données **avant** l'échéance de leur propre règle |

La seconde est une décision distincte, qui rendrait une donnée irrécupérable
plus tôt que la politique ne l'exige. Elle n'a pas été prise. Si c'est ce que
tu voulais, dis-le et je la traiterai comme telle.

### La fenêtre : `redeemed_at`, et non `expires_at`

Sur `winners`, la fenêtre court depuis `coalesce(expires_at, created_at)`.
`winners_archive` ne porte pas `expires_at` — l'archivage ne le recopie pas.

On compte donc depuis `coalesce(redeemed_at, created_at)`, la même date qui
gouverne déjà l'archivage de cette ligne. Et comme `redeemed_at` précède
toujours `expires_at`, la fenêtre est **plus stricte, jamais plus laxe**. Pour
de la donnée personnelle, c'est le seul sens d'erreur acceptable.

### Ce qui a été exécuté

```
anonymize_expired_data   485677ce…  919 car.  →  3b6d8f88…  1618 car.
```

Bornée par empreinte : tout corps autre que la préimage auditée ou le corrigé
est refusé. Transaction bornée, verrou consultatif, manifeste et droits relus
après le `revoke`/`grant`.

**Deux garanties vérifiées dans la transaction :**

- les **deux règles d'origine** sont intactes — cette migration étend, elle ne
  remplace pas ;
- **aucune donnée n'a bougé** : nombre de lignes et nombre d'enregistrements
  encore nominatifs, comparés avant et après. Un seul écart annulait tout.

### État après application

| | |
|---|---|
| Tickets archivés | 37 |
| Encore nominatifs | 37 |
| **Éligibles à l'anonymisation ce soir** | **0** |

Le correctif est **inerte à l'arrivée et correct pour toujours**. Le plus ancien
ticket archivé a 11 mois ; le premier sera anonymisé dans treize mois, tout
seul.

### Preuve

`harnais-taches-planifiees.sql` étendu, joué sur le banc : **6/6** sur le cas
qui n'existait pas.

- une archive de 30 mois est anonymisée, e-mail effacé ;
- une archive de **11 mois est intacte** — rien n'est détruit en avance ;
- le compte rendu annonce l'archive traitée ;
- rejouée, elle ne retouche rien.

---

## 2. Quatre tâches d'archivage ramenées à une

### L'état trouvé

| jobid | Nom | Cadence | Commande |
|---|---|---|---|
| 2 | `archive_redeemed_winners_daily` | `10 3 * * *` | `archive_redeemed_winners(90, 5000)` |
| 3 | `archive-winners-daily` | `0 3 * * *` | la même |
| 4 | `archive_redeemed_winners_daily_3am` | `0 3 * * *` | la même |
| 6 | `archive_winners_daily` | `0 3 * * *` | la même |
| 7 | `anonymisation-rgpd` | `0 3 * * *` | `anonymize_expired_data()` |

Quatre noms différents pour la même commande — une accumulation de « j'ajoute
le cron » au fil du temps. Trois d'entre elles se déclenchaient **à la même
minute**, sur les mêmes lignes.

### Ce qui a été gardé, et pourquoi

**jobid 2**, celle de `10 3 * * *`. Ce choix fait deux choses d'un coup :

1. il déduplique — une seule tâche d'archivage au lieu de quatre ;
2. il **sépare** l'archivage de l'anonymisation, qui tourne à `0 3`.

L'ordre qui en résulte est le bon : on anonymise d'abord ce qui a dépassé sa
fenêtre, on archive dix minutes plus tard. Un ticket qui franchit les 24 mois
est donc anonymisé avant de partir à l'archive — et s'il y est déjà, la
nouvelle clause l'y rattrape.

Garder l'une des trois de `0 3` aurait laissé archivage et anonymisation se
disputer les mêmes lignes à la même seconde.

### Garde-fous posés avant de désinscrire

L'opération refusait de s'exécuter si l'état ne correspondait pas exactement à
l'audit : cinq tâches au départ, les trois à retirer portant bien la même
commande **et** la même cadence, et celle à conserver étant bien la bonne. Le
résultat est vérifié dans la même transaction — deux tâches, une de chaque.

### État après

```
jobid 7   anonymisation-rgpd               0 3 * * *   anonymize_expired_data()
jobid 2   archive_redeemed_winners_daily  10 3 * * *   archive_redeemed_winners(90, 5000)
```

---

## Ce qui n'a pas été touché

Les quatre tables de sauvegarde. Elles attendent toujours une décision — voir
`decision-tables-de-sauvegarde.md`. Rien n'y a été anonymisé, supprimé ni
déplacé, y compris sur le banc.
