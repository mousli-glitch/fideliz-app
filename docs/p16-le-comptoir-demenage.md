# P-16 — Le jeu garde `/scan`, le comptoir déménage

**Tranchée par Samy le 19/08/2026.** Règle produit. Ce document dit ce qu'elle
coûte réellement, mesuré, et comment l'exécuter.

---

## La règle

Après fusion sur un seul domaine, `/scan/<slug>` sert **le jeu Fideliz**. Les QR
imprimés de la-ruche, best-pizza et soukara continuent de fonctionner sans
réimpression. Le comptoir de fidélité Cartiz change d'adresse.

## Ce que la note annonçait, et ce qui est vrai

La note des cinq décisions estimait le coût à « une réinstallation de PWA ».
C'était juste en **magnitude**, faux en **mécanisme** — et j'ai d'abord cru que
c'était plus grave que ça. Mesuré :

### Le comptoir n'est pas une route, c'est une application installée

| Ancrage | Où |
|---|---|
| Manifeste par restaurant | `app/scan/[slug]/page.tsx:19`, `app/scan/[slug]/manifest/route.ts:28-29` |
| Service worker, **portée liée au chemin** `/scan/` | `app/scan/[slug]/Scanner.tsx:154`, `public/scan/sw.js:53` |
| Icônes mises en cache | `public/scan/sw.js:24-25`, `manifest/route.ts:35-38` |
| Redirection de connexion | `app/scan/[slug]/page.tsx:45` |
| Liens du dashboard | `components/dashboard/Sidebar.tsx:85`, `NavMobile.tsx:146` |

**Onze ancrages, six fichiers.** Énumérable, donc traitable.

Le `start_url` d'une PWA est **figé à l'installation**. Une application déjà
posée sur l'écran d'accueil continuera d'ouvrir `/scan/<slug>` — qui, après
fusion, sert le jeu client. Un membre du personnel taperait son icône et
tomberait sur la roue au lieu du scanner. Silencieux, et déroutant en service.

### La file hors-ligne, elle, survit sans rien faire

`lib/file-attente.ts:23` — la clé est `cartiz_file_<slug>`, **indexée sur le
restaurant, pas sur le chemin**. `localStorage` étant par origine, un
déménagement de route ne perd aucun passage en attente. Aucune migration de
clé n'est nécessaire.

## Le rayon réel — pourquoi mon alarme retombe

Relevé en production Cartiz le 19/08/2026, en lecture seule :

| Restaurant | Passages comptoir | Dernier | Codes comptoir | Passes Wallet |
|---|---|---|---|---|
| `chez-samy` *(test de Samy)* | 22 | 15/08 | 1 | 12 |
| `mpbmeru` | 6 | **19/08** | 0 | 4 |
| `best-pizza` *(client réel)* | **0** | — | 0 | 1 |
| `la-ruche` *(client réel)* | **0** | — | 0 | 0 |
| `testmicro` *(test)* | 0 | — | 0 | 0 |

**Les deux vrais clients n'utilisent pas le comptoir.** Le seul usage vivant est
`mpbmeru` — 6 passages, dont un aujourd'hui — et le test de Samy.

Le parc de PWA installées à reposer est donc de **deux appareils au plus**, dont
un est le tien. C'est le contraire d'une opération risquée.

⚠️ `mpbmeru` porte l'instruction « ne pas toucher » au mapping et n'est
contrôlé par aucun témoin. C'est le seul point à traiter avec soin.

## Le plan

**Adresse cible : `/comptoir/<slug>`.** Le vocabulaire existe déjà dans le code
(`restaurantDuComptoir`, « l'app installée ouvre son comptoir »).

### Étape 1 — le comptoir répond aux deux adresses (Cartiz seul, avant fusion)

- La page, le scanner et le manifeste déménagent sous `/comptoir/<slug>`.
- Le service worker devient `public/comptoir/sw.js`, portée `/comptoir/`. Sa
  consigne d'origine — « ne pas déplacer ce fichier à la racine » — est
  respectée : on le déplace **plus profond**, jamais plus haut.
- `start_url` et `scope` du manifeste pointent la nouvelle adresse.
- Les deux liens du dashboard suivent.
- `/scan/<slug>` reste servi par Cartiz et fait **trois choses dans cet ordre** :
  désinscrire l'ancien service worker `/scan/`, vider son cache, puis rediriger
  vers `/comptoir/<slug>`.

### Étape 2 — reposer les deux applications installées

Ouvrir une fois le comptoir sur l'appareil de `mpbmeru` et sur le tien, puis
réinstaller depuis la nouvelle adresse. La redirection de l'étape 1 rend cette
fenêtre confortable : rien ne casse tant qu'elle est en place.

### Étape 3 — à la fusion, `/scan` passe au jeu

La redirection transitoire disparaît **au moment où** le jeu prend le chemin.
C'est le seul instant où une PWA restée installée tomberait sur la roue — d'où
l'étape 2 avant, pas après.

### Étape 4 — le témoin

Étendre `scripts/non-regression/` à `/comptoir/<slug>` avant de retirer quoi que
ce soit, et vérifier que `/scan/<slug>` côté Cartiz redirige bien pendant toute
la fenêtre.

## Ce que cette décision fait tomber

| | |
|---|---|
| **P-17** — un ou deux projets Vercel | reste ouverte, mais perd son urgence : les chemins ne se disputent plus |
| **P-18** — domaine figé en constante | **à faire quand même**, et c'est indépendant |
| **P-20** — titre de l'onglet | inchangée |
| **P-21** — extension du témoin | **grossit** : `/comptoir/<slug>` s'ajoute à la liste |

## Ce qui n'est pas décidé ici

- Le sort de `/scan` **côté Cartiz après la fusion** : la redirection doit-elle
  survivre en garde-fou, ou disparaître ? Elle ne peut pas survivre si le jeu
  occupe le chemin — donc elle disparaît. À confirmer.
- **P-11 et `/scan`** : le jeu Fideliz coupe déjà cette route sur une échéance
  d'abonnement dépassée (`app/scan/[slug]/page.tsx:50-56`). Un QR imprimé qui
  s'éteint. Cette question reste entière et se traite avec P-11.

## État

**Rien n'est exécuté.** Ce document est le plan, pas la trace.
