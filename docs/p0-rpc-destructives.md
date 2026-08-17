# P0 — deux RPC destructives appelables par n'importe qui

Trouvé, corrigé et vérifié le **18/08/2026**.
Migration `20260817235046_rpc_destructives_hors_de_portee`.

## Ce qui était ouvert

Vérifié avec la **clé publiable** — celle qui part dans le navigateur de
chaque visiteur, sans aucune session :

```
POST /rest/v1/rpc/archive_redeemed_winners  → HTTP 200
POST /rest/v1/rpc/_log_event                → HTTP 204
```

`archive_redeemed_winners(p_days, p_batch)` déplace des tickets vers
`winners_archive` **et les supprime de `winners`**. Elle est `SECURITY
DEFINER` : la RLS ne l'arrête pas.

Un appel anonyme `{"p_days":0,"p_batch":5000}` aurait retiré les **355
tickets `redeemed`** des trois vrais restaurants.

Les données n'auraient pas été perdues — elles partent dans une table
d'archive. Mais **`/verify/<uuid>` lit `winners`** : des tickets imprimés,
dans les mains de clients, auraient affiché « QR Code Inconnu ». C'est
exactement ce que toute cette mission protège.

`_log_event` écrit une ligne arbitraire dans `system_logs` : noyage du
journal, et injection de contenu dans un endroit qu'on relit en cas
d'incident.

## Le piège : `REVOKE FROM anon` n'aurait rien fermé

C'était mon premier réflexe, et il était faux. Les privilèges effectifs,
relevés avant correction :

| Fonction | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|
| `archive_redeemed_winners` | **oui** | oui | oui | oui |
| `_log_event` | **oui** | oui | oui | oui |

`EXECUTE` était accordé à **`PUBLIC`**, dont `anon` hérite. Retirer le droit
nominatif d'`anon` en laissant celui de `PUBLIC` aurait produit un correctif
qui passe la relecture d'intention et laisse la porte grande ouverte.

Il faut retirer le droit de `PUBLIC` **et** les nominatifs — sans quoi un
`GRANT` explicite subsisterait derrière.

## Ce qui continue de fonctionner

Le propriétaire des deux fonctions est `postgres`, et **un propriétaire
conserve toujours `EXECUTE`** : aucun `REVOKE` ne le lui retire.

Les cinq tâches `pg_cron` s'exécutent sous `username = 'postgres'` — vérifié
dans `cron.job`. L'archivage nocturne et l'anonymisation RGPD tournent
exactement comme avant.

Aucun code applicatif n'appelle ces fonctions : **zéro occurrence** dans
`app/`, `components/`, `lib/`, `utils/`. Le retrait à `service_role` est donc
gratuit — c'est le périmètre le plus étroit qui reste correct.

## Preuves, après application

| Contrôle | Résultat |
|---|---|
| `archive_redeemed_winners`, appel anonyme | **HTTP 401** · `42501 permission denied` |
| `_log_event`, appel anonyme | **HTTP 401** · `42501 permission denied` |
| Privilèges effectifs PUBLIC / anon / authenticated / service_role | **false** sur les quatre |
| Privilège de `postgres` (rôle de `pg_cron`) | **true** — préservé |
| Tâches cron actives | **5**, inchangé |
| `winners` | **468**, inchangé |
| tickets `redeemed` | **355**, inchangés — aucun déplacement |
| `winners_archive` | **37**, inchangé |
| Ligne écrite par la sonde refusée | **0** — le refus n'insère rien |
| Témoins QR, cinq parcours | **GO** |
| Sondes de sécurité applicatives | **9/9** |
| `/verify` d'un ticket réel | rend toujours `DÉJÀ UTILISÉ`, prénom minimisé |

## La ligne de sonde dans `system_logs`

Ma vérification d'avant-correctif a **inséré une ligne** dans `system_logs` :
`action_type = 'sonde.securite'`, message inerte, aucune donnée personnelle.
C'est une écriture de production, faite pour établir la faille.

Samy a validé son maintien. Elle reste comme **trace du test autorisé** — la
supprimer serait une seconde écriture, et son absence documenterait moins
bien que sa présence.

La sonde d'après-correctif, elle, n'a **rien écrit** : elle a été refusée.

## Audit des 22 fonctions — ce qu'il en ressort

**Correctement verrouillées** (`service_role` seul) : `play_game`,
`register_win`, `get_replay_status`, `anonymize_expired_data`,
`get_sales_stats`. Les RPC du jeu passent par le serveur, jamais par le
navigateur.

**Ouvertes à `PUBLIC` mais inoffensives** : les cinq fonctions de trigger
(`handle_new_user_profile`, `handle_deleted_commercial`,
`fn_audit_restaurant_changes`, `trg_log_profile_active`,
`trg_log_restaurant_block`). PostgreSQL refuse d'appeler directement une
fonction qui renvoie `trigger` ; PostgREST ne les expose pas.

**Ouvertes à `PUBLIC`, en lecture seule** : les aides de policy
(`is_root`, `is_sales`, `current_role`, `current_restaurant_id`,
`is_restaurant_user`) et `check_restaurant_status`. `SECURITY INVOKER` pour
les premières : elles s'exécutent avec les droits de l'appelant.

**Reste à durcir — non bloquant, à traiter sur la branche** : quatre
fonctions n'ont **aucun `search_path`** figé, dont deux en `SECURITY
DEFINER` (`fn_audit_restaurant_changes`, `handle_deleted_commercial`). Un
`search_path` absent sur une fonction `DEFINER` est une voie d'élévation
connue. Exploitation difficile ici — ce sont des fonctions de trigger, dont
l'une n'est attachée à rien — mais c'est une correction à faire.
