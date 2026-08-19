# P-11 — Ce qu'une échéance coupe, et ce qu'elle ne coupe jamais

**Tranchée par Samy le 19/08/2026.** Règle produit.

> Une échéance d'abonnement dépassée coupe le **dashboard**.
> **Jamais** `/m`, `/c`, `/verify` ni `/scan`.

---

## Elle corrige un comportement en service

`/scan/<slug>` **coupait** sur `subscription_end` et rendait « Service
momentanément indisponible ». C'est le chemin des QR **imprimés** de la-ruche,
best-pizza et soukara : un impayé éteignait un carton posé sur les tables, sans
que personne ne touche à quoi que ce soit.

Mesuré : **3 restaurants sur 4 ont une échéance fixée, aucune n'est dépassée.**
Le défaut n'a jamais tiré — il attendait la première facture impayée.

## L'inventaire des sites qui coupent

| Site | Ce qu'il coupe | Verdict P-11 |
|---|---|---|
| `app/scan/[slug]/page.tsx:55` | le jeu, sur `is_blocked` **ou échéance** | ❌ **corrigé** |
| `app/admin/[slug]/layout.tsx:51,80` | le dashboard, sur `is_blocked` / `is_active` | ✅ conforme |
| Cartiz `/m/[slug]` | filtre `publie` uniquement | ✅ rien à faire |
| Cartiz `/c`, `/f` | aucune coupure | ✅ rien à faire |

Le reste des occurrences de `subscription_end` sont des **affichages** de la
console commerciale, pas des coupures.

## Le correctif

La règle quitte la page et devient un module canonique avec son test —
`lib/coupure-jeu.ts`, sur le modèle du contrat monétaire du lot 3. Une
condition de coupure d'un QR imprimé n'a rien à faire au milieu d'un composant.

**7 tests**, dont celui-ci, qui rougira le jour où quelqu'un rebranche
l'échéance :

```
it("une échéance DÉPASSÉE ne coupe PAS — décision P-11")
```

### Ce module est délibérément *fail-open*

Partout ailleurs dans ce dépôt, l'absence d'information **ferme**. Ici elle
**ouvre**.

Le pire d'un fail-open ici est qu'un jeu tourne un jour de trop. Le pire d'un
fail-closed est un QR mort chez un client qui a payé. Sur du papier déjà
distribué, le sens de l'erreur n'est pas discutable.

## Le blocage survit — arbitré

`is_blocked` **coupe toujours** `/scan`. Question posée à Samy, réponse le
19/08/2026 : **on le garde.**

P-11 parle de l'**échéance**, pas du blocage, et les deux ne sortent pas du
même endroit :

| | D'où ça vient | Ce que ça coupe |
|---|---|---|
| Échéance dépassée | **tombe toute seule**, un matin de facture impayée | plus rien sur les parcours imprimés |
| `is_blocked` | **quelqu'un décide** — fraude, commerce fermé, litige | tout, immédiatement |

C'est la seule distinction qui compte, et elle suffit :
**ce qui éteint un support papier doit être un acte, jamais une date.**

## Déployé en production le 19/08/2026

**Déploiement isolé**, construit depuis `origin/main` = `e14ba98` — le commit
réellement en production — et **jamais** depuis `candidat/baseline-acl`.

L'écart entre les deux est de **116 commits et 186 fichiers**. Fusionner la
branche déploierait tout le chantier de fusion, dont six RPC qui n'existent pas
en production : la création et la modification d'un jeu casseraient
immédiatement, chez de vrais restaurants.

| | |
|---|---|
| Commit déployé | `05c7ca4` |
| Fichiers | `app/scan/[slug]/page.tsx`, `lib/coupure-jeu.ts`, `lib/coupure-jeu.test.ts` |
| Dépendances ajoutées | **aucune** — le correctif est une fonction pure, zéro appel RPC dans le diff |
| Vérifié avant de pousser | 188 tests, build, porte `npm run securite` |
| **Retour arrière** | `dpl_3DDmMMKp93SwNuizmMo6WoXr2XfW` — `fideliz-72iw0f3su-fidelizs-projects.vercel.app`, commit `e14ba98` |

### Une divergence trouvée en portant le correctif

La page `/scan` de `main` importe `createClient as createSupabaseAdmin` ; celle
de la branche de fusion importe `createClient`. Mon ancre a échoué, et c'est
tant mieux : elle a montré que les deux versions du fichier ont déjà divergé
au-delà de P-11. Transposer un diff plutôt que de le réappliquer sur la vraie
base aurait pu passer inaperçu.
