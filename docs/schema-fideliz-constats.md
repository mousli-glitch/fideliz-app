# Schéma Fideliz — ce que l'extraction a trouvé

Relevé du **18/08/2026** sur le projet de production `kzeuplszcqjqaqohfbzk`.

Fideliz n'a **aucun dossier de migrations** : son schéma a été construit à la
main dans le tableau de bord Supabase, et il n'existe nulle part sous forme
versionnée. L'extraction se fait donc objet par objet, en interrogeant
`pg_catalog` — il n'y a pas de `pg_dump` disponible sur cette machine.

## Inventaire

| Objet | Nombre |
|---|---|
| Extensions | 7 — `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` |
| Types / enums | **0** |
| Tables | 16 (dont 4 tables de sauvegarde datées) |
| Vues | 4 |
| Fonctions | 22 |
| Triggers (schéma `public`) | 5 |
| Policies RLS | 51 |
| Index | 45 |
| Buckets Storage | 2 |

**Aucune des 22 fonctions ne contient de secret** — vérifié par motif sur clés,
jetons, mots de passe et URLs de projet.

## Quatre défauts trouvés en chemin

Aucun n'est exploitable à distance aujourd'hui. Trois sont des choses qui
**ne fonctionnent pas** depuis toujours et que personne n'a vues, parce
qu'elles échouent en silence.

### 1. `get_sales_stats()` ne peut pas s'exécuter

La fonction appelle `get_my_role()`, **qui n'existe pas** dans la base. Tout
appel lève une erreur. C'est la RPC qui devait donner à un commercial les
volumes de ses restaurants.

### 2. `fn_audit_restaurant_changes()` écrit dans une table absente

Elle insère dans `public.activity_logs`. La table s'appelle
`activity_logs_legacy` — `activity_logs` **n'existe pas**. L'insertion est
enveloppée dans `EXCEPTION WHEN OTHERS THEN RETURN NEW`, donc l'échec est
avalé.

Elle n'est de toute façon **attachée à aucun trigger** : elle ne s'exécute
jamais. Le journal d'audit des blocages de restaurant qu'elle prétend tenir
n'a jamais reçu une ligne.

### 3. `winners` porte deux contraintes CHECK qui se contredisent

```
check_winner_status   →  available | redeemed | consumed
winners_status_check  →  available | redeemed
```

Les deux s'appliquent : leur intersection interdit `consumed`. Or
`archive_redeemed_winners()` archive explicitement les tickets
`status = 'consumed'` — un état qu'aucune ligne ne peut atteindre. La colonne
`consumed_at` existe elle aussi, et reste vide.

### 4. ⚠ Le rôle d'un nouveau compte vient de ses propres métadonnées

`handle_new_user_profile()` est branchée sur la création d'un utilisateur Auth,
et écrit le profil ainsi :

```sql
coalesce(new.raw_user_meta_data->>'role', 'restaurant')
```

`raw_user_meta_data` est ce que **le client envoie au moment de l'inscription**
(`options.data` côté SDK). Si l'inscription publique est ouverte sur ce projet,
une inscription portant `{ "role": "root" }` produit un profil root — et
`profiles_role_check` accepte `root`.

Aujourd'hui, seuls `restaurant` et `sales` apparaissent dans les métadonnées
existantes, et il n'y a **qu'un seul compte root**. Rien n'indique que cela ait
été exploité.

**Ce point n'a pas été testé** : le vérifier demanderait de créer un compte, ce
que je ne fais pas. Deux choses à faire, dans cet ordre :

1. Vérifier dans le tableau de bord Supabase si *Enable email signups* est actif
   sur ce projet. Si oui, le risque est réel et immédiat.
2. Corriger la fonction pour qu'elle n'accorde jamais un rôle privilégié depuis
   les métadonnées — `'restaurant'` en dur, les autres rôles étant posés
   ensuite par une action gardée (ce que font déjà `masterCreateSalesAction` et
   `createRestaurantAction`).

Le correctif est une migration additive ; il attend l'arbitrage de Samy, parce
qu'il touche le parcours de création de comptes.

## Deux redondances, sans gravité

- `restaurants` porte **deux clés étrangères identiques** sur `created_by` :
  `fk_commercial` et `restaurants_created_by_fkey`.
- Quatre tables `*_backup_20260606` et `winners_backup_20260606` sont des
  sauvegardes manuelles restées en place. Elles portent des données
  personnelles réelles et ne sont référencées par aucun code.

## Ce qui est déjà bien fait

Il faut le dire aussi : `one_active_game_per_restaurant` est un **index unique
partiel** (`WHERE status = 'active'`) — la règle « un seul jeu actif par
restaurant » est garantie par Postgres, pas seulement par le code applicatif.
C'est exactement ce qu'il fallait, et c'est ce qui rendait la mine de
`toggleGameStatusAction` moins destructrice qu'elle n'aurait pu l'être.

`anonymize_expired_data()` applique des durées de conservation distinctes selon
le consentement marketing — 36 mois avec, 24 sans. C'est une vraie politique de
rétention, pas un effacement en bloc.

## État de l'extraction

| Section | État |
|---|---|
| Extensions | ✅ relevé |
| Tables, colonnes, défauts | ✅ relevé |
| Contraintes (PK, FK, unique, check) | ✅ relevé |
| Index | ✅ relevé |
| Vues | ✅ relevé |
| Triggers | ✅ relevé |
| Fonctions | ✅ 12 sur 22 extraites, 10 restantes |
| Policies RLS | ⏳ 51 à extraire |
| Grants | ⏳ |
| Buckets et policies Storage | ⏳ |
| Tâches `pg_cron` | ⏳ |

La baseline sera versionnée en `supabase/migrations/` une fois complète, puis
vérifiée par le critère de Samy : réinitialiser la branche, rejouer les
migrations, retrouver le même schéma.
