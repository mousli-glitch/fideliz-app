# Les cinq décisions qui commandent les autres

**19/08/2026.** Le lot 6 pose 22 questions (`P-1` à `P-22`, dans
`lot-6-schema-accueil.md`). Elles ne pèsent pas le même poids : cinq d'entre
elles **déterminent la réponse des autres** ou **fixent l'ordre des migrations**.
Répondre à ces cinq débloque le reste.

Tous les chiffres ci-dessous sont mesurés par moi, pas repris des agents.

---

## 1 · P-16 — Qui déménage de `/scan/<slug>` ?  ✅ TRANCHÉE

**La question.** Après fusion sur un seul domaine, `/scan/<slug>` ne peut servir
qu'un seul produit. Le jeu Fideliz garde-t-il l'URL, le comptoir Cartiz
déménageant ?

**Mesuré.** Le chemin existe **des deux côtés** : `fideliz-app/app/scan/[slug]`
et `cartiz/app/scan/[slug]`. Et `app.fideliz-app.fr/scan/la-ruche`,
`/scan/best-pizza`, `/scan/soukara` sont des QR **imprimés et en service**.

**Ce qu'elle commande.** P-17 (un ou deux projets Vercel), P-18 (domaine figé
en constante), P-21 (extension du témoin), et une partie de P-20.

**Recommandation : le jeu garde l'URL, le comptoir déménage.** Déplacer le
comptoir coûte une réinstallation de PWA. Déplacer le jeu coûte du papier chez
trois restaurants réels.

**Coût de se tromper.** Irréversible au sens propre : on ne rappelle pas des
flyers distribués.

> **Tranchée par Samy le 19/08/2026 : le jeu garde `/scan`, le comptoir déménage.**
> Coût réel mesuré et plan d'exécution dans `p16-le-comptoir-demenage.md`. Le rayon
> est plus petit qu'annoncé : les deux vrais clients n'utilisent pas le comptoir,
> deux applications installées seulement sont à reposer.

---

## 2 · P-1 — Le gérant s'appelle-t-il `restaurateur` partout ?  ✅ TRANCHÉE

**La question.** Un seul vocabulaire de rôle après fusion. Lequel ?

**Mesuré.**

| | Valeurs autorisées | Preuve |
|---|---|---|
| Fideliz | `root`, `sales`, `restaurant` | `baseline_fideliz.sql:370` |
| Cartiz | `admin`, `root`, `sales`, `restaurateur` | `011_fidelite.sql:28` |

L'intersection est `{root, sales}`. En production Fideliz : **7 comptes sur 9
portent `restaurant`** — la valeur que Cartiz refuse. Insérés tels quels, ils
échouent en `23514`.

**Ce qu'elle commande.** Toute la migration de `profiles`, donc P-2, P-4, P-5,
P-6, et chaque prédicat RLS des deux côtés. **Rien ne peut être écrit avant.**

**Recommandation : `restaurateur` partout.** Cartiz est la cible, cinq
prédicats SQL vivants y testent cette valeur en dur, et le renommage inverse
coûterait la convention de tout le module fidélité.

**Coût de se tromper.** Silencieux et total : un restaurateur connecté, valide,
qui ne voit rien.

> **Tranchée par Samy le 19/08/2026 : `restaurateur` partout.** Surface mesurée
> et plan dans `p1-restaurateur-partout.md` — 54 sites TypeScript et 9 objets
> vivants en base. Le vrai écrivain du rôle est un déclencheur, pas le code. `lib/securite/garde-action.ts:39` refuse tout rôle inconnu —
c'est du fail-closed, donc ça ne casse pas bruyamment, ça ferme.

---

## 3 · P-12 — L'habilitation prend-elle la forme d'une table `restaurant × module` ?  ✅ TRANCHÉE

**La question.** Comment dit-on « ce restaurant a droit à ça » ?

**Mesuré — il n'existe aucun mécanisme d'habilitation par module aujourd'hui.**

| Existant | Ce que c'est vraiment |
|---|---|
| `restaurants.subscription_end` (Fideliz) | une date |
| `restaurants.subscription_plan` (Fideliz) | **un libellé d'affichage** : `set-subscription.ts` y écrit `"Personnalisé"` ou `planLabel(months)` |
| `restaurants.abonnement_debut/_fin` (Cartiz) | deux dates, lues par la console admin |
| `restaurants.is_retention_alert_enabled` | le **seul** précédent d'un droit par fonctionnalité (`baseline:159`) |

Gater sur `subscription_plan` reviendrait à gater sur une chaîne d'affichage.

**Ce qu'elle commande.** P-11 (ce qu'une échéance dépassée coupe), P-13
(deny-by-default et backfill), P-14 (l'impersonation ignore-t-elle le gating).
Les trois n'ont de sens qu'une fois la forme choisie.

**Recommandation : une table `restaurant × module`, tenue par le vendeur.**
Une date d'abonnement dit « il a payé », pas « il a payé quoi » — et après
fusion il y aura deux produits à vendre séparément.

**Coût de se tromper.** Des booléens sur `restaurants` semblent plus simples et
le redeviennent ingérables au troisième module.

---

## 4 · P-15 — L'anonymisation est-elle portée sur `clients` AVANT le versement ?

**La question.** Les contacts Fideliz partent vers la table `clients` de
Cartiz. Porte-t-on la règle de rétention (24 mois, 36 avec consentement)
**avant** de verser, ou après ?

**Mesuré.** **499 contacts** en production Fideliz. Côté Cartiz, `clients` n'est
couverte par aucune règle d'anonymisation.

**Ce qu'elle commande.** L'**ordre** des migrations de bascule. C'est la seule
des cinq qui ne se rattrape pas plus tard.

**Recommandation : avant.** Une donnée personnelle qui change de table sans sa
règle perd son échéance, et personne ne s'en aperçoit — c'est exactement le
défaut qu'on vient de fermer sur `winners_archive`, où un ticket partait à
l'archive à trois mois et n'était plus jamais anonymisé.

**Coût de se tromper.** 499 personnes dont la donnée n'a plus de date de
péremption. Réparable en théorie, invisible en pratique jusqu'à un contrôle.

---

## 5 · P-6 — Un restaurant peut-il porter plusieurs comptes gérants ?

**La question.** Après fusion, la-ruche et best-pizza auront potentiellement un
compte de chaque côté. Un ou plusieurs ?

**Mesuré.** Aujourd'hui, **0 restaurant sur 4 porte plus d'un profil** — la
relation est de fait 1:1 des deux côtés, et rien ne l'a jamais éprouvée. Or la
console Cartiz suppose l'unicité dans son code : `hasRestaurateur` est un
booléen et `r.restaurateur_email` un champ unique
(`app/admin/restaurants/[id]/RestaurantAdmin.tsx:599-620`).

**Ce qu'elle commande.** P-4 (quel compte survit chez best-pizza) et P-5 (mot
de passe provisoire). Si la réponse est « plusieurs », P-4 disparaît : les deux
comptes cohabitent.

**Recommandation : oui, plusieurs.** Sinon il faut choisir un compte à
supprimer chez les deux seuls vrais clients communs — une opération
destructive, sur des comptes qui servent.

**Coût de se tromper.** La console root affiche « pas de compte » et le bouton
de réinitialisation refuse, précisément sur la-ruche et best-pizza.

---

## Un fait que la synthèse n'a pas relevé, et qui change P-11

`P-11` recommande qu'une échéance dépassée coupe le dashboard **sans jamais
couper `/m`, `/c` ni `/verify`**. La liste omet `/scan` — or :

`app/scan/[slug]/page.tsx:50-56` **coupe déjà** sur `subscription_end` et rend
« Service momentanément indisponible ». C'est un **QR imprimé qui s'éteint** le
jour où un abonnement expire.

C'est peut-être voulu — pas d'abonnement, pas de jeu, c'est le modèle Fideliz.
Mais ce n'est pas ce que P-11 décrit, et après fusion le même chemin sert le
comptoir Cartiz, qui n'a pas la même règle commerciale.

**En production aujourd'hui : 3 restaurants sur 4 ont une échéance fixée, 0 est
expiré, 0 est bloqué.** La question ne s'est donc jamais posée en vrai. Elle se
posera au premier impayé.

**À trancher avec P-16, pas séparément** : les deux portent sur le même chemin.

---

## L'ordre dans lequel les prendre

1. **P-16** (+ le point `/scan` ci-dessus) — commande toute la stratégie de
   domaine, et c'est la seule contrainte adossée à du papier.
2. **P-1** — rien ne s'écrit sur `profiles` avant.
3. **P-6** — se répond dans la foulée de P-1, et fait tomber P-4.
4. **P-12** — ouvre les trois questions de gating d'un coup.
5. **P-15** — se décide en dernier mais s'exécute en premier.

Les dix-sept autres se répondent ensuite, et plusieurs deviennent sans objet.
