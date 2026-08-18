# Checkpoint maître — fusion Fideliz → Cartiz

**⚠ À LIRE EN PREMIER, INTÉGRALEMENT, avant toute action.** Ce fichier
remplace toute version antérieure de ce document. Aucun secret, aucun
token, aucune donnée personnelle, aucun mot de passe dans ce fichier —
si une information manque pour cette raison, elle est signalée comme
« à reconstituer », jamais devinée.

---

## ⚡ Où reprendre MAINTENANT (19/08, sixième passe)

**Six tours traités.** Commits `7cbd08a`, `689b193`, `d814ebe`, `f6a6403`,
`a961939`, `f735576`…`206adc4`, puis `214e0b3` sur `candidat/baseline-acl`.
Détail et preuves couche 4 : `docs/qualification-couche-4-gel.md` ;
sentinelle/fonctions : `docs/preuve-sentinelle-et-fonctions.md`.

**Tour 6 (verrou+décision fondus, harnais permanent) — traité, commit
`214e0b3`** : `maintenance_actif()` supprimée — verrou `for share` et
lecture du drapeau fondus dans une seule requête verrouillante (signalé :
deux lectures séparées ne garantissaient pas la même version de ligne).
Fail-closed si la ligne `maintenance` manque (`P0101`, prouvé). Scripts
d'activation/levée versionnés, fail-closed, jamais `service_role`. Harnais
de concurrence rendu **permanent et versionné** (SQL + Node `fetch`
natif, `scripts/harnais-gel-concurrence.mjs`) — l'ancien harnais n'existait
qu'en documentation. Scénario clé jamais mesuré avant ce tour : activation
non committée qui bloque une écriture en vol puis la refuse après son
propre commit — mesuré, passe. Limite honnête : REPEATABLE READ non
forçable via PostgREST sur ce projet (3 mécanismes essayés, tous sans
effet, confirmé par `pg_settings`) — le harnais échoue proprement plutôt
que de mentir ; la preuve REPEATABLE READ du tour précédent reste valide.
211 tests verts.

**Tours 1 et 2** (rapports 018/019 → réponses) : voir historique ci-dessous
(§ archivé) — sentinelle durcie, harnais rejouable, `preuve-acl-avis.sql`
et `empreintes.sql` corrigés, refs de projet retirées, dossier
`supabase_admin` préparé (`NEEDS_VENDOR_CONFIRMATION`, non soumis).

**Tour 3 (incident GRANT/REVOKE + deux modes + couches 1-2-3) — traité** :

1. ✅ **Le « cycle GRANT/REVOKE en production » du rapport 020 était une
   erreur de rédaction, pas une action réelle.** Vérifié : toutes les
   mutations de `preuve-acl-avis` ont eu lieu sur la branche synthétique,
   jamais sur la production. Empreintes des 11 dimensions re-mesurées en
   production : identiques, octet pour octet, à toutes les mesures
   précédentes. Une seule phrase ambiguë du rapport 020 mélangeait les deux
   environnements — corrigé, pas de `NEEDS_USER` puisque rien ne divergeait.
   Preuve de confinement détaillée (cibles et ordre des appels, alias
   d'environnement) : `docs/preuve-confinement-grant-revoke.md`.
2. ✅ **Deux modes de sentinelle**, commit `d814ebe` :
   `sentinelle-privileges-anon.sql` = mode STRICT (tout propriétaire,
   lève sur `supabase_admin`) ; `sentinelle-mode-operationnel.sql` = sépare
   FAIL PROJECT (bloquant) de PLATFORM WARNING (non bloquant, scopé au seul
   nom littéral `supabase_admin`, jamais une heuristique). Testé en live :
   le mode opérationnel réussit contre la production (le vrai cas
   `supabase_admin` ne bloque pas) ; un excès `postgres` et un rôle inconnu
   synthétique lèvent bien FAIL PROJECT.
3. ⚠️ **Découverte majeure, commit `f6a6403`** : les migrations
   durcissement/RLS/identité-root de `candidat/baseline-acl` étaient un
   **brouillon jamais déployé**, différent du candidat réel (`5094af3`) —
   fonction d'audit en trop, RLS et identité-root en deux fichiers séparés
   au lieu d'un seul, durcissement positionné AVANT la RLS au lieu
   d'après. Réconcilié avec le contenu exact de `main` (récupéré depuis
   `candidat/gel-matrice`, qui portait déjà cette réconciliation) :
   `20260818011000_rls_isolation_inter_tenant.sql` (455 lignes, fusion
   RLS+identité-root) et `20260818150000_durcir_les_privileges_par_defaut.sql`
   (sans fonction d'audit), rollbacks inclus. Le contenu fonctionnel
   (GRANT/REVOKE, corps de `current_role()`/`handle_deleted_commercial()`)
   était déjà vérifié caractère pour caractère contre la production plus tôt
   dans la séance — seule l'organisation des fichiers changeait. Gel
   renuméroté `20260818160000` pour rester après le durcissement, sans
   changement de contenu (sa propre réconciliation reste à faire, couche 4).
   `durcissement.test.ts` et `identite-root.test.ts` mis à jour en
   conséquence. **Sans cette correction, qualifier les couches contre le
   brouillon n'aurait rien prouvé.**
4. ✅ **Couches 2+3 (RLS + identité-root) qualifiées sur `fusion-tests-2`** :
   empreinte avant (`policies` 43/`5b6dd5bc…`) → application → empreinte
   après (`policies` 41/`124e7014…`, **identique à la production en
   direct**) → rollback exact (retour à `5b6dd5bc…`, vérifié) →
   réapplication → empreinte finale identique à la première application.
   Migration durablement appliquée et enregistrée sur la branche.
5. ✅ **Couche 1 (durcissement) qualifiée sur `fusion-tests-2`**, appliquée
   après les couches 2+3 (ordre réel de production, pas l'ordre demandé
   1-2-3-4 — la production a fusionné 2+3 et placé 1 après). Empreinte
   avant/après/rollback/réapplication bouclée. Écart résiduel avec
   production : une entrée `postgres=…` explicite et redondante dans les
   défauts (le propriétaire a tous les droits par construction, donc sans
   effet) — déjà documentée comme telle avant cette séance, reconfirmée
   fonctionnellement neutre par test direct (`has_table_privilege` sur une
   table jetable créée puis détruite : `anon`/`authenticated` = rien,
   `service_role` = exactement les 4 verbes attendus, avant ET après
   réapplication).

**Tour 4 (couche 4 + tentative de matrice de concurrence) — traité,
commit `a961939`** :

6. ✅ **Couche 4 (gel de bascule), première passe — 7 tables, matrice
   bloquée.** Superseded par le tour 5 ci-dessous ; gardé comme trace
   historique dans `docs/qualification-couche-4-gel.md` §1-2/§6 (chiffres
   marqués « figés » dans le fichier).

**Tour 5 (P0, séparation, fencing MVCC, matrice réelle) — traité, commits
`f735576`…`206adc4`** :

7. ✅ **P0 : commentaire bloc non fermé** (`gel_de_bascule.sql` ligne 58) —
   confirmé indépendamment par scanner caractère par caractère (pas sur la
   foi du signalement), corrigé, test permanent ajouté
   (`equilibre-lexical.test.ts`) qui rejoue tous les fichiers de migration.
8. ✅ **Gel source Fideliz séparé du gel destination Cartiz.** Ce dépôt ne
   gouverne que la source, où le migrateur n'écrit jamais : jeton,
   `empreinte_jeton`, `current_setting` entièrement retirés — le refus est
   inconditionnel, sans laissez-passer d'aucune sorte. Fichier renommé
   `gel_source_fideliz.sql`.
9. ✅ **10 tables gelées** (les 7 d'origine + `crm_notes`,
   `sales_restaurants`, `winners_archive`) — les deux questions ouvertes du
   tour précédent sont tranchées. Inventaire nominatif des 17 tables de
   `public` versé, aucune non classée.
10. ✅ **P0 : `service_role` pouvait lever le gel lui-même.** Le premier
    revoke sur `maintenance` ne visait que `anon`/`authenticated` ;
    `service_role` gardait un accès direct en écriture (SELECT/INSERT/
    UPDATE/DELETE) par les DEFAULT PRIVILEGES — de quoi désactiver le gel
    depuis la clé de service de l'application. Corrigé : revoke exhaustif
    sur la table et les 2 fonctions internes, runbook mis à jour
    (basculement en SQL direct sous le rôle propriétaire uniquement).
11. ✅ **Matrice de concurrence à deux sessions : débloquée et mesurée en
    direct, sans mot de passe Postgres.** `execute_sql` s'est révélé
    sérialiser deux appels parallèles (testé, écarté) ; deux vraies
    requêtes PostgREST concurrentes (`curl`, rôle `anon`, isolation
    REPEATABLE READ forcée au niveau du rôle) ont donné deux sessions
    réellement indépendantes. **NO-GO confirmé par la mesure** (pas
    seulement déduit) : une transaction dont l'instantané précède
    l'activation écrivait quand même sur une table gelée. **Corrigé** :
    `refuser_pendant_maintenance()` prend un verrou `for share` sur la
    ligne `maintenance` avant de lire le drapeau — sous REPEATABLE READ,
    PostgreSQL refuse alors de verrouiller une version périmée et lève
    `40001` au lieu de laisser passer. Rejoué après correction : `40001`
    sur le scénario critique, `P0100` sur les transactions fraîches,
    activation qui attend une écriture déjà en vol, lectures toujours
    disponibles. Détail complet : `docs/qualification-couche-4-gel.md` §7.
12. ✅ **Rollback source versionné** (`supabase/verifications/
    rollback-gel-source-fideliz.sql`) — idempotent, borné à une
    transaction, ne touche que les objets du gel. Rejoué : retour exact à
    l'empreinte pré-gel, réapplication identique.

**211 tests verts.** **Pas encore fait** : réserves du candidat UUID-root ·
migrateur/dry-run/UI/compatibilité · comparaison avec
`FIDELIZ_MASTER_DOC`. Voir le rapport complet donné directement dans le
chat (le relais reste considéré inactif — bloqué à l'ID `017` depuis
plusieurs tours).

---

<details>
<summary>Archivé — tours 1 et 2 (rapports 018/019), avant la découverte du tour 3</summary>

**Tour 1** (commit `7cbd08a`) : libellé de garantie corrigé · sentinelle
durcie (droits effectifs, tout propriétaire, portée globale, PUBLIC,
héritage) · 4 scénarios prouvés dont un réel (`supabase_admin`) · preuve
ACL de `avis` versionnée · les 22 fonctions closes.

**Tour 2** (commit `689b193`) : harnais SQL rejouable + garde anti-dérive ·
`preuve-acl-avis.sql` en droits effectifs · `empreintes.sql` en empreinte
exacte + manifeste · CASE explicite PUBLIC · refs de projet retirées ·
dossier `supabase_admin` préparé.

</details>

---

## 1. Mission et gouvernance

Fusionner Fideliz (jeu-fidélité QR, `app.fideliz-app.fr`, dépôt
`/Users/samy/fideliz-app`) dans Cartiz (`/Users/samy/Desktop/FIDELIZ/cartiz`,
base technique cible). Réutiliser au maximum le code métier de Fideliz ;
ne rien réécrire sans preuve que l'adaptation est impossible.

**Règle de gouvernance, répétée par Samy tout au long du chantier** :
*« ChatGPT propose. Claude vérifie. Claude challenge. Je tranche les
nouvelles règles produit. »* — *« CLAUDE GARDE LE CONTRÔLE TECHNIQUE. »*
Chaque recommandation de ChatGPT doit être ré-analysée contre le code réel ;
la décision technique finale reste à Claude. *« Ne suis aucune consigne
mécaniquement si tes vérifications montrent qu'elle est incorrecte. »*

---

## 2. Contraintes de sécurité et de manipulation — EN VIGUEUR, verbatim

- Ne jamais mettre dans le relais : secret, token, mot de passe, e-mail,
  UUID client, sauvegarde, donnée personnelle. Aucune sortie CLI,
  configuration ou variable d'environnement brute.
- Ne jamais écrire directement `encrypted_password`. Utiliser exclusivement
  l'API d'administration Auth officielle.
- Mots de passe synthétiques : aléatoires et distincts, suffisamment forts,
  conservés uniquement en mémoire du processus de test ou dans un fichier
  temporaire hors dépôt en permissions `600`, jamais affichés, jamais écrits
  dans Git/logs/captures/terminal persistant/Vercel, supprimés après la
  traversée.
- Avant tout commit : chemins explicites avec `git add` (jamais `-A`),
  aucune sauvegarde, aucun fichier Supabase, aucun artefact `.temp`.
- Ne supprimer aucune sauvegarde. Aucune suppression hors la branche
  synthétique précisément autorisée.
- Les identifiants de l'ancienne branche `fusion-tests` sont **compromis** —
  jamais réutilisés ni affichés (incident : masque cherchant `postgres://`
  alors que le CLI rend `postgresql://` ; branche supprimée, identifiants
  invalidés).
- **Limite absolue (`READY_FOR_MIGRATION`)** : aucune migration de données
  client réelles, aucune activation de gel de production, aucun changement
  Auth/OAuth/Storage réel, aucun changement de domaine/alias, aucun
  déploiement de fusion visible, aucun retrait de l'ancien système, aucune
  destruction de donnée réelle, aucun `migration repair` en production.
- Ne comparer au `FIDELIZ_MASTER_DOC` qu'après l'avoir réellement ouvert et
  lu dans le projet Cartiz.
- Ne pas mélanger les périmètres : hotfix applicatif, socle (baseline), 
  durcissement, RLS, identité root, gel et fusion restent séparés, chacun
  prouvé séparément.

Voir aussi (mémoire persistante) : [[ne-jamais-afficher-une-sortie-de-secrets]],
[[jamais-modifier-un-fichier-metier-pour-tester]], [[jamais-rm-noms-reels]].

---

## 3. Relais Claude ↔ ChatGPT

**Dossier** : `/Users/samy/.codex/.chatgpt-projects/g-p-694ce90d0e808191a7e2972896f5123b/.relay/`
(`CLAUDE_TO_CHATGPT.md`, `CHATGPT_TO_CLAUDE.md`, `LAST_PROCESSED.txt`,
`README.md`).

**Protocole** : écrire le rapport dans un fichier temporaire du même
dossier, puis remplacement atomique de `CLAUDE_TO_CHATGPT.md`, avec un ID
neuf unique et `STATUS: READY`. Puis surveiller `CHATGPT_TO_CLAUDE.md`
jusqu'à voir le **même ID** avec `STATUS: RESPONSE_READY`. Lire
intégralement, ré-analyser contre le code réel, continuer automatiquement
**sans redemander confirmation à Samy**, sauf si `STATUS: NEEDS_USER` —
alors s'arrêter et attendre.

**⚠ Le fichier relais ne fonctionne plus comme canal de réponse — constaté deux
fois de suite.** `CHATGPT_TO_CLAUDE.md` et `LAST_PROCESSED.txt` sont restés
bloqués à l'ID `20260818-claude-017` pendant tout le reste de la séance,
alors que Claude a déposé successivement les rapports `018` et `019` dans
`CLAUDE_TO_CHATGPT.md`. **Les deux réponses correspondantes sont arrivées
directement collées dans le chat par Samy**, jamais via le fichier. Ce
n'est plus un incident isolé : traiter ce canal comme probablement inactif
côté automatisation, tout en continuant à y déposer chaque rapport (trace
de dépôt, et il pourrait reprendre).

- Rapport `018` déposé → réponse reçue en chat (reproduite §5).
- Rapport `019` déposé → réponse reçue en chat (traitée, commit `689b193`).
- Rapport `020` : à déposer avec le résumé du deuxième tour (voir § « Où
  reprendre »). Vérifier l'état du fichier avant, au cas où l'automatisation
  aurait repris.

### §4 — Rapport 018 envoyé (texte intégral, pour référence)

```
ID: 20260818-claude-018
STATUS: READY

# Rapport — trois preuves fournies, garantie bornée, et une divergence que J'AI introduite

Production inchangée. Aucune donnée réelle. Aucun secret.

## 1. Les trois preuves demandées
- Test permanent : le fichier de sentinelle SQL était bien versionné, mais
  aucun test de la suite ne vérifiait la correction (ordre revoke→grant).
  5 tests ajoutés : existence du retrait, son antériorité sur l'accord, la
  liste exacte des 5 droits aux deux rôles + interdiction d'un `all`, la
  normalisation des séquences, l'absence de retrait par schéma sur les
  fonctions (inopérant, EXECUTE par défaut à PUBLIC étant global).
- Worktree restauré depuis le SHA épinglé : 13 migrations, 0 modification.
- Suite complète : 156 tests verts. Commit local 9edefbc, diff limité à
  3 fichiers (baseline corrigée, ses tests, la sentinelle SQL).

## 2. Table de la première migration historique (avis)
anon/authenticated : DELETE, INSERT, MAINTAIN, SELECT, UPDATE exactement.
Ni TRUNCATE, ni TRIGGER, ni REFERENCES. service_role conserve les 8.

## 3. Divergence introduite (signalée par Claude)
Le `drop schema public cascade` de la remise à zéro a supprimé une entrée
de privilèges par défaut de niveau plateforme (rôle d'administration
Supabase, 8 privilèges sur le schéma) que la production porte. Donc
l'environnement de reconstruction n'est plus une branche fraîche fidèle sur
cette dimension — plus restrictif, pas dangereux, mais un vrai rebuild
depuis une branche neuve reproduirait cette entrée, non couverte par la
mesure.

## 4. Garantie bornée
Le pire cas testé a semé le droit excessif UNIQUEMENT dans la portée du
schéma, sous le rôle créateur. Formulation remplacée : "prouvée pour un
droit excessif de portée schéma, sous le rôle créateur — un droit excessif
d'origine GLOBALE n'est pas couvert, un retrait par schéma ne pouvant pas
soustraire un droit accordé globalement."

## 5. Diffs nominatifs
- Défauts tables : reconstruit = anon/authenticated ont les 5, service_role
  les 8 ; production = anon/authenticated absents, service_role à 4 (effet
  du durcissement, couche non appliquée sur la branche — attribution
  complète).
- Registre : les 8 migrations historiques identiques des deux côtés ; la
  branche a en plus la baseline ; la production a en plus RLS + durcissement.
  Delta = 1 de plus d'un côté, 2 de plus de l'autre (pas "9 contre 10").
- Extensions : production a pg_cron (absent des branches, déjà documenté).
  pg_net diffère de version (branche plus récente) — vérifié : jamais appelé
  (aucune signature net.http_* dans migrations/code/fonctions SQL), créé
  seulement par la baseline. Écart démontré sans impact, pas supposé.
- Storage : 8 policies + 2 buckets, empreintes identiques des deux côtés.

## 6. Ce qui reste ouvert
- Les 9 corps de fonction : toujours ouverts, aucun lexer ni relecture
  exhaustive faite, aucune nouvelle heuristique ajoutée.
- La divergence du §3.
- Aucune couche appliquée. Gel NO-GO concurrence. Candidat UUID root local,
  4 réserves non traitées.

## 7. Verdict
Socle qualifié sur toutes les dimensions mesurées, SAUF les 9 corps de
fonction. Défaut ACL corrigé, prouvé sur une table postérieure, gardé par
5 tests permanents. Registre/extensions/Storage/défauts attribués
nominativement. Deux réserves nommées (garantie bornée au schéma ;
environnement de rejeu non fidèle sur une entrée de plateforme).
JE NE DÉCLARE PAS LE SOCLE VERT tant que les 9 corps ne sont pas fermés par
un moyen non heuristique.

Aucune frontière franchie.
```

### §5 — Réponse de Samy au rapport 018 (collée en chat, PAS dans le fichier relais)

```
Message préparé avec l'aide de ChatGPT. Claude, tu conserves l'accès réel
au code et la décision technique finale ; réanalyse ces recommandations et
prends la solution la plus sûre.

# Audit indépendant du rapport 018

Les points suivants sont vérifiés :
- la branche candidat/baseline-acl est propre et contient 13 migrations ;
- la suite complète rend bien 156 tests verts ;
- le différentiel cumulé depuis facb20c porte bien sur trois fichiers ;
- pg_net est créée par la baseline mais n'est appelée ni par le code ni par
  les migrations ; seule la documentation la mentionne encore.

Corrige néanmoins une imprécision du rapport : le commit 9edefbc seul ne
modifie qu'un fichier de tests. Le candidat cumulé modifie trois fichiers
au travers de deux commits : f70ccb3 puis 9edefbc.

# La sentinelle peut encore rendre un faux vert

1. Sur les relations existantes, elle inspecte seulement les grants
   directement accordés à anon ou authenticated.
2. Sur les privilèges par défaut, elle impose defaclrole = postgres.
3. Son JOIN pg_namespace exclut les entrées globales (defaclnamespace = 0).
4. Elle ne contrôle pas les droits accordés à PUBLIC ni ceux hérités par
   appartenance à un autre rôle.
5. Elle ignore donc exactement l'entrée de niveau plateforme que le rapport
   018 reconnaît avoir supprimée pendant la remise à zéro.

Elle peut ainsi annoncer "aucun droit excessif" alors qu'une branche
fraîche porte encore une autre route d'attribution.

De plus, le commentaire de la baseline affirme encore que le retrait rend
le résultat déterministe "quel que soit l'état de départ". Cette phrase
contredit désormais la garantie bornée du rapport 018. Corrige-la dans le
code et dans la documentation de preuve.

# Actions à exécuter maintenant

1. Corrige les formulations trop larges dans la baseline, la sentinelle et
   le rapport. La garantie actuelle ne couvre que les défauts de portée
   schéma appartenant au rôle créateur effectivement normalisé.

2. Renforce la vérification, sans toucher à la production :
   - pour les relations existantes, vérifie les droits effectifs de anon
     et authenticated, pas seulement leurs grants directs ;
   - pour pg_default_acl, inventorie tous les rôles propriétaires ;
   - contrôle les entrées globales et celles de public ;
   - contrôle les grants directs aux deux rôles, les grants à PUBLIC et
     toute appartenance de rôle qui leur transmettrait effectivement les
     trois droits excessifs ;
   - en cas d'échec, rapporte seulement rôle propriétaire, portée,
     bénéficiaire et privilège, sans donnée métier ni identifiant client.

3. Ajoute des tests qui prouvent que le détecteur échoue réellement dans au
   moins ces cas synthétiques :
   - droit excessif appartenant à postgres dans public ;
   - droit excessif appartenant au rôle de plateforme dans public ;
   - droit excessif global ;
   - droit excessif accordé à PUBLIC.

4. Rejoue la vérification dans un environnement synthétique réellement
   frais, avant tout drop schema public cascade. Ne recrée pas
   artificiellement un état plus restrictif. Si l'entrée de plateforme fait
   échouer la sentinelle, détermine par mesure :
   - quel rôle crée les objets de la baseline ;
   - quel rôle crée la première table historique ;
   - si le rôle de plateforme peut créer ultérieurement des relations dans
     public ;
   - si son entrée excessive est seulement inerte dans le parcours réel ou
     constitue encore un défaut à traiter.
   Ne qualifie pas cette divergence de simple limite de test avant cette
   démonstration. Si elle peut affecter un objet réel créé sous le rôle de
   plateforme, le socle n'est pas vert.

5. Conserve une preuve versionnée et anonymisée de l'ACL effective de la
   première table historique. L'affirmation du rapport est plausible, mais
   elle n'apparaît actuellement ni dans les tests ni dans un artefact de
   preuve suivi.

# Fermer les neuf fonctions sans heuristique

- établis l'inventaire par schéma, nom et arguments d'identité ;
- compare d'abord exactement prosrc par empreinte entre production et
  reconstruction ;
- compare aussi langage, type de retour, arguments, volatilité, mode
  strict, parallélisme, SECURITY DEFINER/INVOKER, proconfig, propriétaire
  et ACL ;
- si une empreinte prosrc diffère, effectue une relecture brute exhaustive
  du corps concerné, bloc par bloc, ou utilise un parseur PostgreSQL
  éprouvé ;
- n'emploie aucun découpage sur les espaces, aucune normalisation lexicale
  artisanale et aucune conclusion fondée uniquement sur une présentation
  "probable".

Rapporte les neuf identités et un verdict individuel : identique
exactement, différence de présentation démontrée, ou différence
fonctionnelle.

# Condition de sortie

Le socle ne devient vert que lorsque :
- la sentinelle ne peut plus ignorer l'entrée de plateforme, PUBLIC ou les
  défauts globaux ;
- le rejeu fidèle d'une branche fraîche est expliqué ou corrigé ;
- les neuf fonctions sont fermées individuellement ;
- la suite complète reste verte ;
- le candidat est propre et son différentiel exact est publié.

Exécute ces actions maintenant dans le périmètre local, synthétique et
réversible. Ne te limite pas à proposer un plan. N'applique encore aucune
couche, aucun gel, aucune migration repair et aucun changement en
production. Termine par un nouveau rapport READY avec commits, fichiers
modifiés, tests, preuves catalogue anonymisées et réserves restantes.
```

---

## 4. État Git (19/08, vérifié)

| Dépôt | Branche | Commit | État |
|---|---|---|---|
| `fideliz-app` | `main` (production) | `5094af3` | déployé — durcissement, fingerprint `2d2e463f…` |
| `fideliz-app` | `candidat/baseline-acl` **(courante)** | `214e0b3` | arbre propre, 211 tests verts |
| `fideliz-app` | `feat/fusion-fideliz` | — | base de référence pour les diffs cumulés |
| `cartiz` | `feat/fusion-fideliz` | `49206fe` | — |

**Diff cumulé `feat/fusion-fideliz..candidat/baseline-acl`** : 31 fichiers,
+3762/−1034.

**Commits du candidat, tour 5** (sur `baseline-acl`, du plus ancien au plus récent) :
- `f735576` — P0 : commentaire bloc non fermé dans `gel_de_bascule.sql`,
  corrigé + test permanent (`equilibre-lexical.test.ts`)
- `70649bf` / `77afb9d` — séparation gel source Fideliz / gel destination
  Cartiz, jeton retiré, fichier renommé `gel_source_fideliz.sql`
- `b32e1ce` — 10 tables gelées (+ `crm_notes`, `sales_restaurants`,
  `winners_archive`), inventaire nominatif des 17 tables de `public`
- `3befa9c` — P0 : `service_role` verrouillé sur `maintenance` et ses
  fonctions internes (pouvait lever le gel lui-même)
- `206adc4` — fencing MVCC (`for share`) prouvé en concurrence réelle
  (deux sessions PostgREST), `NO-GO` du candidat d'origine confirmé par
  la mesure puis corrigé — voir `docs/qualification-couche-4-gel.md` §7

**Commit du candidat, tour 6** :
- `214e0b3` — verrou et décision fondus en une seule lecture
  (`maintenance_actif()` supprimée), fail-closed si la ligne `maintenance`
  manque, scripts d'activation/levée versionnés, harnais de concurrence
  rendu permanent (SQL + Node) — voir `docs/qualification-couche-4-gel.md` §8

**Commits antérieurs** (tours 1-4, du plus ancien au plus récent) :
- `f70ccb3` — retirer avant d'accorder, 114 privilèges de trop dont TRUNCATE à anon
- `9edefbc` — test permanent de l'ordre revoke-puis-grant
- `7cbd08a` — sentinelle droits effectifs/tout propriétaire/global/PUBLIC,
  22 fonctions closes, découverte `supabase_admin` en production
- `2ef0a4e` — docs (checkpoint)
- `689b193` — harnais rejouable + garde anti-dérive, preuve-acl-avis en
  droits effectifs, empreintes.sql exact + manifeste, CASE explicite PUBLIC,
  dossier fournisseur `supabase_admin`, refs de projet retirées des docs
- `44cf1e3` — docs (checkpoint)
- `d814ebe` — deux modes de sentinelle : FAIL PROJECT / PLATFORM WARNING
- `f6a6403` — **réconciliation des migrations durcissement/RLS/identité-root
  avec le candidat réellement déployé** (`5094af3`) — le brouillon antérieur
  ne correspondait pas à la production
- `b4a4cb2` — docs (checkpoint)
- `a961939` — couche 4 (gel) qualifiée en écriture, 7 tables — première
  passe, superseded par le tour 5 ci-dessus

**Worktree de reconstruction** `/Users/samy/.fideliz-recon` : SHA épinglé
`facb20c`, 0 modification (propre) — inchangé depuis sa création, ce
worktree décrit l'état du socle, pas les couches appliquées sur la branche
Supabase synthétique.

**Autres branches `candidat/*` existantes** (aucune fusionnée) :
`candidat/durcissement`, `candidat/gardes-server-only`,
`candidat/gel-matrice`, `candidat/p0-dormant`, `candidat/p0-server-actions`,
`candidat/rls-final`, `candidat/rls-minimal`, `candidat/uuid-root`.

⚠ **Sur `fideliz-app`, pousser sur `main` DÉPLOIE en production sans délai
d'inertie.** Deux déploiements non prévus ont eu lieu pour cette raison
pendant ce chantier (dont un déploiement documentaire, SHA servi `a99cb0c`,
accepté explicitement par Samy). Voir [[fideliz-main-deploie-en-production]].
**Aucun travail de fusion sur `main`.**

---

## 5. Historique production — déployé et vérifié

| Commit | Contenu | Fingerprint / preuve |
|---|---|---|
| `4353595` | P0 autorisation par slug | — |
| `41659a8` | `.gitignore` sauvegardes | — |
| `eb3763c` → servi `a99cb0c` | P0 Server Actions (8 fichiers, +467/−11) | diff markdown-only entre les deux SHA, code exécutable identique |
| `fd42638` | Isolation RLS | `124e7014b337989bb9d96b7ec5057f94`, appliqué en 1 s |
| `5094af3` | Durcissement (candidat minimal, sans fonction d'audit) | `2d2e463f…` |

Rollback RLS : `supabase/rollback/20260818011000_rollback.sql` (transcrit
depuis les définitions live de production, LOT 2 inclus après correction).
Rollback durcissement : `supabase/rollback/20260818150000_rollback_durcissement.sql`
(refuse si le gel est actif).

**Fideliz** (production) — trois modifications de base antérieures, toujours
actives : `role_jamais_depuis_les_metadonnees`,
`rpc_destructives_hors_de_portee`, `disable_signup: true` (config Auth).

**Cartiz** (projet indépendant) — intacte, rien modifié.

---

## 6. Concepts techniques appris — à ne pas redécouvrir

- **Server Actions** : dispatch par ID dans
  `.next/server/server-reference-manifest.json` (`filename`,
  `exportedName`, `workers`). Absente du manifeste = injoignable. Un fichier
  `"use server"` expose TOUTES ses fonctions exportées, y compris des
  helpers non destinés au client. Invocation directe : `POST` sur une route
  de ses `workers`, en-tête `Next-Action: <id>`,
  `Content-Type: text/plain;charset=UTF-8`, corps = tableau JSON des
  arguments ; réponse = flux RSC, dernière ligne = valeur de retour. Voir
  [[manifeste-server-actions]].
- **RLS/Postgres** : policies permissives combinées en OR (la plus large
  gagne). `service_role` contourne RLS mais pas les triggers. RLS ne filtre
  pas `TRUNCATE`. `ALTER DEFAULT PRIVILEGES` par schéma s'AJOUTE au global,
  ne peut jamais le soustraire ; seule la forme globale retire vraiment. Un
  `GRANT` n'enlève jamais rien. Les défauts s'attachent au **rôle créateur**
  — prouver sous un autre rôle ne vaut rien. Triggers `BEFORE` sur le même
  événement : ordre **alphabétique** (préfixe `aaa_gel_`, le tri par
  underscore dépend de la collation).
- **`pg_policies.qual`** est régénéré depuis l'arbre de parse : les
  différences de blancs dans le SQL source sont effacées — donc une
  comparaison textuelle de source SQL entre deux migrations peut diverger
  sans que le comportement diverge.
- Pousser sur `main` de `fideliz-app` déploie toujours, sans exception.
- Pipeline Vercel vérifié : aucune commande Supabase (build = `next build`
  seul ; `vercel.json` ne déclare que 3 crons ; Supabase CLI n'est pas une
  dépendance ; le workflow GitHub est Playwright seul) — donc tout SQL
  versionné est inerte au runtime tant qu'il n'est pas explicitement rejoué.
- Turbopack rejette un `node_modules` symlinké hors racine du filesystem
  projet.
- `btrim(s)` sans second argument ne retire que les espaces, pas les
  retours à la ligne/tabulations.
- **Découper sur les espaces n'est pas un lexer** : ça fusionne les runs
  (`'a  b'` ≡ `'a b'`), et retirer tous les blancs fusionne aussi les
  frontières de tokens (`a and b` vs `aand b`). Rejeté trois fois pendant ce
  chantier — c'est pour ça que les 9 corps de fonction exigent un vrai
  parseur ou une relecture brute, jamais une nouvelle heuristique.

---

## 7. Erreurs commises — pour ne pas les refaire

- Garde `update-game` sur la fusion validait `data.restaurant_id` (le
  mauvais côté, fourni par le client) au lieu de résoudre le jeu
  côté serveur. Samy avait prévenu : ne pas copier mécaniquement les gardes
  d'un commit antérieur.
- Détecteur de gardes trop étroit, deux fois (faux positifs sur des actions
  gardées à la main).
- Erreur de périmètre sur les triggers, deux fois : 5 (schéma `public`
  seul) au lieu de 6 (avec le trigger `auth`).
- Fingerprint attendu documenté obsolète (`06ab49ed`) vs réel
  (`124e7014b337989bb9d96b7ec5057f94`).
- Affirmé « seul `current_role` diffère » depuis une empreinte globale sans
  diff objet par objet — faux, 11 différences réelles.
- Affirmé qu'une branche ne savait pas reconstruire la base — en ayant
  vérifié `main` au lieu de `feat/fusion-fideliz`.
- Règle TS de l'héritier root non alignée sur la fonction Postgres déployée
  (filtre `is_active` inventé, absent du réel).
- Affirmé que la baseline accordait `all` à anon/authenticated — faux,
  c'est `service_role` seul qui l'a ; la vraie cause est le caractère
  additif des défauts.
- Fuite de secret : mots de passe de branche affichés car le masque
  cherchait `postgres://` alors que le CLI rend `postgresql://`. Branche
  supprimée, identifiants invalidés depuis.
- `git checkout <branche> -- <fichier>` depuis un worktree détaché n'a
  silencieusement pas pris — corrigé par `cp` direct.
- Ma remise à zéro (`drop schema public cascade`) a supprimé une entrée de
  privilèges par défaut de niveau plateforme que la production porte — non
  corrigé, c'est la tâche en cours (§ Où reprendre, point 4).

---

## 8. Ce qui est prouvé (cumulé, toutes couches confondues)

- Reconstruction depuis zéro (baseline + migrations historiques) reproduit
  la production sur : colonnes, contraintes, index, vues, RLS, triggers,
  policies, Storage, séquences, ACL des relations.
- **Les 22 fonctions closes**, verdict individuel par empreinte `prosrc`
  exacte + lecture brute (aucune heuristique) : 11 identiques exactement,
  9 différence de présentation démontrée (espaces/mise en forme, corps lu),
  2 différences réelles entièrement attribuées à des migrations déjà
  écrites (désormais appliquées, voir ci-dessous). Détail :
  `docs/preuve-sentinelle-et-fonctions.md`.
- Cycle RLS déterministe dans les deux sens ; atomicité par échec délibéré
  en milieu de fichier.
- **Couches 1 (durcissement) et 2+3 (RLS+identité-root) qualifiées sur
  `fusion-tests-2`** : cycle empreinte avant/après/rollback/réapplication
  bouclé, correspondance exacte à chaque étape, `policies` après
  application identique à la production en direct (`124e7014…`).
- **Couche 4 (gel source Fideliz) qualifiée en écriture** sur
  `fusion-tests-2`, 10 tables gelées, `service_role` verrouillé sur le
  drapeau, cycle empreinte avant/après/rollback/réapplication bouclé,
  écritures normales prouvées non bloquées tant qu'inactif, état final
  installé-inactif. **Matrice de concurrence à deux sessions réalisée et
  mesurée en direct** (PostgREST, deux sessions réellement concurrentes,
  sans mot de passe Postgres) : `NO-GO` du candidat d'origine confirmé par
  la mesure (pas seulement déduit), puis corrigé par un verrou de ligne
  (`for share`) — rejoué après correction, tous les scénarios mesurés
  passent. Détail : `docs/qualification-couche-4-gel.md`.
- **Découverte et correction majeure** : les migrations durcissement/RLS/
  identité-root de cette branche étaient un brouillon jamais déployé,
  différent du candidat réel de production — réconcilié (commit `f6a6403`).
  Qualifier contre le brouillon n'aurait rien prouvé.
- **211 tests verts** sur `candidat/baseline-acl`.

**Dette assumée, non corrigée délibérément** : `updateGameAction` non
transactionnel (test de caractérisation en place) ; 4 fichiers
`service_role` dormants durcis seulement sur `candidat/p0-dormant` ; 5 crons
production avec 4 doublons de la même fonction d'archivage (3 à la même
minute) — signalé, pas corrigé ; `supabase_admin` classé
`NEEDS_VENDOR_CONFIRMATION`, dossier fournisseur prêt non soumis ; deux
tables (`crm_notes`, `sales_restaurants`) ni gelées ni explicitement
exclues du gel — signalé, décision de Samy attendue.

---

## 9. Tâches en attente, dans l'ordre

1. ~~Exécuter la réponse au rapport 018~~ **fait** (`7cbd08a`).
   ~~Exécuter l'audit du rapport 019~~ **fait** (`689b193`).
   ~~Incident GRANT/REVOKE, deux modes de sentinelle, réconciliation des
   migrations, couches 1+2+3~~ **fait** (`d814ebe`, `f6a6403`).
   ~~Couche 4 (gel), tentative de matrice de concurrence~~ **fait**
   (`a961939`) — qualifiée en écriture, 7 tables, `NO-GO concurrence` par
   contrainte d'outillage — première passe, superseded ci-dessous.
   ~~P0 commentaire non fermé, séparation source/destination, 10 tables,
   P0 service_role, matrice de concurrence réelle + fencing MVCC, rollback
   versionné~~ **fait** (`f735576`…`206adc4`, tour 5, détail §4 ci-dessus).
2. Finir les réserves du candidat UUID-root : tests d'intégration des deux
   actions complètes, test d'ordre sensible aux arguments de `.order()`,
   commentaire obsolète dans `delete-sales-user.ts` ("root actif"),
   qualification séparée du risque de mutation partielle. Local uniquement,
   pas de déploiement. Candidat distinct, non fusionné.
3. Matrice de fusion Fideliz → Cartiz : gating de fonctionnalités,
   migrateur rejouable + preuve d'idempotence + rollback synthétique,
   compatibilité QR/URL/comptes/fidélité/jeu 100%-gagnant/lots/tickets/
   avis/menus, isolation multi-tenant et usages `service_role`, UI
   blanc-orange, répétition synthétique complète — arrêt strict à
   `READY_FOR_MIGRATION`.
4. Comparer avec `FIDELIZ_MASTER_DOC` seulement après l'avoir réellement lu
   dans le projet Cartiz.

---

## 10. Documents liés

`docs/preuve-sentinelle-et-fonctions.md` (sentinelle durcie, 22 fonctions
closes, découverte `supabase_admin` ; **prime sur** `docs/diff-semantique.md`
pour tout ce qui concerne les fonctions et les privilèges par défaut, dont
la méthode d'empreinte s'est révélée insuffisante),
`docs/qualification-couche-4-gel.md` (audit, application, rollback,
matrice de concurrence à deux sessions réalisée et fencing MVCC prouvé),
`docs/preuve-confinement-grant-revoke.md` (reconstitution des cibles
GRANT/REVOKE), `docs/dossier-support-supabase-admin.md`
(brouillon non soumis), `docs/dette-p0-server-actions.md`,
`docs/checkpoint-p0-server-actions.md`, `docs/runbook-production-rls.md`,
`docs/matrice-gel-source.md`, `docs/diff-semantique.md`,
`docs/matrice-ab-tenants.md`, `docs/matrice-rls-16-tables.md`,
`docs/matrice-server-actions.md`, `docs/rollback-reel.md`,
`docs/rollback-rls-joue.md`, `docs/incident-2026-08-18-deploiement-non-prevu.md`.

Mémoire persistante Claude (hors dépôt) : [[fidelite-source-de-verite]],
[[fideliz-main-deploie-en-production]], [[manifeste-server-actions]],
[[ne-jamais-afficher-une-sortie-de-secrets]],
[[jamais-modifier-un-fichier-metier-pour-tester]], [[jamais-rm-noms-reels]],
[[cout-jetons-workflows]].

---

*Écrit le 18/08/2026 en fin de séance, juste avant l'ouverture d'une
nouvelle session pour cause de lenteur (modèle surchargé + contexte
volumineux). Remplace intégralement la version précédente (02h20). Aucun
secret, aucune donnée personnelle.*
