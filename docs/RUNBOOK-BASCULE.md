# Runbook de bascule — Fideliz vers Cartiz

> Ce document est la séquence. Chaque étape porte sa commande **et sa
> vérification** ; une étape sans vérification n'est pas une étape, c'est un
> espoir.
>
> Écrit le 19/08/2026. **Aucune étape de la phase 3 ou au-delà n'a jamais été
> jouée.** Ce runbook est un plan éprouvé sur le papier et à moitié sur les
> outils — pas un compte rendu.

## Ce qu'il faut avoir sous la main

    FIDELIZ_URL   FIDELIZ_SERVICE_KEY     ← présentes dans fideliz-app/.env.local
    CARTIZ_URL    CARTIZ_SERVICE_KEY      ← ABSENTE : .env.local n'en porte que 9 caractères
    FUSION_JE_CONFIRME=oui                ← à poser au moment d'écrire, jamais avant

**La clé de service de Cartiz est le seul obstacle technique restant.** Sans
elle, rien de la phase 3 ne peut être joué ni même répété.

---

## Phase 0 · Avant de toucher à quoi que ce soit

| # | Geste | Vérification |
|---|---|---|
| 0.1 | Relever l'URL de déploiement courante de Cartiz | notée quelque part hors de la machine |
| 0.2 | `node scripts/fusion/migrer.ts --plan` | le plan est celui attendu : 3 jeux, 12 lots, 488 gagnants, 752 avis, 488 contacts |
| 0.3 | `node scripts/fusion/comptes.ts --plan` | 7 lignes, 3 opérations : créer soukara et le commercial, reprendre l'adresse de la-ruche |
| 0.4 | Jouer `supabase/tests/exclusions-fideliz.sql` sur Cartiz | **R8 vert** — aucun objet Fideliz exclu n'est présent |
| 0.5 | `npm run qr:verifier` | les QR imprimés répondent |

**Si 0.2 ou 0.3 refuse, on s'arrête.** Le plan échoue avant la première
écriture, c'est sa raison d'être.

---

## Phase 1 · La sauvegarde

| # | Geste | Vérification |
|---|---|---|
| 1.1 | Jouer `scripts/fusion/storage/manifeste.sql` sur Cartiz, garder la sortie | 46 lignes |
| 1.2 | `STORAGE_URL=… node scripts/fusion/storage/sauvegarder.ts manifeste.txt sauvegarde-AAAAMMJJ` | « SAUVEGARDE COMPLÈTE » |
| 1.3 | `node scripts/fusion/storage/sauvegarder.ts --verifier sauvegarde-AAAAMMJJ` | « SAUVEGARDE VÉRIFIÉE » |
| 1.4 | Sauvegarde de la base Cartiz depuis la console Supabase | horodatée, notée |
| 1.5 | Copier la sauvegarde hors de la machine | **à décider : où** — 82 Mo |

**Point d'arrêt.** Tant que 1.5 n'a pas de destination arbitrée, on ne
poursuit pas : une sauvegarde qui vit sur la machine qui va être modifiée
n'est pas une sauvegarde.

---

## Phase 2 · La répétition, sur banc

Aucune de ces étapes ne touche la production.

| # | Geste | Vérification |
|---|---|---|
| 2.1 | Créer un banc Cartiz | ⚠ **toujours créer, jamais `reset`** : `reset_branch` rejoue depuis l'instantané de création, pas depuis le registre courant |
| 2.1bis | **Attendre que le décompte des migrations se stabilise** | ⚠ le banc annonce `ACTIVE_HEALTHY` **pendant que ses migrations rejouent encore**. Mesuré le 19/08 : 17 migrations à la première lecture, 90 à la seconde. Mesurer une seule fois mène à conclure que la création est non déterministe — elle ne l'est pas, elle est asynchrone. |
| 2.2 | Y réappliquer 083 → 088 | ⚠ un banc neuf est **en retard** : mesuré deux fois le 19/08, il s'arrête à 90 migrations, version 20260819190000. 081 et 082 ne sont pas nécessaires au migrateur — il ne lit ni `habilitations` ni la fonction d'anonymisation — mais un banc pleinement fidèle les porterait aussi. |
| 2.3 | `ensemencer-banc.ts` | **automatisé le 20/08** — c'était le dernier geste manuel de la phase 2. Il copie les 2 restaurants exigés par le plan et leurs 16 pages depuis la production, crée un gérant par restaurant **plus un coupé**, et refuse si sa clé est celle de production ou si `chez-samy` apparaît |
| 2.4 | `migrer.ts --appliquer` vers le banc | « VERSEMENT CONFORME » |
| 2.5 | **Rejouer 2.4 à l'identique** | mêmes comptes, aucune ligne en double — **c'est R4** |
| 2.6 | `comptes.ts --appliquer` vers le banc | 3 opérations au premier passage ; **au second, 0 faite / 3 reprises et AUCUN fichier écrit** — c'est la reprise, et c'est ce qu'il faut vérifier |
| 2.7 | Rejouer la sonde R8 sur le banc chargé | vert |
| 2.8 | Rejouer le témoin de conservation | **R5 — ACQUIS le 19/08 : 189/189, 0 rouge, en 19,2 s.** Recette éprouvée ci-dessous |
| 2.9 | `supabase/tests/isolation-apres-versement.sql` | **R6 — ACQUIS le 19/08** : chaque gérant voit exactement le sien, le compte coupé rien, `anon` bloqué en 42501 |
| 2.10 | Servir les menus depuis le banc | R7. **Le préalable est déjà prouvé** : `lib/fusion/surface-menu.test.ts` montre que les colonnes lues par le menu et celles écrites par le versement sont DISJOINTES, sauf `theme_json` dont la fusion est un no-op pour les deux clients |
| 2.11 | Supprimer le banc | il coûte 0,013 $/h — **et il porte des adresses réelles** dès que 2.6 est jouée |

### Tout cela en une commande

De 2.3 à 2.6, plus le retour arrière et le reversement, `repetition-generale.ts`
enchaîne et chronomètre :

    BANC_URL=https://<ref>.supabase.co BANC_KEY=<clé du banc> \
      SAUVEGARDE=<dossier de sauvegarde Storage> \
      node scripts/fusion/repetition-generale.ts

Dix étapes, ~15 s. Elle refuse de démarrer si `BANC_URL` désigne la
production. **Elle ne fait pas 2.1 et 2.2** — créer une branche et y appliquer
des migrations passe par la console.

Restent ensuite, à la main, les trois contrôles qui ne passent pas par la
ligne de commande : R8 et R6 (console SQL) et R5 (serveur local).

**Point d'arrêt.** Si 2.5 crée des doublons, le migrateur n'est pas
idempotent et la bascule est reportée. Aucune exception.

### La recette de 2.8, éprouvée le 19/08/2026

`verifier.mjs` vise une application DÉPLOYÉE et ses fixtures encodent les
VRAIS identifiants de restaurant — les URL du Storage public en dépendent. Un
banc synthétique ne peut pas y répondre. La recette :

1. Ensemencer le banc — `node scripts/fusion/ensemencer-banc.ts`, ou
   l'étape 2.3 de la répétition, qui l'appelle. Il copie les **vrais
   identifiants** de `best-pizza` et `la-ruche` avec toutes leurs colonnes,
   **et leurs 16 lignes `flyer_pages`** — positions comprises, y compris le
   trou à la position 10 de la-ruche, que la fixture documente comme un
   orphelin.
2. Poser l'état d'après versement (les colonnes que le migrateur écrit).
3. Lancer l'application en local **avec les variables du banc en surcharge** :
   Next donne la priorité aux variables déjà présentes dans l'environnement,
   même quand `.env.local` existe.

       NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… npm run dev

4. **Vérifier que l'application lit bien le banc**, et non la production.
   Le discriminant : `/m/chez-samy` doit répondre **404** — ce restaurant
   existe en production, pas sur le banc. S'il répond 200, le témoin
   mesurerait la production et son vert ne prouverait rien.
5. `BASE_CARTIZ=http://localhost:3000 node scripts/non-regression/verifier.mjs`

Résultat du 19/08 : **189 assertions vertes, 0 rouge**, dont « 4 pages de
carte sont servies », « les pages s'affichent dans le bon ordre, aucune perdue
ni ajoutée » et « chaque page garde son mode d'affichage ».

Refait le 20/08, deux fois, contre un banc ayant traversé la répétition
**entière** — ensemencement, versement, rejeu, retour arrière, reversement,
comptes créés : **189/189 à chaque fois.** Le discriminant a été revérifié
après coup : `/m/chez-samy` → 404, les deux menus réels → 200. À noter,
`/m/soukara` répond 404 lui aussi, et c'est voulu : le versement le laisse en
`publie = false` jusqu'à l'étape 3.8.

---

## Phase 3 · La bascule

> ## ✅ JOUÉE LE 20/08/2026, 00:34–00:36 UTC
>
> **Fenêtre gelée : 67 secondes.** Fideliz n'a perdu aucune écriture — 501
> tickets avant, 501 après : aucun joueur ne s'est présenté pendant la fenêtre.
>
> | Étape | Résultat |
> |---|---|
> | 3.0 gel déployé | fait plus tôt dans la nuit, inactif |
> | 3.1 gel activé | 00:34:11, 10 triggers vérifiés au catalogue |
> | 3.2 point de référence | 3 064 lignes, 20 ensembles, relus et vérifiés |
> | 3.3 versement | **CONFORME** — 3 jeux, 12 lots, 489 tickets, 752 avis, 489 contacts, chacun revérifié après écriture |
> | 3.5 sonde R8 | verte sur la production chargée |
> | 3.10 gel levé | 00:35:18, écriture reprise immédiatement |
> | 3.4 comptes | 3 opérations, fichier en 600 |
> | 3.6 témoin | **187 vertes, 0 rouge — GO** (2 assertions sautées : un échantillon de ticket naturellement expiré) |
> | 3.7 les 5 menus | tous **200**, QR imprimés intacts |
> | R6 isolation | verte sur données réelles, 5 gérants |
> | 3.8 publier soukara | **NON FAIT — délibérément**, voir ci-dessous |
>
> **L'ordre a été modifié**, et c'est délibéré : les comptes (3.4) et les
> contrôles longs (3.6, 3.7) ont été joués APRÈS la levée. Ils n'ont pas
> besoin du gel, et chaque seconde de gel est une seconde où un joueur reçoit
> une erreur. Seuls le point de référence, le versement et la sonde R8 sont
> restés dans la fenêtre.
>
> **3.8 n'a pas été jouée, et ce n'est pas un oubli.** Soukara porte son jeu
> et ses 131 tickets, mais **0 catégorie, 0 plat, 0 page de carte** : le
> publier exposerait `/m/soukara` comme un menu vide, à une URL vers laquelle
> aucun QR ne pointe. Le runbook justifie lui-même 3.8 comme un geste
> délibéré, « après qu'on l'ait regardé ». On l'a regardé : il n'y a rien à
> publier tant que Samy n'a pas importé une carte.
>
> **Le retour arrière est armé** : `etat-avant-restaurants-rxdbotnuwfakukcbgeqo-2026-08-20.json`,
> signé de la base, relu — 1 745 lignes retrouvées, 0 modifiée depuis.

**Chaque étape demande l'accord explicite de Samy au moment de la jouer.**

| # | Geste | Vérification |
|---|---|---|
| **3.0** | **Déployer le gel sur Fideliz** — `20260818160000_gel_source_fideliz.sql` | ⚠ **Découvert le 20/08 : le gel N'EST PAS en production.** Ni table `maintenance`, ni fonctions, ni triggers. Il n'a jamais été installé que sur le banc. 3.1 est donc **impossible** tant que 3.0 n'est pas faite. C'est un changement de schéma sur une base vivante : décision de Samy. Vérification : `supabase/verifications/inventaire-reel-production.sql` doit passer `gel_source_fideliz` de ABSENTE à présente |
| 3.1 | Activer le gel de bascule côté Fideliz | `activer-gel-source-fideliz.sql`, sous le rôle propriétaire, **jamais la clé de service**. Mesuré sur banc le 20/08 : **18 ms**, 10 triggers vérifiés au catalogue. Les écritures Fideliz sont refusées en `P0100`, les lectures restent ouvertes |
| 3.2 | Refaire une sauvegarde du Storage et de la base | vérifiée |
| 3.3 | `FUSION_JE_CONFIRME=oui migrer.ts --appliquer` | « VERSEMENT CONFORME » |
| 3.4 | `FUSION_JE_CONFIRME=oui comptes.ts --appliquer` | 3 opérations, fichier de mots de passe en 600. **S'il échoue au milieu, RELANCER la même commande** : depuis le 20/08 il se reprend, ne recrée rien et **ne réémet aucun mot de passe déjà transmis**. Une reprise n'écrit aucun fichier et le dit |
| 3.5 | Sonde R8 sur la production chargée | vert |
| 3.6 | Témoin de conservation | 189/189 |
| 3.7 | `npm run qr:verifier` + les 5 menus | **inchangés** |
| 3.8 | Publier `soukara` (`publie = true`) | son menu répond |
| 3.9 | Transmettre les mots de passe, **puis supprimer le fichier** | fichier absent |
| 3.10 | Lever le gel — **seulement après le GO** | `lever-gel-source-fideliz.sql`, même rôle propriétaire. Mesuré sur banc : **3 ms**. ⚠ en cas de retour arrière, revenir à l'ancienne application AVANT de lever |

> ### ⚠ Avant 3.3 — vérifier qu'aucun relevé de répétition ne traîne
>
> Le versement écrit `etat-avant-restaurants-<base>-<date>.json`, et **ne
> l'écrase jamais** : le premier relevé est le seul qui décrive l'origine.
>
> Jusqu'au 20/08 le nom n'était daté que du jour. Répétition et bascule
> tombant par construction le **même jour**, le versement réel réutilisait le
> relevé de la répétition, et le retour arrière de la production aurait
> restauré des valeurs prises sur un banc. Ce n'est pas une hypothèse : la
> répétition du 20 a réellement réutilisé celle du 19.
>
> Le nom porte désormais la base, et `defaire.ts` refuse un relevé qui n'est
> pas de la base qu'il défait. Le geste reste néanmoins :
>
>     ls etat-avant-restaurants-*.json
>
> Il ne doit rien rester d'une répétition. Ces fichiers sont dans
> `.gitignore` — comme le fichier de mots de passe, qui n'y était pas non
> plus avant le 20/08.

**Le versement laisse `soukara` en `publie = false`.** Un restaurant versé
n'apparaît pas au public avant qu'on l'ait regardé — 3.8 est un geste
délibéré, pas un effet de bord.

### Ce que le joueur voit pendant le gel — mesuré le 20/08

Le gel refuse les écritures en base ; c'est l'application qui décide de ce que
le client en lit. Éprouvé gel actif sur banc, et **corrigé** :

| Parcours | Avant le 20/08 | Depuis |
|---|---|---|
| La roue | « Une erreur est survenue. Merci de réessayer » — une invitation à insister pendant toute la fenêtre | le message de la base, qui dit que le service revient |
| L'inscription | un écran **TICKET portant `ERREUR-CONTACT-STAFF`** — un faux ticket que l'employé n'aurait rien pu scanner | le message de la base, aucun ticket délivré |

**Le message se change en cours de bascule sans redéployer** :

    update public.maintenance set message = 'Retour vers 7 h 30.' where id;

C'est sa raison d'être. Si la fenêtre se prolonge, c'est le seul levier qui
reste vers les clients.

---

## Phase 4 · Retour arrière

**Écrit** le 19/08/2026, **éprouvé sur banc le 20/08** — joué dans la
répétition générale, suivi d'un reversement complet derrière lui.

Il refuse un relevé qui n'est pas de la base qu'il défait, et un relevé au
format ancien (celui d'avant le 20/08, qui ne dit pas d'où il vient). Les deux
refus sont prouvés par contre-épreuve.

    node scripts/fusion/defaire.ts etat-avant-restaurants-AAAA-MM-JJ.json
    FUSION_DEFAIRE_JE_CONFIRME=oui node scripts/fusion/defaire.ts … --appliquer

Le mot de confirmation diffère de celui du versement : avoir autorisé l'un
n'autorise pas l'autre.

| # | Geste | Vérification |
|---|---|---|
| 4.1 | `defaire.ts <etat-avant.json>` | le plan liste ce qui sera retiré, et refuse si une ligne a bougé depuis |
| 4.2 | `… --appliquer` | « RETOUR ARRIÈRE COMPLET », ou le compte des lignes nées chez Cartiz et conservées |
| 4.3 | Les comptes, **à la main** | le script les liste ; supprimer un compte est irréversible et emporte son profil |
| 4.4 | Le Storage, si besoin | re-téléverser la sauvegarde de 1.2 |
| 4.5 | Le schéma, si besoin | `supabase/rollback/088` → `083`, dans cet ordre, tous bornés |

**Le migrateur relève l'état d'avant** des colonnes qu'il va écrire, dans
`etat-avant-restaurants-AAAA-MM-JJ.json`, **avant** la première modification.
C'est ce fichier qui rend 4.2 possible : sans lui, rendre une colonne à NULL
serait une supposition, pas une annulation. **Le garder.**

---

## Ce que ce runbook ne couvre pas

- **Le portage des écrans Fideliz.** Les tables sont là, la RLS aussi, mais
  aucune interface de jeu ne tourne côté Cartiz. `anon` n'y lit rien : le
  parcours du joueur demandera des RPC `security definer` qui n'existent pas
  encore.
- **Le domaine et le DNS.** Hors de ce document, et hors de ce que je fais.
- **La désaffectation de Fideliz.** Rien ne s'y supprime tant que la phase 3
  n'a pas tenu plusieurs jours.
