# Preuve — sentinelle durcie, 22 fonctions closes, découverte production

Mesuré le **18/08/2026 en soirée**, en réponse à l'audit indépendant du
rapport `20260818-claude-018`. Aucune donnée réelle modifiée, aucun secret.
Trois sources : production `kzeuplszcqjqaqohfbzk` (lecture seule uniquement),
branche synthétique déjà active `fusion-tests-2` (`vrbnbmiokzhmhbghhduh`,
mutations temporaires et nettoyées, vérifiées à 0 résidu après coup), dépôt
Git (lecture des migrations).

## 1. La sentinelle v1 rendait un faux vert — trois angles morts confirmés

Comme le pointait l'audit :

1. Relations existantes : grants **directs** seulement, pas les droits
   **effectifs** (PUBLIC, héritage de rôle).
2. Défauts : `defaclrole = 'postgres'` figé, tout autre propriétaire ignoré.
3. Défauts : `JOIN pg_namespace` (INNER) excluait les entrées **globales**
   (`defaclnamespace = 0`).

`supabase/verifications/sentinelle-privileges-anon.sql` réécrite : les
relations existantes se testent désormais par `has_table_privilege()` (la
primitive Postgres qui résout elle-même PUBLIC et l'héritage) ; les défauts
par `LEFT JOIN` + `defaclnamespace = 0 OR nspname = 'public'`, sans filtre de
propriétaire, avec `grantee = 0` (PUBLIC) et `pg_has_role(..., 'USAGE')`
(héritage) dans la condition.

## 2. Les 4 scénarios — l'ancienne requête et la nouvelle, mesurées côte à côte

Chaque scénario synthétique a été semé sur `fusion-tests-2`, mesuré avec le
texte EXACT de l'ancienne requête puis de la nouvelle, puis retiré avant le
suivant. Vérifié propre (0/0) avant le premier et après le dernier.

| # | Scénario | Ancienne détection | Nouvelle détection |
|---|---|---|---|
| 1 | Défaut, `postgres`, schéma `public`, accordé à **PUBLIC** | **0** (faux vert) | **1** — `postgres:public:PUBLIC:TRUNCATE` |
| 2 | Défaut, rôle de **plateforme** (`supabase_admin`), schéma `public`, direct à `anon`/`authenticated` — **cas réel, mesuré en PRODUCTION, pas simulé** | **0** (faux vert) | **6** — `supabase_admin:public:{anon,authenticated}:{REFERENCES,TRIGGER,TRUNCATE}` |
| 3 | Défaut, `postgres`, portée **globale** (`defaclnamespace = 0`) | **0** (faux vert) | **1** — `postgres:(global):anon:TRUNCATE` |
| 4 | Relation existante, TRUNCATE accordé à **PUBLIC** directement | **0** (faux vert) | **2** — `games:anon:TRUNCATE`, `games:authenticated:TRUNCATE` |

Le scénario 2 n'est pas une simulation : c'est l'état réel et actuel de la
production, retrouvé en interrogeant `pg_default_acl` en lecture seule. Le
durcissement déployé (`5094af3`) n'a neutralisé que l'entrée de `postgres` ;
celle de `supabase_admin` n'a jamais été touchée. Voir §5.

**Rejoué contre la production** : la nouvelle sentinelle lève effectivement
(`P0001`, 6 privilèges, détail ci-dessus) — elle qualifierait aujourd'hui la
production elle-même de non conforme sur cette dimension. C'est le
comportement voulu : elle ne doit pas fermer les yeux sur un écart réel sous
prétexte qu'il est ancien.

## 3. Preuve versionnée — ACL effective de `avis`

`supabase/verifications/preuve-acl-avis.sql` : `avis`, créée après les
défauts de la baseline et absente de tout `grant` explicite, porte en
production exactement `DELETE, INSERT, MAINTAIN, SELECT, UPDATE` pour
`anon`/`authenticated` (jamais TRUNCATE/TRIGGER/REFERENCES) et les 8 droits
pour `postgres`/`service_role`. Rejouable, lève sur tout écart.

## 4. Les 22 fonctions — verdict individuel, empreinte `prosrc` puis lecture brute

Comparaison production (`kzeuplszcqjqaqohfbzk`) contre `fusion-tests-2`
(reconstruction socle : baseline + migrations historiques jusqu'à
`20260817235046` incluse — **avant** durcissement/RLS/identité-root/gel,
volontairement, puisque ces couches se prouvent séparément). Empreinte
`md5(prosrc)` exacte d'abord, sur les 22 identités (schéma, nom, arguments).
**11 empreintes identiques, 11 différentes** — pas 9 : le compte du rapport
018 est corrigé par cette mesure, plus récente et plus complète.

Les 11 différentes ont été lues intégralement, caractère par caractère,
**aucun découpage sur les espaces, aucune normalisation artisanale.**

### 11 identiques exactement

`_log_event`, `anonymize_expired_data`, `check_restaurant_status()`,
`check_restaurant_status(slug_input text)`, `fn_audit_restaurant_changes`,
`get_replay_status`, `handle_new_user_profile`, `play_game`, `register_win`,
`trg_log_profile_active`, `trg_log_restaurant_block`.

### 9 différence de présentation démontrée — corps lu, fonctionnellement identique, `proconfig` identique

| Fonction | Nature de l'écart |
|---|---|
| `activate_game` | espaces de fin de ligne, une ligne blanche |
| `archive_redeemed_winners` | remise en forme des listes de colonnes (mêmes colonnes, même ordre) |
| `current_restaurant_id` | retours à la ligne + indentation vs espace unique |
| `get_sales_stats` | remise en forme (`r.id` sur la ligne du select, `and` regroupé) |
| `is_restaurant_user` | retours à la ligne vs espace unique |
| `is_root` | idem |
| `is_sales` | idem |
| `set_marketing_optin_at` | une ligne blanche en moins |
| `set_prize_initial_quantity` | trois lignes condensées en une |

Chacune vérifiée par lecture directe des deux textes, mise en correspondance
token par token à l'œil — pas par une regex de nettoyage.

### 2 différences réelles — entièrement attribuées à une couche déjà écrite, non encore appliquée sur ce socle

**`current_role()`** — le corps de la branche retire l'alias de table
(`select role from public.profiles where id = auth.uid()` au lieu de
`select p.role from public.profiles p where p.id = auth.uid()` ;
fonctionnellement équivalent, une seule table en jeu). Mais son `proconfig`
diffère réellement : branche = `search_path=public`, production =
`search_path=""` (figé, vide). **Attribué** : `20260818011000_rls_profils_et_restaurants.sql`
recrée `current_role()` avec `security definer` et `set search_path = ''` —
texte comparé caractère pour caractère à la définition live de production :
**identique**. La couche RLS n'étant pas appliquée sur ce socle, la fonction
y reste dans son état pré-durcissement. Rien d'ouvert.

**`handle_deleted_commercial()`** — écart réel dans le corps : la branche
réattribue les restaurants orphelins à un UUID **littéral, codé en dur**
(l'ancien compte root) ; la production **résout dynamiquement** le compte
`role = 'root'` le plus ancien (`select p.id ... where p.role = 'root' order
by p.created_at limit 1`). `proconfig` diffère aussi : branche = `null`
(aucun search_path figé), production = `search_path=""`. **Attribué** :
`20260818012000_identite_root_par_le_role.sql` recrée cette fonction avec
exactement le texte dynamique ci-dessus, `security definer`,
`set search_path = ''`, et révoque l'EXECUTE public — comparé caractère pour
caractère à la définition live de production : **identique**, ACL comprise
(`{postgres=X/postgres}` des deux côtés une fois la couche appliquée). La
couche identité-root n'étant pas appliquée sur ce socle, la fonction y garde
sa forme historique (documentée comme telle dans la baseline). Rien d'ouvert.

### Verdict

**Zéro divergence non expliquée.** 11 identiques, 9 cosmétiques prouvées par
lecture, 2 attribuées à des migrations déjà écrites et déjà vérifiées
caractère pour caractère contre la production — simplement pas encore
appliquées à CE socle, par construction (les couches se prouvent séparément).

## 5. Découverte production — `supabase_admin` porte encore l'excès sur `public`

**Constat, pas une action.** Le durcissement déployé (migration `5094af3`,
empreinte `2d2e463f…`) a neutralisé l'entrée de défaut du rôle `postgres`
dans `public`. Il n'a jamais touché celle du rôle `supabase_admin`, qui
accorde encore aujourd'hui à `anon` ET `authenticated` : TRUNCATE, TRIGGER,
REFERENCES sur toute future relation qu'il créerait dans `public`.

Mesuré :

- `supabase_admin` : `rolsuper = true`, `rolcanlogin = true`,
  `has_schema_privilege('supabase_admin', 'public', 'CREATE') = true`. Il
  **peut** créer dans `public`.
- Les 20 relations actuelles de `public` appartiennent à `postgres`, aucune
  à `supabase_admin` (0/20, mesuré). Aucune relation existante n'est
  concernée aujourd'hui.
- Aucun composant du dépôt (migrations, code applicatif, pipeline Vercel)
  ne s'authentifie jamais comme `supabase_admin` — c'est un rôle réservé au
  plan de contrôle Supabase, jamais actionné par ce projet.

**Qualification** : inerte dans le chemin de déploiement que Samy et Claude
contrôlent (0 objet concerné, jamais actionné par ce projet), mais **pas
neutralisé structurellement** — le rôle garde la capacité, et un mécanisme
interne à Supabase (support, migration de plateforme, fonctionnalité
managée) agissant un jour sous cette identité dans `public` en hériterait.
C'est une requalification du diff `docs/diff-semantique.md` du 18/08 matin,
qui avait conclu « inertes » sans avoir vérifié `has_schema_privilege` — sur
la seule base de l'absence d'objets actuels, pas de la capacité.

**Remédiation NON appliquée.** Toucher les défauts de `supabase_admin`
sortirait du périmètre déjà autorisé (le durcissement porte sur `postgres`
uniquement) et affecterait un rôle que ce projet ne possède pas — nécessite
une autorisation explicite séparée de Samy avant tout `alter default
privileges for role supabase_admin`, avec analyse d'impact sur ce que
Supabase fait réellement sous cette identité. Non fait, non proposé comme
allant de soi.

## 6. Ce qui reste ouvert

- La remédiation de `supabase_admin` (§5) — décision de Samy, hors périmètre
  actuel.
- Les quatre couches (durcissement, RLS, identité-root, gel) toujours à
  appliquer séparément, chacune avec fingerprint avant/après — inchangé.
- La matrice de concurrence du gel — inchangé.
- Les réserves du candidat UUID-root — inchangé.

**Ce qui n'est plus ouvert** : les corps de fonction (tous attribués), les
trois angles morts de la sentinelle (corrigés et prouvés), la preuve ACL de
la première table historique (versionnée).
