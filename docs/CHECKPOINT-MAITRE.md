# Checkpoint maître — fusion Fideliz → Cartiz

Écrit le **18/08/2026 vers 02 h 20** (Paris). Aucun secret, aucune donnée
personnelle. À lire en premier si le contexte a été réduit.

## Où en est la production

**Fideliz** (`kzeuplszcqjqaqohfbzk`) — application sur `a475a03`, déployée.
Trois modifications de base autorisées et appliquées, rien d'autre :

| Version | Nom | Effet |
|---|---|---|
| `20260817230642` | `role_jamais_depuis_les_metadonnees` | le rôle d'un nouveau compte ne vient plus de `raw_user_meta_data` |
| `20260817235046` | `rpc_destructives_hors_de_portee` | `REVOKE` sur `archive_redeemed_winners` et `_log_event`, y compris à `PUBLIC` |
| *(config Auth)* | — | `disable_signup: true`, basculé par Samy dans le tableau de bord |

**Cartiz** (`rxdbotnuwfakukcbgeqo`) — intacte. Rien n'y a été modifié.

**Une écriture de production assumée** : une ligne `system_logs` avec
`action_type = 'sonde.securite'`, trace du test qui a établi la faille RPC.
Samy a validé son maintien.

## Git

| Dépôt | Branche | Dernier commit |
|---|---|---|
| `fideliz-app` | `feat/fusion-fideliz` | voir `git log -1` |
| `fideliz-app` | `main` | `a475a03` = ce qui tourne en production |
| `cartiz` | `feat/fusion-fideliz` | `49206fe` |

Tag `securite-2026-08-18` sur la version de sécurité en production.

⚠ **Sur `fideliz-app`, pousser sur `main` DÉPLOIE en production.** Deux
déploiements non prévus le 18/08 pour cette raison. `npm run avant-push`
avertit désormais. **Aucun travail de fusion sur `main`.**

## Branche Supabase temporaire

| | |
|---|---|
| Référence | `bngtokpnuebvvxbtnayn` (`fusion-tests`) |
| Créée | 18/08 à **01 h 59** · Micro · `with_data = false` |
| Échéance des 72 h | **21/08 à 01 h 59** |
| Coût | 0,013 44 $/h — **≈ 0,15 $ consommés** sur 0,97 $ prévus |
| Suppression | `delete_branch` sur `5aeec608-4c2b-49c6-9cc6-ea4e0d00d300` |

Statut `MIGRATIONS_FAILED` — **normal et attendu** : le provisionnement rejoue
les 8 migrations du parent sur une base vierge, et la première échoue faute
de baseline. La base est saine et utilisable ; PostgREST, Auth et Storage
répondent. `pg_cron` **absent** (6 extensions contre 7).

## Ce qui est prouvé

- Reconstruction sur base vierge avec le **vrai runner** (`supabase db push`) :
  baseline + 7 migrations appliquées, **16 tables, 43 policies publiques**,
  registre dans l'ordre avec `00000000000000` en tête.
- **Rollback total** d'une migration qui échoue : 0 table, 0 entrée.
- **Aucune migration marquée** après un échec.
- Registre de production **réconcilié** avec Git : `npm run migrations:reconcilier` → 0 écart.
- **79 tests** verts · **5 témoins QR** en GO · **9 sondes de sécurité** conformes.
- Sauvegarde logique vérifiée : 2 980 lignes, 20 fichiers, empreintes relues,
  permissions `700`/`600`.

## Diff sémantique — VERT le 18/08

**Dix dimensions sur onze identiques à la production**, reconstruites par le
vrai runner depuis une base réellement vierge : colonnes, contraintes,
fonctions, index, policies, RLS, triggers, vues, ACL des relations, ACL des
fonctions. Détail et empreintes : `docs/diff-semantique.md`.

La onzième — les privilèges par défaut — ne peut pas devenir verte : trois
entrées appartiennent à `supabase_admin`, dont `postgres` n'est pas membre.
Elles sont **inertes** (aucun objet de `public` ne lui appartient), et l'ACL
effectif des 20 relations est identique des deux côtés. Écart borné, pas ignoré.

Quatre défauts trouvés et corrigés : le trigger `on_auth_user_created` absent
(sans lui, aucun profil créé au premier compte), le nom de la clé primaire de
`activity_logs_legacy`, huit corps de fonction cosmétiquement divergents, et
les policies Storage qui empêchaient tout rejeu.

## Matrice A/B — les vues classées le 18/08

Aucune écriture anonyme n'aboutit ; aucune mutation de A sur les données de B.
Les droits DML des quatre vues sont **inertes** (`security_invoker`) :
**défaut d'hygiène, pas vulnérabilité**. Détail : `docs/matrice-ab-tenants.md`.

Deux points restent au lot RLS : n'importe quel compte authentifié crée des
restaurants (`"Sales can create restaurants"`, `with check (true)`), et la
lecture de tous les profils vient de **trois** policies `using (true)`, pas
d'une — `temp_open_profiles`, `final_profile_access_v3`, `global_nav_profiles`.

## État de la baseline

`supabase/migrations/00000000000000_baseline_fideliz.sql` — **22 fonctions**,
15 tables (+ `avis` par la 1re migration = 16), 51 policies, 5 triggers,
4 vues, contraintes, index, grants, 2 buckets. Aucun secret.

Elle décrit l'état **antérieur au 24/07/2026**, pour que les 8 migrations
verbatim se rejouent dessus — double preuve.

**Les défauts historiques sont conservés volontairement** : deux `CHECK`
contradictoires sur `winners`, double clé étrangère sur `created_by`,
4 policies fautives, 4 fonctions sans `search_path`, `get_sales_stats` qui
appelle une fonction inexistante, `fn_audit_restaurant_changes` qui insère
dans une table absente.

## Prochaine commande sûre

⚠ **`reset_branch` ne rejoue PAS les fichiers du dépôt** : il rejoue les
instructions stockées dans le registre de la branche. Il remet donc l'ANCIENNE
baseline. Pour éprouver une baseline corrigée, il faut vider les objets à la
main — schéma `public`, policies de `storage`, privilèges par défaut, registre
— puis pousser. La séquence est dans `docs/diff-semantique.md`.

```bash
# page blanche réelle, puis rejeu SANS le gel
cd /Users/samy/fideliz-app
mkdir -p .gel-en-attente && mv supabase/migrations/20260818020000_gel_de_bascule.sql .gel-en-attente/
npx supabase@2.114.0 db push --project-ref bngtokpnuebvvxbtnayn --include-all --yes
mv .gel-en-attente/*.sql supabase/migrations/ && rmdir .gel-en-attente
# puis empreintes.sql sur les deux bases
```

## Interdictions en vigueur

1. **Aucun `migration repair` en production** tant que baseline + 8 n'a pas
   reproduit la production. Le dry-run a montré que `db push` **exécuterait**
   la baseline : ne jamais l'utiliser ainsi sur la production.
2. **Aucune bascule de production** avant verdict GO et autorisation de Samy.
3. **Aucun push sur `main`** de `fideliz-app`.
4. **Aucune donnée réelle** sur la branche synthétique.
5. **Aucun compte créé** en production.

## Anomalies restantes, non bloquantes pour la branche

- **Fuite inter-tenant** : les 7 comptes restaurateurs lisent les 9 profils
  (`temp_open_profiles` et deux jumelles) et peuvent insérer des restaurants
  (`"Sales can create restaurants"` avec `with check (true)`). **NO-GO pour la
  production fusionnée.** Correction sur la branche, avec la matrice complète.
- 4 tâches cron dupliquées, 3 à la même heure.
- 4 fonctions sans `search_path` figé — non exploitables, prouvé.
- 8 alertes de design antérieures, à traiter avec la charte de fusion.
- Écritures pendant la fenêtre de bascule : tranché par Samy — **fenêtre
  fermée**, 6 h à 8 h, préavis 48 h, sans outil de rejeu en V1.

## Ce qui reste à faire

1. ~~Reset + replay baseline + 8 · diff structurel complet~~ **fait, vert**
2. Durcissement des privilèges par défaut, puis sentinelles
3. Gel séparément, delta attendu seul
4. `migration repair` en production, puis **deuxième branche** comme preuve du
   bootstrap automatique
5. Matrice RLS complète, Auth, Storage, RPC, rollback chronométré
6. Phase 2 : `CLAUDE.md`, modules et entitlements, marque Fideliz, charte
   blanc/orange `#F5821E`, portage jeux et avis, migrateur idempotent,
   dry-runs, réconciliation, verdict
