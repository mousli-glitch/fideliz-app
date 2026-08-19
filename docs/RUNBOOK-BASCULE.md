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
| 2.3 | Y verser la sauvegarde du Storage | chaque chemin retrouve son contenu |
| 2.4 | `migrer.ts --appliquer` vers le banc | « VERSEMENT CONFORME » |
| 2.5 | **Rejouer 2.4 à l'identique** | mêmes comptes, aucune ligne en double — **c'est R4** |
| 2.6 | `comptes.ts --appliquer` vers le banc | 3 opérations |
| 2.7 | Rejouer la sonde R8 sur le banc chargé | vert |
| 2.8 | Rejouer le témoin de conservation | **189/189** — c'est R5 |
| 2.9 | Batterie d'isolation avec des comptes réels | aucun restaurant ne voit chez un autre — R6 |
| 2.10 | Servir les menus depuis le banc | contenu identique à avant — R7 |
| 2.11 | Supprimer le banc | il coûte 0,013 $/h |

**Point d'arrêt.** Si 2.5 crée des doublons, le migrateur n'est pas
idempotent et la bascule est reportée. Aucune exception.

---

## Phase 3 · La bascule

**Rien de cette phase n'a jamais été joué. Chaque étape demande l'accord
explicite de Samy au moment de la jouer.**

| # | Geste | Vérification |
|---|---|---|
| 3.1 | Activer le gel de bascule côté Fideliz | les écritures Fideliz sont refusées |
| 3.2 | Refaire une sauvegarde du Storage et de la base | vérifiée |
| 3.3 | `FUSION_JE_CONFIRME=oui migrer.ts --appliquer` | « VERSEMENT CONFORME » |
| 3.4 | `FUSION_JE_CONFIRME=oui comptes.ts --appliquer` | 3 opérations, fichier de mots de passe en 600 |
| 3.5 | Sonde R8 sur la production chargée | vert |
| 3.6 | Témoin de conservation | 189/189 |
| 3.7 | `npm run qr:verifier` + les 5 menus | **inchangés** |
| 3.8 | Publier `soukara` (`publie = true`) | son menu répond |
| 3.9 | Transmettre les mots de passe, **puis supprimer le fichier** | fichier absent |

**Le versement laisse `soukara` en `publie = false`.** Un restaurant versé
n'apparaît pas au public avant qu'on l'ait regardé — 3.8 est un geste
délibéré, pas un effet de bord.

---

## Phase 4 · Retour arrière

**Écrit** le 19/08/2026 — `scripts/fusion/defaire.ts`. Non éprouvé : comme le
reste, il attend un banc.

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
