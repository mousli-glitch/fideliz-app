# Matrice RLS — 16 tables, 7 rôles, 4 opérations

Mesurée le **18/08/2026** sur la branche `bngtokpnuebvvxbtnayn`, après les
migrations `20260818010000` (durcissement) et `20260818011000` (RLS).
Rejouable : `supabase/verifications/matrice-rls-complete.sql`.

**Aucune donnée modifiée** : chaque sonde exécute l'opération, relève
`row_count`, puis annule le sous-bloc. Compteurs identiques avant et après —
2 contacts, 2 avis, 2 notes, 1 rattachement, 2 traces, 2 tickets, 2 archives,
2 restaurants, 5 profils, 0 ligne intruse.

## Lecture

`SELECT/INSERT/UPDATE/DELETE`. `DENY` = 42501 (GRANT **ou** RLS).
`E23502` = NOT NULL — **le GRANT et la RLS ont laissé passer**, seule
l'intégrité a arrêté l'écriture. Un chiffre = lignes touchées puis annulées.

| Table | anon | sans rattach. | A | B | commercial | root | service_role |
|---|---|---|---|---|---|---|---|
| activity_logs_legacy | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/E23502/0/0 | 0/E23502/0/0 |
| auth_ghosts_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 |
| auth_orphan_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 |
| avis | 0/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | **0**/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | 2/E23502/2/2 |
| contacts | 0/DENY/0/0 | 0/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | **0**/DENY/0/0 | 2/E23502/2/2 | 2/E23502/2/2 |
| contacts_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 |
| crm_notes | 0/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | **0**/DENY/0/0 | **2/E23502/2/2** ⚠ | 2/E23502/2/2 | 2/E23502/2/2 |
| games | 0/DENY/DENY/DENY | 0/DENY/0/0 | **1**/DENY/1/0 | **1**/DENY/1/0 | 1/DENY/0/0 | 2/E23502/2/2 | 2/E23502/2/2 |
| prizes | 0/DENY/DENY/DENY | 0/DENY/0/0 | **1**/DENY/1/1 | **1**/DENY/1/1 | 1/DENY/0/0 | 2/DENY/0/0 | 2/E23502/2/2 |
| profiles | 0/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | **1**/DENY/0/0 | 5/DENY/0/0 | 5/E23502/5/5 |
| restaurants | 0/DENY/DENY/DENY | 0/DENY/0/0 | **1/DENY**/1/1 | **1/DENY**/1/1 | 1/DENY/0/0 | 2/E23502/0/0 | 2/E23502/2/2 |
| sales_restaurants | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | **1**/DENY/0/0 | 1/E23502/1/1 | 1/E23502/1/1 |
| system_logs | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 2/E23502/2/2 |
| winners | DENY×4 | DENY×4 | DENY×4 | DENY×4 | DENY×4 | DENY×4 | 2/E23502/2/2 |
| winners_archive | 0/DENY/0/0 | 0/DENY/0/0 | **0**/DENY/0/0 | **0**/DENY/0/0 | 0/DENY/0/0 | 2/E23502/2/2 | 2/E23502/2/2 |
| winners_backup | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/DENY/0/0 | 0/1/0/0 | 0/1/0/0 |

## Ce que la migration corrective a fermé

- **`profiles`** — chacun ne voit que le sien ; root voit les cinq. Avant, les
  six comptes connectés voyaient les cinq. Aucune écriture possible pour
  personne : la RLS refuse, faute de policy d'écriture.
- **`restaurants`** — **INSERT `DENY` pour A, B, le commercial et le compte
  sans rattachement.** Avant, tous créaient. A et B modifient et suppriment
  toujours **leur** restaurant : le dashboard est intact.
- **`winners`** — refusée à tous, root compris. Conforme à la production.
- **Les quatre tables de sauvegarde** — refusées à tous sauf `service_role`.
  Elles portent des données personnelles réelles en production.

## Isolation A/B — vérifiée là où elle est mesurable

`contacts`, `games`, `prizes`, `profiles`, `restaurants` : A voit 1, B voit 1,
jamais celui de l'autre. `crm_notes`, `winners_archive`, `avis`,
`sales_restaurants`, `system_logs` : A et B voient **0**.

Le commercial ne voit **aucun contact** — la règle métier « commercial sans
données clients » est respectée. Il voit son unique rattachement dans
`sales_restaurants`, et le restaurant et le jeu du tenant A auquel il est
rattaché.

## Trois constats qui ne sont PAS des régressions, et qu'il faut dire

**⚠ `crm_notes` — accès transversal du commercial.** Il lit, modifie et
supprimerait les **2** notes, y compris celle du tenant B auquel il n'est pas
rattaché. La policy `sales_manage_notes` porte `using (is_sales() or
is_root())`, sans aucun filtre de rattachement.

C'est un défaut réel, **antérieur** et **hors du périmètre de ce hotfix**, qui
vise `profiles` et `restaurants`. Il est consigné ici pour être traité
séparément, conformément à la consigne de ne rien mélanger.

**`avis` invisible au restaurateur.** Personne ne lit `avis` par la RLS, pas
même root — seul `service_role` y accède. Ce n'est pas une fuite mais une
fermeture : le dashboard doit lire les avis côté serveur. État antérieur,
inchangé par ce hotfix.

**root ne modifie pas `restaurants` dans la matrice.** `0` en UPDATE/DELETE.
La cause est le fixture, pas le code : les policies `Super Admin Restaurants
*` reposent sur un UUID codé en dur (`04eb7091…`) qui est le root réel de
production. Notre root synthétique ne l'est pas et ne possède aucun
restaurant. **En production, ce chemin fonctionne.** Il n'est donc pas prouvé
par cette matrice, et c'est une raison de plus d'exiger la traversée
applicative avant tout GO.

## Limite de la sonde, à connaître avant de la relire

L'INSERT est tenté par `default values`. Sur une table dont la policy exige un
rattachement, la ligne vide ne satisfait pas le `with check` et rend `DENY` :
on ne distingue pas « pas le droit » de « la ligne ne convenait pas ». Pour la
question qui nous occupe — personne ne doit créer de restaurant — les deux
mènent au même refus, mais ce `DENY` ne prouve pas une absence de privilège.

## Le piège du premier passage

Au premier tour, **sept tables étaient vides** : `contacts`, `avis`,
`crm_notes`, `sales_restaurants`, `system_logs`, `winners`,
`winners_archive`. Tous les rôles y rendaient `0`, et ce `0` ne prouvait que
la vacuité de la table. Une matrice sur des tables vides dit oui à tout.

Le semis d'une ligne par tenant a été ajouté, et c'est lui qui a fait
apparaître l'accès transversal du commercial sur `crm_notes`. Sans lui, la
matrice serait passée au vert en ne prouvant rien.
