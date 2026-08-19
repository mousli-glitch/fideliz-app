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

## ⚠️ Une question que je n'ai pas tranchée à ta place

`is_blocked` **coupe toujours** `/scan`.

P-11 parle de l'**échéance**. Mais lue au pied de la lettre — « jamais
`/scan` » — elle supprimerait aussi le blocage, qui est ton **seul levier
d'arrêt immédiat** sur un QR imprimé : fraude, commerce fermé, litige.

J'ai gardé le blocage. Retirer à quelqu'un son unique bouton d'urgence ne se
déduit pas d'une décision qui n'en parle pas.

**Dis-moi si tu veux qu'il parte aussi.**

## État

Corrigé sur la branche `candidat/baseline-acl`. **Pas déployé en production** —
Fideliz déploie depuis `main`, et un déploiement demande ton feu, comme pour le
lot 3 et check-replay.

Rien ne presse : aucune échéance n'est dépassée aujourd'hui. Mais ça presserait
le jour d'un impayé, et ce jour-là personne ne ferait le lien.
