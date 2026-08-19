# Lot 6 — Synthèse : le schéma d'accueil, le gating, la marque et les QR

> **Statut** : synthèse d'arbitrage, à verser dans `docs/`.
> **Date** : 19/08/2026. **Branches lues** : `feat/fusion-fideliz` (Cartiz), `candidat/baseline-acl` (Fideliz).
> **Méthode** : cinq lentilles d'analyse, cinq réfutations indépendantes qui ont rouvert les fichiers. Ce document ne retient que ce qui a survécu à la réfutation. Chaque affirmation porte un chemin:ligne.
> **Périmètre de mesure** : lecture de fichiers uniquement. Aucune base interrogée, aucun build, aucune requête réseau. La section 6 liste sans complaisance tout ce qui n'a pas été mesuré.
> **Couverture des verdicts** : les 73 constats du dossier portent tous un verdict. Aucun constat n'est resté « non éprouvé ».

---

## 1. Le schéma d'accueil — Cartiz peut-il héberger Fideliz ?

### 1.1 Réponse courte

**Oui, mais pas par une union de tables.** Le schéma d'accueil fonctionne selon trois régimes distincts, et se confondre entre eux est le principal risque de la bascule :

| Régime | Tables concernées | Ce qu'on fait |
|---|---|---|
| **Fusion additive de colonnes, zéro ligne versée** | `restaurants` | On ajoute 48 colonnes à la table Cartiz. On ne verse aucune ligne Fideliz : l'identité Cartiz est canonique (UUID, slug, QR préservés). |
| **Fusion de colonnes + versement de lignes arbitré** | `profiles` | Le schéma Cartiz gagne, deux colonnes Fideliz sont récupérées, et les 9 comptes sont versés — mais rien n'écrit encore comment. |
| **Cartiz gagne, Fideliz est jeté** | `crm_notes`, `sales_restaurants` | Les deux tables Fideliz sont vides et mortes. |
| **Transplantation sans collision** | `games`, `prizes`, `winners`, `contacts`, `avis`, `system_logs`… | Hors périmètre de ce lot : jamais examinées. |

Le blocage n'est pas dans les tables. Il est dans **quatre objets automatiques et une contrainte d'outil** que personne n'avait reliés au schéma (§1.4).

### 1.2 Les quatre collisions, nommément

#### Collision 1 — `restaurants` : additive, mais une colonne bloque le DDL

**État mesuré.** Fideliz porte 53 colonnes (43 à la baseline `00000000000000_baseline_fideliz.sql:138-181`, +3 `google_reviews_*` par `20260724002837:27-30`, +1 `auto_reply_since` par `20260724132406:4-5`, +6 options `auto_reply` par `20260802121539:2-8`). Cartiz en porte 19 (`001_init_cartiz.sql:34-46`, puis `004`, `008`, `009`, `016`, `049:15-17`, `080:14-16`). **Cinq noms communs seulement** : `id`, `slug`, `logo_url`, `created_by`, `created_at`. Le recomptage indépendant du sceptique confirme 53 et 19.

La clé primaire porte le **même nom et le même type des deux côtés** (`id uuid`). C'est ce qui rend l'opération additive : les 18 clés étrangères Cartiz vers `restaurants(id)` et les 6 clés étrangères Fideliz survivent sans retouche.

| Recommandation | Coût chiffré |
|---|---|
| **Fusion additive.** 48 colonnes ajoutées à la table Cartiz. Aucun renommage. Aucune ligne Fideliz insérée. | 48 `add column`, 0 `rename`. **58 accès `from('restaurants')` sur 36 fichiers Fideliz** à revalider colonne par colonne. **1 ligne à créer** (soukara, action `creer` au mapping, `created_by` NOT NULL à fournir). |

**Ce qui bloque réellement le DDL.** `name text not null` **sans défaut** (`baseline_fideliz.sql:141`) sur une table Cartiz qui contient des lignes réelles. Un `alter table add column name text not null` échoue. Il faut : ajout nullable → backfill depuis `nom` → `set not null`. **C'est le seul cas des 48** (`is_blocked`, `:169`, porte `default false` et passe).

**Ce qui doit être arbitré dans la même migration :**

- **`created_by`.** Fideliz : nullable, pointé par **deux** clés étrangères identiques vers `profiles(id) on delete set null` — doublon historique assumé (`baseline:151`, `:360-364`). Cartiz : `not null references auth.users(id)`, sans action de suppression (`001_init_cartiz.sql:43`). Trois divergences dans une colonne : la cible, la nullabilité, l'action de suppression (NO ACTION côté Cartiz, pas RESTRICT — même blocage, mais déferrable). *Le sceptique a corrigé la lentille : ce blocage à la suppression d'un compte existe **déjà** dans Cartiz aujourd'hui. La fusion ne le crée pas.* Le doublon de FK doit être résolu dans le même geste, sinon il se propage.
- **Trois colonnes de propriété concurrentes.** Après fusion, `restaurants` porterait `user_id` (`baseline:140`, FK `auth.users` **on delete cascade**, `:357`), `owner_id` (`:149`, FK `auth.users`, sans action, `:358`) et `created_by`. Cartiz n'en a qu'une. L'écran root Fideliz affiche explicitement `created_by` quand il diffère de `owner_id` (`app/super-admin/root/restaurants-management/page.tsx:310`) — donc la divergence est **déjà vécue en production Fideliz**. Rien n'écrit lequel fait foi.
- **`name` contre `nom`.** Seul couple de synonymes des deux schémas. Révélé par la vue `public_restaurants` (`baseline:1155`, `security_invoker` à `:1197`) dont 4 des 7 colonnes n'existent pas chez Cartiz. *Le sceptique note que la vue se recrée dès les 48 colonnes ajoutées : c'est un point de conception, pas un défaut.*
- **Le panier moyen existe deux fois, dans deux unités.** `restaurants.avg_basket numeric default 15` (euros, `baseline:170`) contre `loyalty_settings.panier_moyen_cents int check (between 100 and 50000)` (centimes, `014_panier_moyen.sql:8-10`). Le contrat monétaire du lot 5 n'a converti que `games.min_spend_cents` et `winners.min_spend_cents_snapshot` (`20260819060000:139-146`) — `avg_basket` n'y figure pas. **Les deux colonnes sont vivantes en lecture ET en écriture d'écran** : côté Fideliz `admin/[slug]/page.tsx:37,66` et `settings/page.tsx:128,229-230` ; côté Cartiz `lib/calibrage.ts:34`, `lib/queries/accueil.ts:209`, `fidelite/catalogue/page.tsx:29`. Recopier `avg_basket` tel quel donne 15 centimes, rejeté par le CHECK — le rejet est ici une chance. Le vrai risque est deux écrans affichant deux paniers moyens différents pour le même restaurant.

#### Collision 2 — `profiles` : la plus chère, et la seule vraiment bloquante

Quatre divergences indépendantes sur une table de quatre colonnes.

| Divergence | Fideliz | Cartiz | Preuve |
|---|---|---|---|
| Nom de la clé primaire | `id uuid primary key` | `user_id uuid primary key` | `baseline:185`, `:368` / `001_init_cartiz.sql:14` |
| Vocabulaire des rôles | `check (root, sales, restaurant)` | `check (admin, root, sales, restaurateur)` | `baseline:370` / `011_fidelite.sql:25-28` |
| Défaut et nullabilité de `role` | `text default 'restaurant'`, **nullable** | `text not null`, sans défaut | `baseline:187` / `001_init_cartiz.sql:15` |
| Colonnes | `+ email` (UNIQUE, `:186`, `:367`), `+ is_active` (`:190`) | absentes (4 colonnes) | `lib/database.types.ts:853-871` |

**Le rôle.** L'intersection des deux CHECK est `{root, sales}`. La valeur portée par **7 comptes Fideliz sur 9** — `restaurant` — n'est pas dans l'ensemble Cartiz (`docs/matrice-conservation-fonctionnelle.md:53`). Insérer tel quel → 23514 sur 7 comptes. Renommer en `restaurateur` → l'autre moitié bascule : `lib/securite/garde-action.ts:39` (`ROLES_CONNUS = ["root","sales","restaurant"]`) refuse tout rôle inconnu, `lib/securite/garde-page-restaurant.ts:57` (`ROLES_DASHBOARD = ["root","restaurant"]`) refuse le dashboard. **Refus silencieux et total, fail-closed assumé.** Symétriquement, 5 prédicats Cartiz vivants testent `role = 'restaurateur'` en dur et ne reconnaîtraient jamais `restaurant` : `mes_restaurants` (`011:537`), `mes_restaurants_gestion` (`032:41`), `_peut_agir_sur` (`076:52`, qui remplace `011:254`), `074:176` et `074:237`. Un restaurateur Fideliz serait connecté, valide, et ne verrait rien.

Le **défaut** aggrave : sur la table fusionnée, tout INSERT qui omet `role` prendrait `'restaurant'` et tomberait en 23514 — **y compris depuis un chemin Cartiz**. Le défaut doit être retiré dans la même migration que le CHECK.

**La clé.** Coût mesuré si Cartiz garde `user_id` : **18 filtres `.eq('id', …)`** posés juste après un `from('profiles')` dans le code Fideliz (dont `middleware.ts:43`, `garde-action.ts:74`, `lib/securite/root.ts:105`, `app/actions/validate-win.ts:65`, `app/api/admin/winners/route.ts:57`, `app/login/page.tsx:27`), et **au moins 22 prédicats SQL** `p.id = auth.uid()` dans la baseline. **Attention : 22 est un plancher, pas un total.** Le motif de comptage rate les formes nues `id = auth.uid()` (`baseline:441`, `:448`, `:602`, `:603`, `:1270`, `:1271`) et les formes `old.id` (`:574`, `20260818011000:443`, `20260819000000:87`). Le motif large `[a-z_]*\.?id = auth.uid()` rend **45** sur les migrations. *Chiffrer ce chantier avec le motif étroit, c'est le sous-budgéter de moitié.* Coût inverse si Fideliz gagnait : 12 filtres `.eq('user_id')` + 12 `from public.profiles` côté Cartiz, **plus la perte de la convention que tout le module fidélité applique depuis `011`.**

Le renommage traverse aussi tout le socle d'autorisation : Fideliz construit `current_role()` (`:437`), `current_restaurant_id()` (`:446`), `is_root()` (`:450`), `is_sales()` (`:454`), `is_restaurant_user()` (`:462`) sur `profiles.id` ; Cartiz construit `is_admin()` (`001:22`), `my_restaurant_id()` (`001:27`), `est_root()` (`023:16`), `suit_restaurant()` (`028:12`), `mes_restaurants()` (`011:529`), `mes_restaurants_gestion()` (`032:29`) sur `profiles.user_id`.

**`is_active` : la perte silencieuse.** Fideliz s'en sert comme interrupteur de compte, lu par **sept** points de contrôle : `middleware.ts:50`, `app/login/page.tsx:38`, `app/actions/get-winner-info.ts:35`, `app/api/restaurants/block/route.ts:37`, `app/api/admin/winners/route.ts:57`, `app/api/admin/create-user/route.ts:50`, et la policy `winners_update_by_restaurant_team_v3` (`baseline:1295`). Le mot `is_active` **n'apparaît nulle part dans le code Cartiz** (0 occurrence, vérifié). Sans la colonne, tout compte Fideliz désactivé redevient actif au premier login, et quatre gardes lisent `undefined`, donc `=== false` est faux, donc laissez-passer. **Réouverture de droits silencieuse.** Et le problème est plus large que la colonne : un grep de `is_active|is_blocked|suspendu|désactivé` sur les 81 migrations Cartiz ne rend rien sur `profiles` ni `restaurants`. **Cartiz n'a aucun moyen de couper un compte.**

**`email` UNIQUE : un problème qui remonte plus haut que `profiles`.** Fideliz pose `profiles_email_key unique (email)` (`:367`). Le mapping écrit pour best-pizza « MÊME ADRESSE E-MAIL de compte des deux côtés » puis décide « Les deux comptes actifs sont conservés » (`scripts/non-regression/mapping-restaurants.json`). Dans **un seul projet Supabase, deux lignes `auth.users` ne peuvent pas porter la même adresse** — cette contrainte est en amont de `profiles` et rend la décision inapplicable telle quelle, quoi qu'on fasse de la colonne.

| Recommandation | Coût chiffré |
|---|---|
| **Le schéma Cartiz gagne** (`user_id`, `not null`, vocabulaire `restaurateur`), **plus deux colonnes récupérées** (`is_active` obligatoirement, `email` seulement si le versement l'exige). | 18 filtres + **≥22 (réellement ~45) prédicats SQL** à réécrire. ~50 littéraux de rôle `'restaurant'` dans l'arbre vivant Fideliz (2 listes fail-closed, des gardes d'actions, des tests). 1 CHECK à traduire, 1 défaut à retirer, 2 colonnes à ajouter, 3 triggers à arbitrer (§1.4). |

**Un garde-fou utile, mesuré et non relevé par les lentilles :** la RLS de `profiles` côté Cartiz interdit toute auto-élévation — `profiles_select_own` (`001_init_cartiz.sql:194-195`) ne laisse lire que sa propre ligne, `profiles_admin_write` (`:196-197`) réserve l'écriture à `is_admin()`. La colonne `role` de l'annuaire fusionné ne sera modifiable que par les chemins en clé de service. **Dangereuse par erreur d'opérateur, pas exploitable par un titulaire de compte.**

#### Collision 3 — `crm_notes` : la moins chère, mais pas « identique »

Cinq colonnes identiques des deux côtés : `id`, `restaurant_id`, `sales_id`, `note`, `created_at`.

**Deux écarts, dont un que la lentille « données » avait nié.** (a) `created_at` est nullable chez Fideliz, NOT NULL chez Cartiz. (b) **Fideliz n'a AUCUNE clé étrangère sur cette table** : `crm_notes` n'apparaît que trois fois dans toute la baseline — `:281` (create table), `:1218` (enable RLS), `:1252` (une policy). Aucun `alter table … add constraint`. Cartiz en a deux, toutes deux `on delete cascade` (`011_fidelite.sql:39-45`).

*Une lentille a écrit « seule la cible de la clé étrangère diffère ». C'est faux, et l'erreur va dans le sens qui coûte cher : une note Fideliz rattachée à un restaurant exclu de la fusion (`test78`) ou à un `sales_id` disparu serait rejetée à l'insertion. Un constat qui annonce « pas un conflit » sur une table qui en porte un désarme la vigilance au moment du versement.*

**Un arbitrage réel subsiste : le droit de modifier une note.** Cartiz pose trois policies — `crm_notes_lecture` (SELECT), `crm_notes_ecriture` (INSERT, resserrée en `028:37-43` par `suit_restaurant`), `crm_notes_suppression` (DELETE) — et **aucune policy UPDATE** (`023_console_root_sales.sql:34-44`). Une note est ajoutable et supprimable, jamais modifiable. Fideliz pose `crm_notes_root` et `crm_notes_commercial_rattache`, toutes deux `for all` donc **UPDATE inclus** (`20260818011000:306-330`). Sans arbitrage écrit, la migration appliquera l'un des deux par accident d'ordre d'exécution.

| Recommandation | Coût chiffré |
|---|---|
| **Garder Cartiz intégralement, jeter Fideliz.** Trancher explicitement le modèle UPDATE. | **0 référence à réécrire.** Table Fideliz vide (relevé `20260818011000:293`), `crm_notes` absent de tout fichier applicatif Fideliz (seule occurrence du dépôt : une liste de noms dans `supabase/migrations/durcissement.test.ts:404`). Côté Cartiz : 3 occurrences vivantes dans 2 fichiers, préservées. |

#### Collision 4 — `sales_restaurants` : identique, sauf une règle produit

Mêmes trois colonnes, même clé primaire composite `(sales_user_id, restaurant_id)`, mêmes deux clés étrangères en cascade — vérifié des deux côtés (`baseline:289-293` et `:394-398` ; `011_fidelite.sql:31-36`).

**Le seul écart est une règle produit.** Cartiz pose un index **UNIQUE** sur `restaurant_id` seul (`028_perimetre_commercial.sql:50-51`), qui impose **un commercial unique par restaurant**. Fideliz n'a que des index non uniques (`baseline:422` et `:423`). Le commentaire de `028:53` dit comment lever la contrainte si Samy change d'avis.

| Recommandation | Coût chiffré |
|---|---|
| **Garder Cartiz, jeter Fideliz.** Confirmer explicitement la règle « un restaurant = un seul commercial ». | **0 ligne à verser** (table Fideliz vide, relevé `20260818011000:294`). **3 occurrences de code Fideliz à repointer** (`app/api/sales/dashboard/route.ts:35`, `app/api/restaurants/block/route.ts:60`, `lib/securite/suppression-compte.ts:337`), contre 8 occurrences Cartiz préservées. |

### 1.3 Ce qui entre tel quel

- **Les clés étrangères vers `restaurants(id)`** : la PK a le même nom et le même type des deux côtés. 18 FK Cartiz + 6 FK Fideliz survivent sans retouche.
- **Aucune collision de nom de bucket Storage** : `backgrounds` et `logos` (Fideliz, `baseline:1204`, `:1206`) contre `menu-photos` et `flyer-pages` (Cartiz, `001_init_cartiz.sql:296-298`).
- **Aucune table `scans` côté Fideliz** : ses 15 `create table` sont recensés, aucun n'en approche. La collision sur le mot « scan » est lexicale, pas structurelle — mais elle est réelle et le code Cartiz s'en méfie déjà lui-même (`app/api/pass/route.ts:9` : « Ne pas confondre avec /api/scan »).
- **Aucun conflit de slug entre deux commerces distincts** : les 7 correspondances du mapping ne présentent aucun cas où un même slug désigne deux commerces différents. **Aucun renommage de slug forcé.**

### 1.4 Ce qui doit être arbitré — les objets automatiques (le vrai blocage)

Les quatre lentilles ont examiné les colonnes. **Les objets qui les manipulent automatiquement sont plus dangereux que les colonnes elles-mêmes**, et deux d'entre eux n'apparaissaient dans aucun des 73 constats initiaux.

| Objet | Ce qu'il fait | Ce qu'il casse |
|---|---|---|
| **`on_auth_user_created`** (`baseline:1146-1148`) → `handle_new_user_profile()` (`20260817230642:18-19`) | `insert into public.profiles (id, email, role, restaurant_id) values (new.id, new.email, 'restaurant', null)` — AFTER INSERT sur `auth.users` | Casse **trois fois** : colonne `id` inexistante, colonne `email` inexistante, valeur `'restaurant'` refusée. Comme l'échec d'un trigger AFTER INSERT **avorte l'insertion**, **TOUTE création de compte de la base fusionnée échoue** — y compris Cartiz, y compris pour Samy. Les trois chemins de création Cartiz tombent (`app/api/admin/invite/route.ts:43-47`, `lib/actions/console.ts:38-40`, `lib/actions/admin.ts:111`). **Et le seed de développement aussi** (`002_seed_dev.sql:4` fait un `INSERT INTO auth.users`). Retiré sans remplacement, aucun compte Fideliz créé après la bascule n'obtient de profil. **Choix binaire, pas un réglage.** |
| **`tr_on_commercial_deleted`** (`baseline:1122-1124`, version courante `20260819000000:62-91`) | `before delete on public.profiles when (old.role = 'sales')` | `'sales'` est un rôle **valide des deux côtés** : le trigger deviendrait vivant pour les comptes commerciaux **Cartiz**. Or Cartiz supprime précisément ce type de profil (`lib/actions/console.ts:69` : `.delete().eq("user_id", salesUserId)` après vérification `role === 'sales'`). Trois casses en cascade : la fonction lit `old.id` (`:87`) et `p.id` (`:71`) — inexistants ; elle écrit `restaurants.owner_id` — colonne Fideliz seulement ; elle cherche un profil `role='root'` et **lève P0102 « suppression refusée »** s'il n'y en a pas — or le fondateur Cartiz porte `'admin'` (`001_init_cartiz.sql:22-24`). **Résultat : supprimer un commercial depuis la console Cartiz échouerait.** Fonctionnalité qui marche aujourd'hui, cassée par un objet hérité. |
| **`log_profile_active`** (`baseline:1113-1119`) et **`log_restaurant_block`** | `after update of is_active on profiles` / `after update of is_blocked on restaurants` | Ni l'une ni l'autre colonne n'existe côté Cartiz. Cas favorable : la migration échoue bruyamment en 42703. **Cas défavorable : on retire les triggers pour faire passer la migration, et la journalisation des désactivations disparaît sans que rien ne le signale.** *Corollaire des décisions sur `is_active` et `is_blocked` : il disparaît si on les traite.* |
| **`winners_update_by_restaurant_team_v3`** (`baseline:1295`) | accorde UPDATE aux rôles `admin, owner, staff, root` | *La lentille l'a présentée comme « morte ». C'est faux : `root` est accepté par le CHECK Fideliz, la policy est vivante aujourd'hui.* Mais `admin` est une valeur valide du CHECK Cartiz — **et c'est le rôle du compte du fondateur**. Une branche jamais testée change de statut sans qu'aucune ligne de migration ne la mentionne. Elle lit aussi `p.is_active` et `p.id = auth.uid()` : **inhéritable en l'état de toute façon.** À retirer explicitement plutôt qu'à hériter. |
| **Les 8 policies Storage Fideliz** (`baseline:1301-1315`) | un seul prédicat, `bucket_id`, sans aucun cloisonnement | Vérifié ligne à ligne : `backgrounds` delete/select/update/insert (`:1301`,`:1303`,`:1305`,`:1307`), `logos` select/insert/update/delete (`:1309`→`:1315`), toutes `to authenticated`. Cartiz conditionne les siennes par `(storage.foldername(name))[1] = my_restaurant_id()` (`001_init_cartiz.sql:300-329`). Les policies sont **permissives** et portent sur la **même table `storage.objects`** : réunir les projets applique les 8 policies Fideliz à **tous** les comptes authentifiés. **Le jour de la fusion, n'importe quel restaurateur Cartiz peut écraser le logo et le fond de roue de n'importe quel autre.** Et l'effet est silencieux : une page dont l'image a disparu répond 200 avec un fond blanc (`scripts/non-regression/README.md:89-90`). *Nuance du sceptique : le trou existe déjà **dans Fideliz seul** — les deux téléverseurs écrivent depuis le navigateur avec la session utilisateur (`components/BackgroundUploader.tsx:70-72`, `components/LogoUploader.tsx:82-84`). La fusion ne crée pas la faille, elle élargit la population qui peut l'exploiter. C'est précisément l'élargissement qu'il faut interdire avant de le faire.* |
| **`middleware.ts` + `proxy.ts`** — contrainte d'outil, pas de conception | Next 16.3.0 **refuse de construire** un dépôt qui contient les deux | Vérifié dans le code de build embarqué : `node_modules/next/dist/build/index.js:724` lève `Both middleware file … and proxy file … are detected. Please use … only.` Cartiz a `proxy.ts` et pas de `middleware.ts` ; Fideliz l'inverse. **Il n'existe pas d'option « garder les deux ».** Toute la logique Fideliz (blocage utilisateur, blocage restaurant, rôles root/sales) doit être **réécrite** dans `proxy.ts`. |

**Deux règles métier orphelines**, à traiter au même moment que les colonnes :

- **Les drapeaux de visibilité entrent en collision sémantique.** La lecture publique de Cartiz ne teste que `publie` (`001_init_cartiz.sql:200-201`, repris `:203`, `:205`, `:207-214`). Après la fusion additive, la table porterait **trois** drapeaux : `publie` (Cartiz), `is_active` (`baseline:152`), `is_blocked` (`baseline:169`, lu par `check_restaurant_status`). **Un restaurant bloqué côté Fideliz resterait servi publiquement par Cartiz**, parce qu'aucune policy Cartiz ne connaît `is_blocked`.
- **Deux notions de fondateur coexistent déjà côté Cartiz.** `is_admin()` teste `role='admin'` strict (`001_init_cartiz.sql:22-24`, jamais redéfinie dans les 81 migrations) ; `est_root()` teste `role in ('admin','root')` (`023:16-27`, dont le commentaire `:5-9` dit explicitement « sans toucher à `is_admin()` »). Un compte Fideliz `role='root'` versé tel quel **franchit le garde-barrière** (`proxy.ts:83` accepte admin OU root) puis se heurte à un périmètre précis : la RPC de liste `admin_restaurants_overview()` porte `WHERE is_admin()` dans son corps (`010_perf_scalabilite.sql:27`) et rend **zéro ligne** — la console s'ouvre sur une liste vide ; les tables de la carte et les 6 policies Storage de `001_init` le refusent ; l'endossement le refuse (`app/api/admin/impersonate/route.ts:18`, `role !== "admin"`). *Correction du sceptique, importante pour ne pas surdimensionner le chantier :* `mes_restaurants()` (`011:533-534`) et `mes_restaurants_gestion()` (`032:37-38`) acceptent **déjà** `role in ('root','admin')`, et côté applicatif `assertAdmin` (`lib/actions/admin.ts:30`) accepte admin OU root tandis qu'`assertRoot` (`lib/actions/console.ts:15`) passe par `est_root()`, tous deux enchaînant sur le client `service_role` qui ignore la RLS. **Un root peut donc déjà créer un restaurant, créer un commercial et réinitialiser un mot de passe.** Le périmètre à réparer n'est pas « tout Cartiz » : c'est la RPC de liste, les tables de la carte, les 6 policies Storage, et l'endossement.

### 1.5 Le trou d'arbitrage : les comptes

**`mapping-restaurants.json` est le seul document d'autorité, et il arbitre 9 restaurants et zéro compte.** Ses seules clés sous `cartiz`/`fideliz` sont `restaurant_id`, `slug`, `nom`, `role`. **Aucun `user_id`, aucune adresse, aucun bloc « comptes ».** Le mot « compte » n'y apparaît qu'en prose de décision. Vérifié : le trou n'est reconnu nulle part — la section « Ce qui reste ouvert » du `CHECKPOINT-MAITRE` ne le mentionne pas.

Au niveau **restaurant**, en revanche, le mapping est complet et non un échantillon : 7 correspondances, `fusionner ×2`, `creer ×1`, `exclure ×1`, `conserver-test ×2`, `ne-pas-toucher ×1`, chacune avec une action explicite. **C'est la bonne nouvelle du lot : le trou n'est pas au niveau des restaurants, il est entier au niveau des comptes.**

Trois conséquences mesurées :

1. **La-ruche et best-pizza ne sont arbitrés ni l'un ni l'autre.** *Deux lentilles ont lu la même phrase du mapping en sens opposé, ce qui prouve qu'elle n'arbitre rien* : « Les deux comptes sont conservés. L'email du compte Fideliz est gardé : le compte Cartiz n'a jamais servi. » — cette phrase désigne l'**adresse canonique**, jamais **l'UUID qui survit**. Le trou couvre les **deux** vrais clients communs, pas un seul.
2. **Deux comptes sur un même restaurant cassent la console root de Cartiz.** Elle retrouve « le » compte restaurateur par `restaurant_id + role='restaurateur'` terminé par `.maybeSingle()` (`lib/queries/admin.ts:136-139`), et refait le même filtre avant de lever « Ce restaurant n'a pas de compte restaurateur. » (`lib/actions/admin.ts:188-196`). Aucune contrainte unique n'existe sur `profiles(restaurant_id)` dans les 81 migrations : rien n'empêche deux lignes. *Nuance du sceptique : c'est la conséquence probable d'un choix non fait, pas un état constaté — le mapping n'écrit nulle part que les deux comptes deviennent `restaurateur` sur le même `restaurant_id`. À formuler comme contrainte de conception.*
3. **`doit_changer_mdp` survivra mais sera inopérant sur les 9 comptes versés.** Le garde-barrière ne redirige que sur `=== true` (`proxy.ts:58-67`), et son commentaire dit textuellement « Les comptes existants n'ont pas ce champ : rien ne change pour eux. » **Aucun script de reprise d'annuaire n'existe dans l'un ou l'autre dépôt** (contenu des deux `scripts/` listé ; `package.json:5-13` de Cartiz ne porte que dev/build/test/qr:verifier/predeploy). Si la bascule réémet des mots de passe provisoires sans poser le drapeau, **ces mots de passe deviennent permanents à l'insu de tous.**

---

## 2. Le gating — ce qui existe, ce qui manque, ce qui serait visible à tort

### 2.1 Ce qui existe

**Presque rien, et rien de réutilisable en l'état.**

| Brique | Ce qu'elle fait vraiment | Preuve |
|---|---|---|
| `abonnement_debut` / `abonnement_fin` (Cartiz) | **Un registre comptable, jamais une porte.** La migration l'écrit dans son propre en-tête : « AUCUN comportement d'expiration n'existe ». Confirmé par la mesure d'absence : 0 lecture dans les 22 écrans `app/app/`, 0 dans les 22 routes API, 0 dans `proxy.ts`. L'écran de Samy affiche « Expiré » et le restaurant continue de travailler. | `080_abonnement_annuel.sql:5-8` ; `lib/queries/admin.ts:176` (« Lecture seule : rien ne se coupe à l'échéance ») ; `lib/actions/admin.ts:343` (« les dates sont un registre ») |
| `subscription_end` / `subscription_plan` (Fideliz) | Coupe **deux** de ses quatre surfaces publiques. `NULL` y signifie explicitement « Illimité ». `subscription_plan` **n'est qu'un libellé d'affichage** (« Personnalisé », `planLabel(months)`) — pas un identifiant de plan, contrairement à ce que son nom suggère. | `baseline:172-173` ; `app/super-admin/root/restaurants-management/page.tsx:16` ; `app/actions/set-subscription.ts:48,62` |
| `is_blocked` / `is_active` (Fideliz) | **Un interrupteur binaire qui ferme TOUT l'établissement.** Inutilisable pour dire « ce client garde sa carte mais perd son jeu ». | `middleware.ts:56-73` |
| `tampons_actif` / `points_actif` (Cartiz) | **Ressemblent à des habilitations et n'en sont pas.** Défauts à `false` (`011:67`, `:72`), ligne créée automatiquement par trigger (`011:588-599`), et commandent réellement 4 surfaces. Mais `updateReglagesFidelite` ne vérifie que la session et le tenant — **jamais un droit** — et le schéma Zod autorise explicitement les deux booléens. **Un client menu-seul allume la fidélité Wallet en deux taps, aujourd'hui, sans fusion.** | `lib/actions/fidelite.ts:20-33` ; `lib/schemas/reglages.ts:5,20` |
| `lib/fonctionnalites.ts` | **La seule brique de bonne forme du dépôt** : un point de décision unique consommé à la fois par la navigation (`lib/navigation.ts:104`) et par des gardes de page (`app/app/carte/page.tsx:15`, `app/app/import/page.tsx:18`, `app/app/import/[importId]/page.tsx:13`). **Double garde — on ne se contente pas de masquer le lien.** Mais la valeur est une **constante en dur**, identique pour les 4 restaurants : aucune lecture de base, aucune granularité. | `lib/fonctionnalites.ts:19-42` |
| `is_retention_alert_enabled` (Fideliz) | **Le seul précédent existant d'habilitation par restaurant tenue par le VENDEUR** : basculé depuis le tableau de bord du commercial, servi par une route réservée. *Une lentille l'a rangé à tort du côté des réglages du restaurateur.* C'est le modèle le plus proche de ce qu'il faut construire. | `app/super-admin/sales/dashboard/page.tsx:160,413` ; `app/api/sales/dashboard/route.ts:56` |

### 2.2 Ce qui manque

**La question « ce restaurant a-t-il acheté Fideliz ? » n'a aucune réponse en base, dans aucun des deux projets.** Les 26 colonnes de `restaurants` Cartiz (`lib/database.types.ts:1146-1172`) et les 43 de la baseline Fideliz (`:139-181`) ont été lues : aucune n'est un droit produit. **Ce n'est pas un mécanisme à réconcilier, c'est un mécanisme à inventer** — et le choix de sa forme commande ensuite une centaine de points d'entrée.

**Le défaut permissif est partout.** `NULL` veut dire « tout permis » des deux côtés : Cartiz parce que `080` a délibérément laissé NULL tout le parc, Fideliz par convention d'affichage explicite. **Toute unification naïve sur une colonne unique donne l'accès complet à tout le parc.** Le deny-by-default n'existe nulle part et devra être posé contre l'habitude des deux bases.

**Ce qui manque n'est pas non plus un point d'accroche.** *Les lentilles ont écrit qu'il fallait « transformer les écrans » : c'est réfuté.* Le layout `app/app/layout.tsx` est un **layout serveur** qui précède les 21 écrans, résout déjà `user + restaurantId` (`:15-37`) et **lit déjà `loyalty_settings`** (`:60-65`) — la requête supplémentaire est déjà payée. Côté Fideliz, `middleware.ts` couvre `/admin/:path*` (matcher `:95`) avec profil **et** restaurant en main, y compris pour les pages clientes. **La garde de module se pose à ces deux endroits sans toucher un seul écran.**

### 2.3 Le lendemain de la fusion — ce qui serait visible ou actif à tort

| Ce qui serait ouvert | À qui | Pourquoi | Preuve |
|---|---|---|---|
| Les 11 écrans fidélité Wallet | tout restaurateur, même menu-seul | la garde des 21 écrans `app/app/` est partout la même paire `!user → /login`, `!restaurantId → /compte` ; `sectionsVisibles()` renvoie les trois sections **en dur** | `lib/navigation.ts:122-123` ; `app/app/fidelite/clients/page.tsx:19-22`, `vip/page.tsx:20-23`, `fidelite/page.tsx:68-71`, `journal/page.tsx:115-118`, `stats/page.tsx:65-68` |
| Le module fidélité, activable par le client lui-même | le restaurateur | `updateReglagesFidelite` ne vérifie aucun droit | `lib/actions/fidelite.ts:20-33` |
| Les 9 écrans du jeu concours, dont **6 sans aucune garde serveur** | tout restaurateur | `games/page.tsx`, `games/new`, `games/[id]`, `reviews`, `scanner`, `settings` commencent tous par `"use client"` ; seuls `page.tsx`, `customers` et `winners` appellent `autoriserRestaurant` | `app/admin/[slug]/games/page.tsx:1` ; `docs/traversee-ui-rls.md:8-21` (mesurés à 200 pour un restaurateur d'un autre tenant) |
| **Les logos et fonds de TOUS les restaurants, en écriture** | tout compte authentifié | 8 policies Storage sans cloisonnement | `baseline:1301-1315` |
| **Les 7 pages `/super-admin` perdent leur seul garde** | — | elles n'ont **aucun `layout.tsx` à aucun niveau** et **aucune garde de rôle en propre** : `middleware.ts:76-83` est leur unique protection, et le matcher de `proxy.ts` **ne couvre pas `/super-admin`** | `proxy.ts:99` ; `middleware.ts:95` |
| Les crons continuent de tourner pour un client expiré ou bloqué | facturé à Samy | auto-reply filtre `auto_reply_enabled` + jeton, sync-reviews le seul jeton, stock-refill ses propres drapeaux, la tournée Cartiz les seuls scénarios actifs — **jamais l'abonnement ni le blocage** | `app/api/cron/auto-reply/route.ts:30-34` ; `sync-reviews/route.ts:27-30` ; `stock-refill/route.ts:41-45` ; `073_tournee_par_lots.sql:70-80` ; `lib/automatisations/moteur.ts:328-395` |
| Un restaurant bloqué côté Fideliz reste **servi publiquement** par Cartiz | client final | aucune policy Cartiz ne connaît `is_blocked` | `001_init_cartiz.sql:200-201` |
| Un restaurant **dépublié** continue d'envoyer des notifications Wallet | ses clients | ni la RPC, ni le moteur, ni `traiterRestaurant` ne lisent `publie` — **défaut vivant aujourd'hui, hors fusion** | `073:70-80` ; `moteur.ts:130-160`, `:328-395` |
| Un client **anonymisé** reste parfaitement actif | — | `anonymize_expired_data` écrit `first_name='Anonyme'`, `email=null`, `phone=null` — **jamais `deleted_at`**, seul champ que les 7 lectures Cartiz filtrent | `baseline:823-834` ; `clients/page.tsx:32,39`, `vip/page.tsx:42`, `pass/route.ts:163`, `stats-unifiees.ts:222`, `accueil.ts:134`, `export-clients.ts:88` |
| Le prénom du client survit à sa propre échéance dans deux tables non purgées | — | `push_log.message` et `passes.message_push` conservent le message **rendu**, prénom substitué | `moteur.ts:92-97`, `:62-64` ; `rendu.ts:30-31,38-39` ; `024_automatisations.sql:48-59` (aucune purge) |
| Les empreintes IP des deux produits deviennent **corrélables** | — | les deux calculs sont littéralement identiques (`sha256(sel + ip)`, même ordre, même encodage) et retombent sur le **même** `SUPABASE_SERVICE_ROLE_KEY` si `RATE_LIMIT_SALT` n'est pas posé — variable qui **n'est documentée nulle part** dans le dépôt Cartiz | `lib/auth/empreinte-ip.ts:21-22` ; `app/actions/play-game.ts:22-23` |
| Une branche d'autorisation jamais testée s'ouvre | comptes `admin` | `winners_update_by_restaurant_team_v3` | `baseline:1295` |

### 2.4 La surface à garder, chiffrée

| Surface | Nombre | Combien vérifient une habilitation produit aujourd'hui |
|---|---|---|
| Écrans de dashboard restaurateur | **30** (21 Cartiz — l'un des 22 est une redirection de 9 lignes — + 9 Fideliz) | 0 |
| Routes API | 32 (22 + 10) | 0 |
| Fichiers de server actions | **52** (20 + 32 — le chiffre de 34 attrapait des commentaires) | 0 |
| Surfaces publiques | 9 (5 Cartiz, 4 Fideliz) | 0 côté Cartiz ; **2 sur 4** côté Fideliz |
| Tâches planifiées | 4 (3 Fideliz à cadence prouvée, 1 Cartiz à cadence **non mesurée**) | 0 |

**Le chiffre à retenir pour arbitrer : ce n'est pas « ajouter un `if` », c'est poser une décision d'habilitation sur une centaine de points d'entrée.**

**Une politique unique est impossible, et pas seulement à cause de Cartiz.** *Réfutation instructive :* la politique Fideliz « expiré = coupé » est **déjà incohérente chez elle** — `/verify/[id]` et `/qr/[id]` ne contiennent ni `subscription_end`, ni `is_blocked`, ni `is_active`. Un ticket gagnant reste vérifiable et un QR de jeu reste servi chez un restaurant expiré. **Il n'y a pas une politique à généraliser, il y en a deux.** Le gate devra être **par surface**, pas par restaurant.

**Et Cartiz n'a aucune solution de repli.** Zéro occurrence de `blocked|suspendu|is_active` dans tout `app/` et `lib/`. Le seul levier d'extinction est `publie`, branché sur **six** surfaces à la fois : le menu public (`lib/queries/menu.ts:115`), `generateStaticParams` (`app/m/[slug]/page.tsx:31-33`), l'inscription fidélité (`lib/queries/fidelite.ts:34`), le comptoir (`app/scan/[slug]/page.tsx:33`), la route de pass (`app/api/pass/route.ts:86-90`) et le manifeste PWA (`app/scan/[slug]/manifest/route.ts:16-20`). **Le tirer coupe précisément la chose qu'on n'a pas le droit de couper.**

**Un cas non traité, qui décide de la forme du gate :** l'impersonation. `app/app/layout.tsx:41-42` et `lib/auth/current-restaurant.ts` permettent à un admin d'endosser un restaurant. Sans décision, la garde ferme la console de dépannage de Samy — ou s'ouvre à qui pose le cookie.

---

## 3. La marque et les QR

### 3.1 Ce qui ne peut pas bouger

| URL / objet gelé | Pourquoi | Preuve | Sous témoin ? |
|---|---|---|---|
| `/m/<slug>` | QR menu imprimés sur les tables. Interdit explicite du `CLAUDE.md`. | `app/app/qr/page.tsx:44` | **Oui** |
| `/scan/<slug>` | QR jeu imprimés — la-ruche, best-pizza, soukara | `scripts/non-regression/README.md:10-12` | **Oui** |
| `/play/<slug>` et `/play/<uuid-jeu>` | deux des trois formes d'URL de jeu imprimées, servies par la même route | `app/play/[slug]/page.tsx:14`, `:20-56` ; `README.md:200-206` | **Oui** |
| `/verify/<uuid>` | QR de tickets papier ; le mapping le pose en invariant « tant qu'un QR physique peut exister » | `mapping-restaurants.json`, `invariantsGlobaux` | **Non** |
| `/c/<serial>` | écrit **au dos de chaque pass Apple déjà installé** — l'équivalent exact d'un imprimé | `lib/wallet/apple.ts:409` | **Non** |
| `/f/<slug>` | gelé **dès la première impression d'affiche**, avec `cartiz.vercel.app` en repli dur | `app/affiche/[slug]/page.tsx:41-43`, `:152` | **Non** |
| Le `webServiceURL` des pass déjà émis | écrit à l'émission, **ne se réécrit pas à distance**. Changer le domaine coupe silencieusement la mise à jour de tous les passes en circulation — tampons et points cessent de bouger, sans message d'erreur. | `lib/wallet/apple.ts:240-241` ; `lib/wallet/config.ts:33-38` | **Non** |
| Le nom du projet Vercel `cartiz` | interdit explicite du `CLAUDE.md` | — | — |
| Les 4 slugs | aucun renommage forcé : les 7 correspondances du mapping ne présentent aucun cas où un slug désigne deux commerces différents | `mapping-restaurants.json` | partiel |

**Le témoin de non-régression ne couvre AUCUNE des URL Wallet ni de ticket**, alors que le mapping les pose en invariant. Les 5 fixtures ne contiennent que des `/m/`, `/scan/` et `/play/` : **zéro `/verify/`, zéro `/c/`, zéro `/f/`, zéro `/affiche`**. Le témoin contredit les invariants que le même fichier déclare. Il ne contrôle par ailleurs le mapping que sur **5 des 9 identités** (`verifier.mjs:380-401` boucle sur les fixtures) — `mpbmeru`, dont l'instruction est justement « ne pas toucher », n'est atteint par aucun contrôle.

### 3.2 Le point dur unique : `/scan/<slug>`

**Un seul chemin de fichier existe dans les deux dépôts avec deux métiers opposés.** Fideliz : page **publique**, lit `games` `status='active'` puis `redirect('/play/<uuid>')`. Cartiz : **comptoir du personnel**, exige une session et redirige vers `/login?suite=/scan/<slug>`. Sur un seul arbre de routes Next, un seul des deux fichiers peut occuper ce chemin.

**Et l'arbitrage des deux `page.tsx` ne suffit pas.** `proxy.ts` inscrit `/scan` dans `isProtected` (`:45-50`) **et** dans le matcher (`:99`), et redirige l'anonyme avant tout routage (`:52-56`) — vérifié, ainsi que la compilation effective du matcher dans `.next/server/functions-config-manifest.json`. **Même en gardant la page Fideliz, le client anonyme tomberait sur `/login`.**

**La résolution est à sens unique et bon marché, à condition d'être tranchée avant la fusion.** Le comptoir Cartiz **n'a aucun artefact imprimé** — il s'installe en PWA sur une tablette de caisse. Le déplacer coûte une réinstallation de PWA (manifeste `/scan/<slug>/manifest`, worker `/scan/sw.js`). Déplacer le jeu coûte du papier chez trois restaurants réels. **Le jeu garde l'URL, le comptoir déménage.**

Un crochet existe déjà pour une exception : `proxy.ts:42-43` laisse passer sans session `/scan/sw.js` et **tout chemin finissant par `/manifest`**. C'est le seul mécanisme en place pour exclure un sous-chemin de `/scan` du contrôle de session.

**Soukara n'a pas moins de collision que les deux autres, il en a exactement autant.** *Réfutation à retenir : une lentille a soutenu que le QR de Soukara casserait « le jour où son restaurant Cartiz est créé, pas le jour de la bascule ». C'est faux — le proxy intercepte avant la page, et même proxy neutralisé la page appelle `notFound()` sur un slug absent (`app/scan/[slug]/page.tsx:33`). La casse est immédiate à la bascule. L'erreur laissait croire qu'on avait du temps.*

### 3.3 Les autres collisions de chemin

Sur **63 routes Cartiz et 36 Fideliz**, l'intersection est exactement `{/, /admin, /confidentialite, /login, /scan/[slug]}` — recalculé indépendamment. Aucun conflit de **nom** de paramètre dynamique.

- Quatre partagent le même chemin de fichier : `app/page.tsx`, `app/admin/page.tsx`, `app/login/page.tsx`, `app/scan/[slug]/page.tsx`. *L'« écrasement silencieux » annoncé n'est vrai que d'une fusion faite à la copie : un merge git produirait quatre conflits visibles. La parade dépend donc de la méthode de fusion, pas de l'outil.*
- `/confidentialite` est le cas différent : Cartiz le sert depuis `app/(legal)/confidentialite/page.tsx`, Fideliz depuis `app/confidentialite/page.tsx`. Les deux fichiers peuvent coexister et **Next refuse alors de construire** (pages parallèles).
- **`/admin` change de sens entre les deux produits** : console du fondateur côté Cartiz (`proxy.ts:74-83`, `role ∈ {admin, root}` lu sur `user_id`), dashboard du restaurateur côté Fideliz (`middleware.ts:41-43`, lu sur `id`). Un gate recopié tel quel ouvrirait la console du fondateur à des restaurateurs, ou l'inverse. Aucun QR n'est en jeu — l'exploitation quotidienne l'est.

**Deux tiers de la surface imprimée Fideliz se transplantent sans arbitrage** : `/play`, `/verify`, `/qr/[id]`, `/auth/callback`, `/super-admin` n'existent pas côté Cartiz ; `/m`, `/f`, `/c`, `/affiche`, `/api/scan` n'existent pas côté Fideliz. **Le chantier de compatibilité des QR se réduit à un seul point dur, plus la question du domaine** — à condition que personne n'introduise `/play` ou `/verify` côté Cartiz entre-temps.

### 3.4 Le domaine — le mécanisme qui transforme une question d'infrastructure en QR papier mort

**Aucun routeur ne lit le Host.** Ni `proxy.ts`, ni `middleware.ts`, ni `vercel.json` (celui de Fideliz ne contient que trois crons ; Cartiz n'en a pas). Si `app.fideliz-app.fr` est simplement rattaché au projet Vercel `cartiz`, **les deux hôtes servent le même arbre de routes**.

**Mais le Host est déjà branché sur ce qui s'imprime.** *Correction majeure d'une lentille qui affirmait le contraire :* deux pages Cartiz le lisent, et ce sont **précisément les deux générateurs de QR**.

- `app/app/qr/page.tsx:36-39` — QR du **menu**, l'URL la plus imprimée du parc : `host = hdrs.get("host") ?? "localhost:3000"`, puis `baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? proto://host`, puis `${baseUrl}/m/${slug}?s=${key}`. Le commentaire du fichier dit « Domaine canonique en prod (QR imprimés = permanents) » — **mais le canonique dépend d'une variable d'environnement, pas d'une constante.**
- `app/app/fidelite/partager/page.tsx:41,44` — QR `/f/<slug>`, même mécanisme.

Or `app/affiche/[slug]/page.tsx:41` fabrique la **même** URL `/f/<slug>` avec un repli dur sur `cartiz.vercel.app`. **Les deux QR de la même URL peuvent donc pointer vers deux domaines différents.**

**Si `NEXT_PUBLIC_SITE_URL` n'est pas défini et qu'un second domaine est rattaché, un restaurateur qui ouvre son écran QR depuis ce domaine imprime un QR pointant vers lui — alors que le mapping prévoit d'arrêter l'ancien domaine après 90 jours.** Cette variable n'a **pas pu être vérifiée** (§6). Tant qu'elle ne l'est pas, la gravité reste indéterminée entre « inerte » et « bloquant ». **C'est le premier point à lever.**

Atténuation qui manquait au constat Wallet : **continuer à servir l'ancien domaine** — déjà un invariant du mapping — suffit à ce que rien ne se coupe.

### 3.5 Ce qui peut bouger

**La marque côté client final tient en deux endroits du menu public** : la description de métadonnée (`app/m/[slug]/page.tsx:52`) et le pied « Carte par Cartiz » (`app/m/[slug]/MenuClient.tsx:205`). **Tout le reste est du dashboard, de l'admin ou du juridique.** Une bascule de marque côté client est peu coûteuse.

Inventaire : ~114 occurrences de « cartiz » dans 71 fichiers Cartiz, ~24 de « fideliz » dans 16 fichiers Fideliz. **Le grep ignore la casse mais pas l'accent** — la marque s'écrit aussi « Fidéliz », ce qui ajoute 6 occurrences côté Cartiz (dont `lib/legal.ts:21`) et une quinzaine dans la seule page `app/confidentialite/page.tsx` côté Fideliz. **L'inventaire sous-compte exactement là où la marque est vue par un humain.**

**La cohabitation des deux marques est déjà la situation actuelle** : `lib/legal.ts:15,18-21` porte l'adresse de contact de l'éditeur sur le domaine ombrelle et déclare `marqueOmbrelle: "Fidéliz"`, avec un commentaire d'intention — **choix assumé, pas oubli** — et les deux pages légales l'importent réellement. Il n'y a pas de secret à préserver.

**Le nettoyage de marque doit être une liste nommée, pas un `sed`** — mais la casse annoncée était surévaluée. Ce qui coûte vraiment : le cache du service worker (`public/scan/sw.js:16`, `"cartiz-scan-v1"`), le préfixe `CARTIZ_MSG` (`app/error.tsx:100-103`), l'identifiant de classe Wallet Google, et le nom du fichier `00000000000000_baseline_fideliz.sql` référencé en dur par un test d'identité.

**Deux risques écartés par la mesure**, et il faut le dire pour ne pas dépenser dessus :
- **La liste blanche `next/image` ne casse rien.** Aucun fichier du dépôt Fideliz n'importe `next/image` (vérifié sur tout le dépôt hors `node_modules`) : les fonds et logos sont posés en `<img>` nu et en background CSS. **Le risque « 200 avec fond blanc » reste entier côté Storage**, pas côté configuration Next.
- **Les passes Wallet ne portent aucune marque à renommer** : `organizationName`, `description`, `logoText` (Apple), `issuerName`, `programName` (Google) valent tous le nom du restaurant, et le code-barres encode le **numéro de série**, pas une URL — donc indépendant du domaine.

**Un point non couvert par les témoins et non tranché :** les URLs de Storage sont stockées **en absolu** des deux côtés (`restaurants.logo_url`, `games.bg_image_url`, et les quatre routes de téléversement Cartiz qui écrivent le résultat de `getPublicUrl()` en base). **Dix fonds prédéfinis portent l'hôte du projet Fideliz écrit en toutes lettres, dupliqués dans deux fichiers** (`app/admin/[slug]/games/new/page.tsx:14-23` et `games/[id]/page.tsx:16-25`). **Une migration SQL ne les atteint pas : il faut un commit.** Et les conventions de chemin sont opposées — Fideliz écrit **à plat** (`custom-bg-<horodatage>.jpg`), Cartiz sous `<restaurant_id>/…`, sur quoi repose toute sa RLS Storage. **On ne peut pas réunir les buckets sans re-chemin, et re-chemin casse toutes les URLs absolues.** Enfin, « logo du restaurant » désigne deux emplacements alimentant deux colonnes `logo_url` sur deux tables qui doivent fusionner en une seule ligne : **pour la-ruche et best-pizza, il faudra trancher lequel des deux logos survit.**

---

## 4. Ce qu'on a cru et qui était faux

C'est souvent la partie la plus utile : elle dit où le raisonnement dérape.

| Ce qu'on a cru | Ce qui est vrai | Leçon |
|---|---|---|
| « Verser les lignes Fideliz dans `restaurants` échoue en 23505 sur 2 des 4 » | Le mapping tranche déjà que l'identité Cartiz est canonique et que les lignes Fideliz **ne sont pas insérées**. Le seul morceau exécutable du dispositif, `verifier.mjs` (467 lignes), **n'écrit rien** — que des sondes et un hachage. L'erreur ne peut survenir que si quelqu'un écrit un script que la décision écrite interdit déjà. | **Un défaut inerte n'est pas un bloquant.** Distinguer « contrainte de conception » de « défaut qui va se déclencher ». |
| « Le QR de Soukara casse le jour où son restaurant Cartiz est créé » | Le proxy intercepte avant la page, et la page appelle `notFound()` sur slug absent. **La casse est immédiate à la bascule, identique avant et après création.** | **Se tromper de calendrier est pire que se tromper de gravité** : ça laisse croire qu'on a du temps. |
| « Supprimer un compte doublon détruit le restaurant et son historique de jeu » (FK `on delete cascade`) | **Déjà corrigé.** `lib/securite/suppression-compte.ts` réattribue `created_by` (`:311`), `owner_id` (`:316`) et `user_id` (`:322`) à l'héritier, revérifie les trois (`:370`), **puis seulement** appelle `deleteUser` (`:385`). Le `CHECKPOINT-MAITRE` le dit à la ligne suivante de celle citée : « Corrigé. » | **Citer une mesure d'avant-correctif comme état actuel.** Il reste un risque réel mais bien plus étroit : un `DELETE` SQL passé à la main hors application pendant la déduplication — consigne d'exploitation, pas défaut de code. |
| « Une policy morte chez Fideliz redevient vivante » | Elle **n'est pas morte** : `root` est accepté par le CHECK Fideliz, la policy est vivante aujourd'hui pour le compte root. Seules trois branches sur quatre sont inatteignables. Et elle lit aussi `p.is_active` et `p.id` : **inhéritable de toute façon.** | Le corps du constat était juste, **le titre en tirait une conclusion que la preuve ne portait pas**. |
| « Aucun des deux dépôts ne lit le Host » | **Deux pages Cartiz le lisent, et ce sont les deux générateurs de QR.** Le fait vrai est plus étroit : aucun **routeur** ne le lit. | **La distinction compte** : le Host est déjà branché sur ce qui s'imprime. C'est le mécanisme qui transforme la question de domaine en QR papier mort. |
| « Chaque écran devra recevoir une garde serveur ; 4 pages Fideliz n'ont aucun point d'accroche » | Le point d'accroche existe **des deux côtés** : `app/app/layout.tsx:15-65` (layout serveur, `user` + `restaurantId` + `loyalty_settings` déjà lus) et `middleware.ts:40-72` (`/admin/:path*`, profil et restaurant en main, **y compris pour les pages clientes**). | **On dimensionnait un chantier de 30 écrans là où il y a deux points de greffe.** |
| « Le heartbeat et l'abonnement Realtime restent muets » | La moitié heartbeat est vraie et pire qu'annoncé (`is_active` toujours `undefined`, `is_blocked` calculé sur `blocked_at` que personne n'écrit). Mais **le handler Realtime ne lit pas la RPC**, il lit `payload.new.is_blocked` (`layout.tsx:79-82`) — exactement la colonne écrite par la route de blocage. Et un second filet existe : la route passe `profiles.is_active` à `false`, que le middleware attrape. | **Mécanisme bancal, pas inopérant.** Et : il existe **deux fonctions homonymes** `check_restaurant_status` dans la baseline (`:465-477` juste, `:479-500` morte) — le layout appelle la mauvaise. Reprendre « la RPC de statut » hérite au hasard de l'une des deux. |
| « Un `sed` global casserait le sel anti-rejeu et le logo des QR » | Le sel n'est qu'un **repli** (`SUPABASE_SERVICE_ROLE_KEY || 'fideliz-salt'`) : en production la clé est présente, le repli est mort. Et le hachage n'alimente qu'un rate-limit d'une heure — l'anti-rejeu réel est par e-mail. Le logo QR : le fichier dit lui-même « Si le fichier est absent, on retombe simplement sur un QR sans logo (aucun blocage) », avec un `onerror` vide. **Seul le test d'identité casse — et c'est un test.** | La recommandation de fond (liste nommée, pas `sed`) reste bonne ; **la gravité annoncée ne l'était pas.** |
| « `crm_notes` et `sales_restaurants` sont des copies exactes, seule la cible de FK diffère » | Vrai pour `sales_restaurants` (contraintes comprises). **Faux pour `crm_notes` : Fideliz n'a AUCUNE clé étrangère**, Cartiz en a deux en cascade. Une note orpheline serait rejetée à l'insertion. | **Annoncer « pas un conflit » sur une table qui en porte un désarme la vigilance au moment du versement.** |
| « Les deux crons se croisent à 03:00 avec risque de lecture déchirée » | Le constat citait `027:74` et `037:84,96` comme définition **courante** de `candidats_push`. **`042_plus_de_plage_de_silence.sql` a réécrit ces fonctions le 8 août 2026**, et `candidats_push` a encore été redéfinie par `070` et `079`. La conclusion ne survit **que par accident** — c'est `042`, non lue, qui rend la collision possible. Et sous MVCC il n'y a pas de lecture déchirée : ce qui reste est une fenêtre TOCTOU de quelques secondes. | **Lire du SQL périmé sauve la conclusion une fois et la retourne la suivante.** Toujours remonter à la dernière migration qui redéfinit l'objet. |
| « Éteindre `doit_changer_mdp` depuis le navigateur est la même faille que le rôle-dans-les-métadonnées » | Écrire son propre rôle, c'est **s'élever en privilège**. Éteindre son propre `doit_changer_mdp`, c'est refuser de faire tourner un mot de passe qu'on détient légitimement : aucun privilège gagné, aucun autre compte touché. | **Défaut d'hygiène, pas faille d'autorisation.** Ne pas mettre dans la même case. |
| « Le `.claude/` et les worktrees ne comptent pas » | Le dépôt Fideliz contient **une copie complète de lui-même** (`.claude/worktrees/…`) et **un dump texte de 14 963 lignes suivi par git** (`mon_projet_sain.txt`, absent du `.gitignore`). Ensemble ils **doublent chaque comptage**. Contrôlé pour des secrets : seule correspondance, une référence de variable d'environnement, sans valeur littérale — **pas de fuite**. | **Deux artefacts à exclure explicitement du périmètre de fusion et de tout inventaire.** Sans `--exclude-dir=.claude`, tous les chiffres sont faux. |

---

## 5. Décisions qui reviennent à Samy

Une ligne, une question fermée, une recommandation. Ce sont des **règles produit** — un choix technique ne peut pas les contredire.

**Schéma et identité**

- **P-1 ✅ TRANCHÉE le 19/08/2026 — `restaurateur` partout, les 7 comptes sont réécrits.** Surface et plan : `p1-restaurateur-partout.md`. *(recommandation d'origine : oui)* Cartiz est la cible, 5 prédicats SQL vivants testent `restaurateur` en dur, et le renommage inverse coûterait la convention appliquée par tout le module fidélité depuis `011`.
- **P-2** — Conserve-t-on `is_active` sur `profiles` (donc le pouvoir de couper un compte sans le détruire) ? → **Recommandé : oui, migration additive.** Cartiz n'a **aucun** mécanisme équivalent ; sans elle, sept lecteurs Fideliz passent au vert et tout compte désactivé redevient actif.
- **P-3** — Conserve-t-on `is_blocked` sur `restaurants`, **et** branche-t-on les policies publiques dessus ? → **Recommandé : oui pour la colonne, oui pour les policies — sauf `/m/<slug>`, `/c/<serial>` et `/verify/<uuid>`, jamais coupés** (voir P-11).
- **P-4 ❌ SANS OBJET depuis P-6** — les deux comptes cohabitent, aucun n'est supprimé. *(question d'origine ci-dessous)*
- **P-4** — Pour best-pizza, quel compte survit — celui qui a réellement servi, l'autre étant supprimé après versement ? → **Recommandé : oui, le compte utilisé survit**, par cohérence avec l'arbitrage la-ruche. À écrire dans un **fichier de correspondance des comptes** au même niveau d'autorité que celui des restaurants ; sans lui l'opérateur tranchera dans l'instant.
- **P-5** — Les 9 comptes Fideliz reçoivent-ils un mot de passe provisoire avec `doit_changer_mdp` posé, plutôt qu'une reprise de leurs empreintes ? → **Recommandé : oui.** Le drapeau est strictement opt-in : sans pose explicite, un provisoire devient permanent à l'insu de tous.
- **P-6 ✅ TRANCHÉE le 19/08/2026 — oui, plusieurs comptes cohabitent.** Aucune migration : l'index Cartiz sur `restaurant_id` n'est pas unique. Deux sites de code se cassent, plan dans `p6-plusieurs-comptes-gerants.md`. *(recommandation d'origine : oui)*, sinon la console root affiche « pas de compte restaurateur » sur la-ruche et best-pizza, et le bouton de réinitialisation refuse — sur les deux seuls vrais clients communs.
- **P-7** — Conserve-t-on la règle « un restaurant = un seul commercial » (index unique Cartiz) ? → **Recommandé : oui.** Fideliz ne l'appliquait pas ; `028:53` documente comment la lever si besoin.
- **P-8** — Une note commerciale reste-t-elle non modifiable (modèle Cartiz : ajout + suppression, pas d'UPDATE) ? → **Recommandé : oui.** Sans arbitrage, la migration appliquera l'un des deux modèles par accident d'ordre d'exécution.
- **P-9** — Le panier moyen a-t-il une seule source, `panier_moyen_cents` en centimes, `avg_basket` abandonné ? → **Recommandé : oui**, avec conversion ×100 explicite. Sinon deux écrans affichent deux paniers moyens pour le même restaurant.
- **P-10** — Pour la-ruche et best-pizza, quel logo survit — celui de Cartiz (`menu-photos/logos/…`) ou celui de Fideliz (bucket `logos`) ? → **Recommandé : celui de Cartiz**, cohérent avec l'identité Cartiz canonique posée par le mapping.

**Gating**

- **P-11** — Une échéance d'abonnement dépassée coupe-t-elle le dashboard et les traitements de fond, **sans jamais couper `/m`, `/c` ni `/verify`** ? → **Recommandé : oui.** Les QR imprimés et les passes déjà installés sont l'interdit explicite du `CLAUDE.md` ; les crons expirés, eux, sont facturés à Samy.
- **P-12** — L'habilitation prend-elle la forme d'une table `restaurant × module` tenue par le vendeur, plutôt que de booléens sur `restaurants` ou d'un enum de plan ? → **Recommandé : oui.** `subscription_plan` n'est qu'un libellé d'affichage ; `is_retention_alert_enabled` est le seul précédent existant du bon modèle.
- **P-13** — L'absence de droit vaut-elle refus (deny-by-default), avec backfill explicite du parc existant à la migration ? → **Recommandé : oui.** `NULL` = « tout permis » des deux côtés aujourd'hui ; sans backfill, l'unification ouvre tout le parc.
- **P-14** — Un admin en impersonation voit-il tout, gating ignoré ? → **Recommandé : oui**, sinon la garde ferme la console de dépannage de Samy.
- **P-15** — Porte-t-on l'anonymisation Fideliz (24 mois, 36 avec consentement) sur `clients` **avant** le versement des 495 contacts ? → **Recommandé : oui, avant.** Sinon une donnée personnelle perd son échéance en changeant de table — et il faudra aussi purger `push_log.message` et `passes.message_push`, qui conservent le prénom rendu.

**Marque et QR**

- **P-16 ✅ TRANCHÉE le 19/08/2026 — le jeu garde `/scan`, le comptoir déménage vers `/comptoir/<slug>`.** Plan et coût mesuré : `p16-le-comptoir-demenage.md`. *(recommandation d'origine : oui)* Le comptoir n'a aucun artefact papier : son déplacement coûte une réinstallation de PWA, celui du jeu coûte du papier chez trois restaurants réels.
- **P-17** — Reste-t-on sur deux projets Vercel et deux domaines distincts, plutôt qu'un projet servant deux hôtes ? → **Recommandé : oui tant que P-18 n'est pas levée.** Un projet unique fait servir le même arbre de routes aux deux hôtes, et les deux générateurs de QR fabriquent leurs URLs à partir du Host.
- **P-18** — Fige-t-on le domaine canonique dans une constante plutôt que dans une variable d'environnement, dans les deux générateurs de QR ? → **Recommandé : oui.** C'est le seul mécanisme qui peut transformer un changement de domaine en QR papier mort, et l'état de la variable n'est pas vérifiable ici.
- **P-19** — L'ombrelle s'appelle-t-elle « Fidéliz » ou « Cartiz » après fusion ? → **Recommandé : trancher explicitement.** `lib/legal.ts` est le fichier unique qui sert les deux réponses ; la cohabitation est déjà visible du client.
- **P-20** — Quel titre porte l'onglet d'une page de jeu atteinte par un flyer ? → **Recommandé : un titre propre par page.** Aujourd'hui « Fideliz Admin », demain « Cartiz — La carte digitale de votre restaurant » : aucune des deux formules n'est celle qu'on montre à un client, et le choix se fait par défaut si personne ne tranche.
- **P-21** — Étend-on le témoin de non-régression à `/verify/<uuid>`, `/c/<serial>`, `/f/<slug>` et `/affiche`, et aux 4 identités du mapping sans fixture ? → **Recommandé : oui, avant la bascule.** Le mapping pose ces URLs en invariant et le témoin ne les surveille pas ; `mpbmeru`, dont l'instruction est « ne pas toucher », n'est contrôlé par rien.
- **P-22** — Le plafond du limiteur de débit redevient-il réglable par jeu, comme chez Fideliz ? → **Recommandé : oui.** Adopter `limite_debit` tel quel (5/60 min codés en dur au point d'appel) est une régression fonctionnelle par rapport à `games.ip_rate_limit_per_hour`.

---

## 6. Ce que ce lot n'a pas mesuré

Sans complaisance. Tout ce qui suit est un trou déclaré, pas un point réglé.

### Aucune base n'a été interrogée

- **Tous les effectifs cités sont repris de documents antérieurs, jamais remesurés** : 4 restaurants Fideliz, 9 comptes Auth, rôles 7/1/1, 495 contacts, 88 objets Storage, 0 ligne dans `crm_notes` et `sales_restaurants` côté Fideliz. Sources : `docs/matrice-conservation-fonctionnelle.md:51-53` et `20260818011000:293-295`. **Si ces documents ont vieilli, tous les coûts chiffrés vieillissent avec eux.**
- **Le nombre de comptes Auth côté Cartiz et leurs rôles : inconnu.** Aucun fichier ne le porte. **Le volume réel de la fusion d'annuaire n'est pas connu**, et la surface du trou Storage (« tout compte authentifié ») n'est donc pas chiffrée.
- **Les valeurs de `profiles.role` réellement utilisées côté Cartiz : non mesurées.** On sait ce que le CHECK autorise, pas ce qui existe, ni combien de comptes portent `admin`.
- **Combien de lignes `restaurants` ont `created_by` NULL côté Fideliz : non mesuré.** La contrainte NOT NULL de Cartiz les rejetterait.
- **Combien de lignes `profiles` ont `role` NULL côté Fideliz : non mesuré.** Le recensement 7+1+1=9 suggère zéro, mais c'est une déduction.
- **Le nombre de lignes de `crm_notes` et `sales_restaurants` CÔTÉ CARTIZ : non mesuré.** La conclusion « fusion à coût zéro » repose sur le vide **côté Fideliz** uniquement. Si Cartiz porte des portefeuilles réels, l'index unique doit être vérifié contre les données avant reprise.
- **Le rattachement effectif des 7 comptes `restaurant` de Fideliz : inconnu.** 7 comptes pour 4 restaurants : au moins un établissement en a plusieurs, ou au moins un compte n'est rattaché à rien.
- **L'unicité de `auth.users.email` dans un projet unique : non vérifiée.** Le raisonnement sur best-pizza tient sans elle (le trou est que le mapping ne dit pas quel UUID survit), mais la prémisse « même adresse des deux côtés » est une **affirmation du document**, jamais vérifiée.
- **Combien de restaurants ont `abonnement_fin` / `subscription_end` à NULL : non mesuré.** C'est pourtant le chiffre qui décide si le défaut permissif est un risque théorique ou immédiat.
- **Le contenu des buckets Cartiz** (`menu-photos`, `flyer-pages`) : ni nombre d'objets ni poids. **Le coût et la durée d'une recopie de buckets ne sont pas connus.**
- **Un 6e restaurant Cartiz a-t-il été créé depuis l'arbitrage du mapping (17/08)** ? Aucun recomptage indépendant.

### Le schéma réel peut différer des fichiers

- **L'état RÉEL du schéma Cartiz est inconnu** : seuls les 81 fichiers de `supabase/migrations/` ont été lus. Une colonne, une contrainte ou une policy posée à la main dans le tableau de bord Supabase est invisible. **C'est exactement ce qui est arrivé à Fideliz**, dont tout le schéma a été construit hors migrations jusqu'en juillet 2026 (`baseline_fideliz.sql:4-6`). **Rien ne garantit que Cartiz y a échappé.**
- **La baseline Fideliz est une reconstruction, déclarée incomplète** par `docs/schema-fideliz-constats.md:118-131` (policies RLS, grants, Storage, pg_cron encore à relever). Le comptage de colonnes en découle : **53 au relevé de production (`docs/01-master-doc-v4.md:16`) contre 51 mesurés par lecture. Deux colonnes échappent, et on ne peut pas exclure qu'elles portent un drapeau d'habilitation.**
- **Il n'a pas été vérifié que les policies décrites sont celles qui tournent en production**, ni pour les 4 tables, ni pour les 8 policies Storage Fideliz, ni pour celles de `001_init_cartiz.sql`. **Un écart fichier/production invaliderait tout le paragraphe RLS.**

### Rien n'a été exécuté

- **Aucun build.** Les cinq collisions de chemin sont déduites des arborescences ; Next n'a pas été vu refuser `/confidentialite`. Le comportement du proxy fusionné n'a pas été observé.
- **Le manifeste invoqué pour prouver que le proxy Cartiz est actif date du build du 13/08 05:50**, alors que le dernier commit est du 19/08. Très probable que le matcher soit toujours compilé (`proxy.ts:99` inchangé), **mais ce n'est pas mesuré sur l'état courant.**
- **Le comportement de PostgREST n'a pas été rejoué** : `.maybeSingle()` sur deux lignes, et un `select` nommant une colonne absente. Les conclusions s'appuient sur le contrat de la librairie.
- **Le témoin de non-régression n'a pas été lancé** (`npm run qr:verifier` émet des requêtes vers les deux productions). **Les statuts 200/307 cités viennent des fixtures versionnées, pas d'une mesure réseau.**
- **Le heartbeat cassé est établi par lecture croisée du client TypeScript et du corps SQL** : solide, mais personne ne l'a joué. Une seconde définition de la fonction en production pourrait le démentir.

### La configuration hors dépôt

- **`NEXT_PUBLIC_SITE_URL` n'a pas pu être vérifiée en production.** C'est la variable qui décide si les deux générateurs de QR retombent sur le Host de la requête, et si les passes déjà émis portent un `webServiceURL` absolu. **La mécanique est prouvée, son ampleur ne l'est pas — et P-18 en dépend.**
- **`RATE_LIMIT_SALT` : posée ou non, inconnu.** Elle **n'est documentée nulle part** dans le dépôt Cartiz — ni `.env.example`, ni doc, ni migration : la seule occurrence est sa propre lecture. **Le repli sur la clé de service — celui qui crée la corrélation d'empreintes — est le chemin par défaut, et rien dans le dépôt ne rappellera de poser la variable.**
- **La commande SQL exacte des tâches pg_cron n'existe dans aucun des deux dépôts** : `grep cron.schedule` rend zéro ligne des deux côtés. Ni l'URL, ni l'en-tête, ni le secret, ni la cadence réelle du job Cartiz. **La cadence « toutes les 15 minutes » est un commentaire de code, pas une mesure.** Une base reconstruite depuis les migrations démarre **sans moteur d'envoi et sans anonymisation RGPD** — panne muette qui peut durer des mois.
- **L'extension employée par le job Cartiz (`pg_net` ? `http` ?) et le rôle sous lequel il tourne : inconnus.**
- **Le plan Vercel des deux projets n'est pas mesuré.** Le commentaire de `app/api/cron/automatisations/route.ts:9` affirme que « le plan Hobby ne permet qu'un cron par jour », alors que le `vercel.json` de Fideliz en déclare trois. **L'une des deux affirmations est fausse et on ne sait pas laquelle** — donc combien des quatre tâches survivraient dans un projet unique n'est pas connu.
- **`.vercel/project.json` n'a pas été lu** (pour ne pas exposer d'identifiants). **Impossible de prouver quels domaines sont attachés à quel projet.** Tout ce qui est dit des domaines vient de documents, pas de mesures.
- **La configuration Auth de Cartiz n'est contrôlée par rien.** Fideliz possède `scripts/preflight-auth.mjs`, documenté comme critère de NO-GO ; Cartiz n'a pas d'équivalent. **L'invariant le mieux gardé de Fideliz — personne ne s'inscrit tout seul — est contrôlé sur le projet qu'on éteint, pas sur celui qui accueille.** Ce réglage ne vit dans aucune migration : aucun `git revert` ne le rétablit.
- **Les gabarits d'e-mails transactionnels ne sont pas inventoriables depuis les dépôts** : les deux produits appellent `resetPasswordForEmail` avec un `redirectTo` construit sur `window.location.origin`. Expéditeur, gabarit et marque vivent dans la console Supabase de chaque projet.

### Zones jamais ouvertes

- **L'ordre d'application des migrations fusionnées n'est pas vérifié.** Cartiz numérote `001`→`080`, Fideliz horodate en `2026…` plus une baseline en zéros. Un tri lexicographique naïf donnerait : baseline Fideliz, puis tout Cartiz, puis les 25 migrations Fideliz — **un ordre qui n'a aucun sens métier.** Ni testé, ni cherché s'il existe une stratégie de renumérotation.
- **Aucune migration de fusion n'existe.** Les 81 migrations Cartiz ne créent aucune table Fideliz et ne touchent pas l'annuaire. **Le plan de versement lui-même n'a pas pu être mesuré** — seulement l'écart entre les deux états.
- **Les 12 autres tables Fideliz et les 24 autres tables Cartiz : jamais regardées.** Idem pour les buckets, les fonctions `SECURITY DEFINER` autres que celles citées, et les tâches pg_cron.
- **Les server actions, une par une.** 20 fichiers Cartiz et 32 Fideliz comptés ; seuls `updateReglagesFidelite`, `reglerAbonnement`, `setSubscriptionAction` et les gardes de `lib/securite/` ont été lus en détail. **On affirme seulement qu'un grep sur `abonnement_fin` et `subscription_end` n'en fait apparaître aucune autre.**
- **`docs/06-spec-fidelite.md` n'a pas été lu règle par règle.** Recherche par mots-clés (abonnement, payant, souscription, module, forfait) : **aucune règle P-xx sur l'habilitation commerciale trouvée** — mais une règle pourrait aborder le sujet sans employer ces mots. **À vérifier avant d'écrire P-11 à P-15 dans la spec.**
- **`system_logs` et `activity_logs_legacy` portent des adresses e-mail et ne sont nommées par AUCUNE règle d'anonymisation** (`anonymize_expired_data` ne traite que `winners`, `contacts`, `winners_archive`). **Volume, ancienneté et équivalent Cartiz : non mesurés. Trou de rétention signalé, non instruit.**
- **Les 4 tables `_backup_20260606`** restent hors de toute règle d'anonymisation ; leur sort est en attente de décision (`docs/decision-tables-de-sauvegarde.md`, lot 4). Non réinstruites ici.
- **L'effet des renommages annoncés `winners → recompenses_client` et `prizes → recompenses_catalogue`** sur `anonymize_expired_data()` et `archive_redeemed_winners()` : **non mesuré.** Le master-doc les annonce, aucune migration ne les porte encore.
- **L'impact des en-têtes de sécurité Cartiz** (`X-Frame-Options: DENY`, `frame-ancestors 'none'`, `next.config.ts:35-64`) sur les pages Fideliz fusionnées : non évalué. Il n'a pas été cherché si une page de jeu est encadrée quelque part.
- **`/Users/samy/fideliz-app/sauvegardes/2026-08-17T23-29-29` : non ouvert.** Peut contenir des adresses réelles ; rien ne justifiait de le lire.
- **Quelle forme d'URL figure sur quel support papier : inconnu**, et le `README` l'annonce lui-même comme tel. Aucun flyer physique n'a été scanné.
- **Une installation PWA existe-t-elle réellement sur une tablette de caisse au scope `/scan/<slug>`** ? Non vérifiable — cela aggraverait la collision `/scan`. Fideliz n'a, lui, aucun manifeste ni service worker.
---

# Contrôle Claude — ce que j'ai vérifié moi-même

Les agents relèvent, je vérifie. J'ai rouvert sept affirmations parmi les plus
lourdes de ce document, le 19/08/2026. **Trois confirmées, deux fausses, un
manque.**

## ✅ Confirmé

| Affirmation | Ce que j'ai mesuré |
|---|---|
| `restaurants.name text not null` **sans défaut** bloque le DDL | `baseline_fideliz.sql:141` — exact. Ajout nullable → backfill → `set not null` est bien obligatoire. |
| Les deux CHECK sur `profiles.role` | Fideliz `{root, sales, restaurant}` (`baseline:370`), Cartiz `{admin, root, sales, restaurateur}` (`011_fidelite.sql:28`). Intersection `{root, sales}` — exact. |
| `/scan/[slug]` existe **des deux côtés** | `fideliz-app/app/scan/[slug]` et `cartiz/app/scan/[slug]`. Collision réelle, et c'est la plus dure : `app.fideliz-app.fr/scan/la-ruche` est un QR **imprimé et en service**. |
| Deux paniers moyens dans deux unités | `restaurants.avg_basket numeric default 15` en euros (`baseline:170`) contre `loyalty_settings.panier_moyen_cents int default 1200 check (between 100 and 50000)` (`014_panier_moyen.sql:9-10`). Recopier 15 donnerait 15 centimes — rejeté par le CHECK. Le rejet est une chance, pas une protection. |

## ❌ Faux — deux corrections

### 1. Cartiz porte **26** colonnes sur `restaurants`, pas 19

Le document dit 19, et précise que « le recomptage indépendant du sceptique
confirme ». Les deux se sont trompés de la même façon : ils ont compté les
`add column` des migrations, ce qui en rate.

Mesuré sur `lib/database.types.ts`, **généré depuis la vraie base** — la seule
autorité ici :

```
abonnement_debut, abonnement_fin, adresse, banniere_url, created_at,
created_by, email_contact, geoloc_adresse, geoloc_lat, geoloc_lng,
geoloc_message, horaires_actifs, horaires_json, id, logo_url, nom,
notification_envoyee_at, notification_limitee, notification_message, publie,
slug, telephone, theme_json, updated_at, vue_defaut, vue_premier
```

**Le chiffre de 48 colonnes à ajouter reste juste** : il se calcule sur les 53
colonnes Fideliz moins les 5 noms communs (`id`, `slug`, `logo_url`,
`created_by`, `created_at`), et ne dépend pas du total Cartiz. La conclusion
tient ; c'est la mesure intermédiaire qui était fausse.

### 2. `name` / `nom` n'est **pas** le seul couple de synonymes

Le document l'affirme explicitement. Il en existe au moins un second, que ni la
lentille ni le sceptique n'ont vu :

| Fideliz | Cartiz |
|---|---|
| `contact_email` (`baseline:171`) | `email_contact` (`049_coordonnees_etablissement.sql:17`) |

Presque un palindrome — exactement le genre de paire qu'un balayage de noms
communs ne signale pas, puisque les noms *diffèrent*. Après fusion additive, la
table porterait **les deux**, remplies par deux écrans différents.

## ⚠️ Manque — une troisième notion en double

Non relevée par le document : **l'abonnement existe des deux côtés, avec deux
vocabulaires**.

| Fideliz | Cartiz |
|---|---|
| `subscription_end`, `subscription_plan` | `abonnement_debut`, `abonnement_fin` |

Ce n'est pas une collision de noms, donc rien ne la signale — mais c'est
directement le sujet de la section 2 (le gating). Deux mécanismes d'abonnement
qui coexistent après fusion, c'est deux réponses possibles à « ce restaurant
a-t-il payé ». À arbitrer avec le reste du gating.

## Ce que ce contrôle ne dit pas

Je n'ai vérifié que sept affirmations sur 73. Les autres portent leur verdict
de réfutation, pas le mien. Le document reste ce qu'il annonce : une synthèse
d'arbitrage lue sur fichiers, jamais confrontée à la base Cartiz — que je n'ai
d'ailleurs pas dans mes accès.
