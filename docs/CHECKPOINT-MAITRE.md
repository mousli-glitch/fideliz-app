# Checkpoint maître — fusion Fideliz → Cartiz

**⚠ À LIRE EN PREMIER, INTÉGRALEMENT, avant toute action.** Ce fichier
remplace toute version antérieure de ce document. Aucun secret, aucun
token, aucune donnée personnelle, aucun mot de passe dans ce fichier —
si une information manque pour cette raison, elle est signalée comme
« à reconstituer », jamais devinée.

---

## ⚡ Où reprendre MAINTENANT (18/08, soirée)

**Les six demandes de l'audit indépendant (rapport 018 → réponse de Samy)
sont traitées.** Commit `7cbd08a` sur `candidat/baseline-acl`. Détail complet,
preuves et empreintes : `docs/preuve-sentinelle-et-fonctions.md`.

1. ✅ Libellé « quel que soit l'état de départ » corrigé dans la baseline —
   garantie reformulée : bornée à la portée schéma, rôle créateur normalisé.
2. ✅ `supabase/verifications/sentinelle-privileges-anon.sql` durcie : droits
   **effectifs** (`has_table_privilege`), tout propriétaire, portée globale
   ET schéma, `PUBLIC`, héritage de rôle (`pg_has_role`).
3. ✅ Les 4 scénarios prouvés empiriquement (ancien texte = faux vert sur les
   4, nouveau = détecte les 4) — dont un **cas réel, pas simulé** : la
   production porte encore aujourd'hui un excès chez `supabase_admin`,
   6 privilèges, jamais neutralisé par le durcissement déployé. Voir §6.
4. ✅ Rejoué avant tout `drop schema public cascade` : `has_schema_privilege
   ('supabase_admin','public','CREATE') = true`, 0/20 relations lui
   appartiennent aujourd'hui. Qualifié : inerte dans le chemin que ce projet
   contrôle, PAS neutralisé structurellement — le rôle garde la capacité.
5. ✅ `supabase/verifications/preuve-acl-avis.sql` créée et versionnée.
6. ✅ **Les 22 fonctions closes**, pas 9 (le compte du rapport 018 était
   lui-même dépassé — 11 divergences réelles trouvées par empreinte `prosrc`
   exacte, pas 9). Verdict individuel par lecture brute intégrale, aucune
   heuristique : 11 identiques exactement, 9 cosmétiques démontrées
   (espaces/mise en forme), 2 réelles mais **entièrement attribuées** à des
   migrations déjà écrites (`20260818011000`, `20260818012000`) et vérifiées
   caractère pour caractère contre la production. Zéro divergence ouverte.

Suite : 156 tests toujours verts. **Prochaine tâche : déposer le rapport 019
dans le relais** (voir §3 pour le protocole — le fichier relais est resté
bloqué à l'ID `017`, vérifier s'il a bougé avant d'écrire). Une fois 019
acquitté (ou si Samy tranche directement) : reprendre la tâche 1 de la
section §9 — appliquer les quatre couches séparément sur la branche
synthétique, en commençant par décider si `supabase_admin` (§6) appelle une
remédiation séparée ou reste un risque assumé et documenté.

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

**État constaté à la reprise (18/08, ~19h09)** :
- `CLAUDE_TO_CHATGPT.md` : ID `20260818-claude-018`, `STATUS: READY` (texte
  intégral ci-dessous, §4).
- `CHATGPT_TO_CLAUDE.md` : toujours ID `20260818-claude-017`,
  `STATUS: RESPONSE_READY` — **pas de réponse automatisée à 018**.
- `LAST_PROCESSED.txt` = `20260818-claude-017`.
- Aucun veilleur de fond en vie (vérifié par `ps aux`, rien trouvé).

**⚠ Une réponse à 018 a été transmise directement dans le chat par Samy**
(collée après la commande `/compact`), **pas par le fichier relais**. Elle
n'est donc récupérable nulle part ailleurs. Texte intégral reproduit au
§5. C'est la tâche à exécuter maintenant (voir § « Où reprendre »).

**Pour la suite** : soit continuer à surveiller `CHATGPT_TO_CLAUDE.md` pour
une future réponse automatisée, soit accepter que Samy relaie manuellement
— dans les deux cas, toujours écrire le rapport suivant dans
`CLAUDE_TO_CHATGPT.md` avec un ID neuf avant de le communiquer, pour garder
une trace de dépôt même si la lecture se fait autrement.

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

## 4. État Git (18/08, ~19h09, vérifié)

| Dépôt | Branche | Commit | État |
|---|---|---|---|
| `fideliz-app` | `main` (production) | `5094af3` | déployé — durcissement, fingerprint `2d2e463f…` |
| `fideliz-app` | `candidat/baseline-acl` **(courante)** | `7cbd08a` | arbre propre, 156 tests verts |
| `fideliz-app` | `feat/fusion-fideliz` | — | base de référence pour les diffs cumulés |
| `cartiz` | `feat/fusion-fideliz` | `49206fe` | — |

**Diff cumulé `feat/fusion-fideliz..candidat/baseline-acl`** : 5 fichiers,
+458/−0 — baseline, `migrations.test.ts`, sentinelle durcie,
`preuve-acl-avis.sql`, `docs/preuve-sentinelle-et-fonctions.md`.

**Commits du candidat** (3, sur `baseline-acl`) :
- `f70ccb3` — retirer avant d'accorder, 114 privilèges de trop dont TRUNCATE à anon
- `9edefbc` — test permanent de l'ordre revoke-puis-grant
- `7cbd08a` — sentinelle droits effectifs/tout propriétaire/global/PUBLIC,
  22 fonctions closes, découverte `supabase_admin` en production

**Worktree de reconstruction** `/Users/samy/.fideliz-recon` : SHA épinglé
`facb20c`, 0 modification (propre).

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

**Fideliz** (réf. projet `kzeuplszcqjqaqohfbzk`) — trois modifications de
base antérieures, toujours actives : `role_jamais_depuis_les_metadonnees`,
`rpc_destructives_hors_de_portee`, `disable_signup: true` (config Auth).

**Cartiz** (réf. projet `rxdbotnuwfakukcbgeqo`) — intacte, rien modifié.

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
  policies, Storage, séquences, ACL des relations. **Sauf** les 9 corps de
  fonction (ouverts) et l'entrée de plateforme (divergence signalée §3/§4).
- Cycle RLS déterministe dans les deux sens ; atomicité par échec délibéré
  en milieu de fichier.
- Cycle durcissement `06ee5db5` ↔ `2d2e463f` avec sentinelles sous le vrai
  rôle créateur.
- Gel de bascule refuse 16 opérations, fonctions cron, RPC et
  `service_role`, zéro mutation — jamais appliqué hors synthétique.
- 156 tests verts sur `candidat/baseline-acl`.

**Dette assumée, non corrigée délibérément** : `updateGameAction` non
transactionnel (test de caractérisation en place) ; 4 fichiers
`service_role` dormants durcis seulement sur `candidat/p0-dormant` ; 5 crons
production avec 4 doublons de la même fonction d'archivage (3 à la même
minute) — signalé, pas corrigé.

---

## 9. Tâches en attente, dans l'ordre

1. ~~Exécuter la réponse au rapport 018~~ **fait** (commit `7cbd08a`,
   `docs/preuve-sentinelle-et-fonctions.md`). Reste seulement : décider
   d'une remédiation `supabase_admin` (§6 du rapport) ou l'assumer
   explicitement comme risque documenté — décision de Samy, pas technique.
   Déposer le rapport 019 dans le relais (§3), ou attendre l'arbitrage
   direct de Samy sur ce point avant.
2. Appliquer les quatre couches **séparément** sur la branche synthétique :
   durcissement, RLS, identité root, gel inactif — chacune avec fingerprint
   avant, delta attendu seul, sentinelles, vrai rollback, fingerprint
   restauré, réapplication exacte.
3. Matrice de concurrence du gel avec deux connexions réelles : READ
   COMMITTED, REPEATABLE READ avec snapshot fixé avant activation, écriture
   déjà engagée, nouvelle transaction après activation, requête de
   drainage `pg_stat_activity`, timeout de drainage → NO-GO, création
   Auth/profil pendant le gel sans orphelin, traduction `GEL01` seule,
   rollback puis réinstallation, état final inactif.
4. Finir les réserves du candidat UUID-root : tests d'intégration des deux
   actions complètes, test d'ordre sensible aux arguments de `.order()`,
   commentaire obsolète dans `delete-sales-user.ts` ("root actif"),
   qualification séparée du risque de mutation partielle. Local uniquement,
   pas de déploiement.
5. Matrice de fusion Fideliz → Cartiz : gating de fonctionnalités,
   migrateur rejouable, compatibilité QR/URL, UI blanc-orange, répétition
   synthétique complète — arrêt strict à `READY_FOR_MIGRATION`.
6. Comparer avec `FIDELIZ_MASTER_DOC` seulement après l'avoir réellement lu
   dans le projet Cartiz.

---

## 10. Documents liés

`docs/preuve-sentinelle-et-fonctions.md` (18/08 soir — sentinelle durcie, 22
fonctions closes, découverte `supabase_admin` ; **prime sur**
`docs/diff-semantique.md` du 18/08 matin pour tout ce qui concerne les
fonctions et les privilèges par défaut, dont la méthode d'empreinte s'est
révélée insuffisante), `docs/dette-p0-server-actions.md`,
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
