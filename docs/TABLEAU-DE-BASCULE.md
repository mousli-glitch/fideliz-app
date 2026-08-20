# Tableau de bascule — état stable, sans pourcentage

> Ce document remplace les pourcentages. Un pourcentage d'avancement sur un
> chantier dont la moitié des inconnues n'est pas encore ouverte est une
> intuition déguisée en mesure. Ici : ce qui est fermé, ce qui reste, ce qui
> bloque quoi, et à quelles conditions exactes on peut basculer.
>
> Dernière mise à jour : 20/08/2026 — **LA BASCULE EST JOUÉE.** 67 secondes de gel, 1 745 lignes versées, tous les contrôles verts.

---

## 0. LA BASCULE EST JOUÉE — 20/08/2026, 00:34–00:36 UTC

**1 745 lignes de Fideliz vivent désormais dans Cartiz.** 67 secondes de gel,
aucune écriture perdue, tous les contrôles verts.

| | Fideliz (source) | Cartiz (destination) |
|---|---|---|
| Jeux | 9 dont 3 versés (`test78` exclu) | **3** |
| Lots | 36 dont 12 versés | **12** |
| Tickets | 501 | **489** |
| Avis | 1 513 dont 752 versés | **752** |
| Contacts | 503 | **489** |
| Restaurants | 4 | 5 → **6** (`soukara` créé) |
| Comptes | inchangés | **3 opérations** |

**Ce qui reste vrai après la bascule :** Fideliz continue de tourner et de
prendre des tickets. La copie de Cartiz commence donc à diverger dès
maintenant — c'est attendu. Le vrai basculement des clients est le changement
de domaine, qui n'a **pas** été fait et reste une décision à part.

**Ce qui reste à faire, et qui est à Samy :**

1. **Transmettre les mots de passe provisoires**, puis supprimer le fichier
   (`mots-de-passe-fusion-*.txt`, en 600, dans le dépôt Cartiz — ignoré par
   git). Trois comptes : la-ruche, soukara, le commercial.
2. **Importer une carte pour Soukara**, puis le publier (étape 3.8, laissée
   volontairement non jouée : il n'a aucune page de carte).
3. **Le changement de domaine**, quand il le décidera.

---

## 1. Lots fermés et prouvés

| Lot | Objet | Ce qui le prouve |
|---|---|---|
| **1** | Durcissement des privilèges (4 couches) | Matrice de 15 scénarios rejouée, sentinelle durcie, harnais de concurrence à 2 sessions |
| **2** | Identité root, cascade, suppression restaurant | Harnais cascade avec garde FK sémantique, manifeste avant/après, runner négatif |
| **3** | Contrat monétaire | `play_game` et `register_win` lisent le contrat ; 4 lecteurs applicatifs basculés ; garde anti-retour |
| **4** | Matrice de conservation + témoin | 189/189 au vert ; les 5 trous nommés fermés (Storage, jeu 100 %-gagnant, avis, tâches planifiées, tables de sauvegarde) |
| **5** | Actions à clé de service | 25 actions classées par joignabilité et garde ; `check-replay` corrigé (l'oracle `play_count` retiré) |
| **6** | Schéma d'accueil, gating, marque et QR | 4 collisions nommées et chiffrées, 73 constats arbitrés, `/scan` tranché (P-16) |

**Correctifs réellement appliqués en production** (les seuls) : la faille du lot
d'un autre restaurant, les lecteurs monétaires, le minimum d'achat,
l'oracle `play_count`, l'état fantôme `consumed`, et `/scan` coupé par un
abonnement expiré.

---

## 2. Lot 7 — le migrateur. En cours.

| Tranche | État | Preuve ou blocage |
|---|---|---|
| 7a — `restaurants`, schéma | **fermée** | 083 appliquée : 58 colonnes, 32 ajoutées, 16 écartées avec fil de détente, lien `created_by` toujours NO ACTION |
| 7b — droits par colonne | **fermée** | 084 appliquée : menu public 200 inchangé, 3 colonnes sensibles en 401, prouvé par appel `anon` réel |
| 7c — `profiles.is_active` | **fermée** | 085 + `lib/compte-coupe.ts` ; 214 tests, typecheck et build verts |
| 7d — `is_active` dans les prédicats | **fermée** | 086 : répétée sur banc neuf, batterie positive et négative, garde éprouvée dans les deux sens, 7/7 empreintes identiques banc↔production |
| 7e — vocabulaire des rôles | **fermée** | Aucune migration nécessaire : Cartiz est la destination et son CHECK est déjà bon. `lib/roles.ts` porte la traduction, `lib/roles.test.ts` la garde de portage — prouvée sur le vrai code Fideliz, 13 fichiers / 32 lignes attrapées. Le chiffre de ~45 du lot 6 comptait le renommage de clé primaire, chantier qui n'existe pas |
| 7f — exclusions à acter | **fermée** | `supabase/tests/exclusions-fideliz.sql` : 32 objets nommés, avec contre-épreuve de complétude. Vert sur Cartiz, les 8 blocs détectent sur Fideliz |
| 7g — le migrateur de données | **débloquée** | 7h est fermée. Pré-requis : **087, le schéma d'accueil du jeu** — Cartiz n'a ni `games`, ni `prizes`, ni `winners`, ni `avis`, ni `contacts`. Périmètre mesuré : 3 jeux, 12 lots, 488 gagnants, 752 avis, 488 contacts ≈ 1 743 lignes |
| 7h — l'annuaire des comptes | **fermée** | `scripts/non-regression/mapping-comptes.json` : les 9 comptes arbitrés par Samy le 19/08. 2 créés, 1 modifié, 6 non versés |

---

## 3. Lots restants

| Lot | Objet | État |
|---|---|---|
| **8** | Répétition du gel, séquence complète chronométrée | **FERMÉE le 20/08** — activation 18 ms, matrice 46 ms, levée 3 ms, tout reprend derrière. Elle a trouvé un défaut client réel (voir `qualification-lot-8-repetition-du-gel.md`) **et** que le gel n'est pas en production |
| **9** | Répétition générale de bout en bout sur banc, versement compris | **FERMÉE le 20/08** — 10 étapes en 14,9 s, puis R8, R6 et R5 sur le banc chargé |
| **10** | Dossier `READY_FOR_MIGRATION` constitué et signé | **reste** — il manque R1 et R2, tous deux à la main de Samy |

---

## 4. Chemin critique — au 20/08/2026

Tout ce qui était technique sur le chemin est fermé. Ce qui reste tient en
deux décisions et une répétition.

```
  083→088 appliquées ──► 7g migrateur ──► lot 9 répétition générale ──┐
       (FERMÉ)             (FERMÉ)              (FERMÉ le 20/08)       │
                                                                       ▼
       lot 8 · répétition du gel  ──► FERMÉ    le 20/08 ──┐
       3.0 · gel posé sur Fideliz ──► FAIT     le 20/08 ──┤
       P-9 · l'euro, posée        ──► TRANCHÉE le 20/08 ──┼──► READY_FOR_MIGRATION
       #68 · verrou d'activation  ──► TRANCHÉE le 20/08 ──┤            │
       R1  · colonnes écartées    ──► à confirmer ────────┘            ▼
                                                                    bascule
```

**Le chemin ne passe plus par du code.** Il passe par :

1. ~~**Les décisions produit**~~ — **toutes tranchées le 20/08.** `P-9` :
   l'euro, posée. `#68` : un verrou d'activation plutôt qu'une limite
   prématurée — la rejouabilité ne peut plus être activée sans sa limite.
2. ~~**Déployer le gel sur Fideliz**~~ — **FAIT le 20/08.** Posé inactif sur
   la production Fideliz, 10 triggers conformes, les deux corps de fonction
   à l'empreinte exacte du banc. La production écrit toujours : 10 contrôles
   d'écriture-puis-annulation, verts, rien laissé. C'est la **seule migration
   CONFORME** du registre Fideliz — au registre ET effective.

Les huit autres critères sont acquis et rejouables en une commande.

---

## 5. Critères de `READY_FOR_MIGRATION`

Chacun est un fait vérifiable, pas une appréciation.

**Huit sur dix sont acquis.** Les deux qui restent — R1 et R2 — ne se
prouvent pas par du code : ils attendent une décision de Samy.

| # | Critère | Comment il se prouve |
|---|---|---|
| **R1** | Schéma d'accueil complet | **PRESQUE.** 087, 088 et 089 : les 5 tables et le panier moyen sont posés, le migrateur écrit sans manque — mesuré : 3 jeux, 12 lots, 489 gagnants, 752 avis, 488 contacts. Restent écartées délibérément `games.min_spend` (texte, doublon de `min_spend_cents`) et les 3 jetons OAuth Google — aucune n'est réclamée par un écran |
| **R2** | Aucune décision produit ouverte sur le chemin | **ACQUIS le 20/08.** **P-9** tranchée — l'euro, posée avec une contrainte qui refuse les centimes. **#68** tranchée — ni la limite maintenant, ni rien : un **verrou d'activation** posé des deux côtés, qui refuse `replay_enabled = true` tant que la limite n'existe pas. 7 contrôles verts sur la production, rien laissé |
| **R3** | Annuaire des comptes arbitré nominativement | **ACQUIS** — `mapping-comptes.json`, 9 lignes pour 9 comptes, chacune avec son action et sa justification |
| **R4** | Migrateur rejouable et idempotent | **ACQUIS le 19/08, reconfirmé le 20/08** | Sur banc neuf : deux exécutions consécutives donnent des empreintes de contenu **identiques** ; un arrêt au milieu se reprend sans doublon. **⚠ Un banc fraîchement créé est EN RETARD sur son parent** — mesuré le 19/08 : il n'a rejoué que les migrations de version ≤ 20260819190000, laissant 081→085 de côté. Le protocole doit les réappliquer avant toute mesure, sans quoi on éprouve un schéma qui n'est pas celui de la production |
| **R5** | Témoin de conservation au vert **après versement** | **ACQUIS le 19/08, RENFORCÉ le 20/08** — 189 vertes / 0 rouge, deux fois, contre un banc ayant traversé la répétition ENTIÈRE : ensemencement, versement, rejeu, retour arrière, reversement. Le discriminant tient (`/m/chez-samy` → 404, les deux menus réels → 200). Recette au runbook §2.8 |
| **R6** | Isolation entre restaurants prouvée après versement | **ACQUIS le 19/08, ÉLARGI le 20/08** — mesuré sur **quatre** acteurs et non deux : `soukara` en fait désormais partie, son compte existant depuis que l'étape 3.4 est jouée. Un gérant coupé (`is_active = false`) est ensemencé exprès sur un restaurant qui a des données : sans lui, la batterie ne mesurait jamais la branche posée par 086 |
| **R7** | QR imprimés intacts | **Préalable ACQUIS le 19/08** — `lib/fusion/surface-menu.test.ts` prouve exhaustivement que le versement n'écrit dans aucune colonne que le menu lit. Reste `npm run qr:verifier` après le versement réel : GO 189/189 avant, à refaire après |
| **R8** | Rien de Fideliz ne s'active à tort | **ACQUIS le 20/08** — la sonde a été rejouée là où elle compte : **sur un banc chargé, après versement**. 32 objets nominatifs absents, contre-épreuve de complétude verte. Reste à la rejouer une dernière fois après le versement réel |
| **R9** | Sauvegarde et retour arrière éprouvés | **ACQUIS le 19/08** — archive Storage de 82 Mo (36 contenus dédupliqués sur 46 objets) déposée hors site, **retéléchargée et revérifiée** : 0 corrompu, 0 orphelin. Retour arrière écrit ET joué sur banc, avec reversement derrière |
| **R10** | Répétition générale jouée | **ACQUIS le 20/08** — `scripts/fusion/repetition-generale.ts`, 10 étapes chronométrées, jouée trois fois. Elle a trouvé trois défauts qu'aucune brique isolée ne voyait (voir §6). **Le gel n'en fait pas partie** : c'est le lot 8, et il reste entier |

---

## 6. Ce que la répétition générale a trouvé — 20/08/2026

Trois défauts, tous invisibles brique par brique, tous révélés par
l'enchaînement. Ils sont corrigés ; ils sont ici parce qu'ils disent ce
qu'une répétition sert à trouver.

| # | Le défaut | Ce qu'il aurait coûté |
|---|---|---|
| 1 | **L'ensemencement du banc était en prose**, fait à la main | Deux bancs n'étaient jamais tout à fait le même. La répétition n'était générale qu'à partir de l'étape 2.4 — tout ce qui précède reposait sur des gestes non tracés |
| 2 | **L'étape 3.4 n'était jamais jouée** : la répétition planifiait les comptes sans les créer. En la jouant, `comptes.ts` s'est révélé **non reprenable** — 422 au second passage, APRÈS avoir réinitialisé un mot de passe | Un échec partiel le jour J laissait l'opérateur sans issue : relancer invalidait un secret déjà transmis, et ne finissait pas les opérations restantes. Sur une opération d'authentification, qui « se répare en téléphonant à un restaurateur » |
| 3 | **Le relevé d'état d'avant n'était daté que du jour.** La répétition du 20 a réellement réutilisé celui du 19, relevé sur un AUTRE banc | Le plus grave. Répétition et bascule tombant par construction le même jour, le retour arrière de la **production** aurait restauré des valeurs relevées sur un **banc** — c'est-à-dire écrasé des données réelles avec des données de répétition, en croyant réparer |

Le fichier porte désormais sa base dans son nom et dans son contenu.
`migrer.ts` refuse d'en réutiliser un d'une autre base, `defaire.ts` refuse
d'en appliquer un d'une autre base ou au format ancien — les deux refus sont
prouvés par contre-épreuve.

Au passage : ni le fichier de mots de passe ni le relevé n'étaient dans
`.gitignore`. Un `git add -A` aurait commité des secrets et des adresses
réelles. Ils y sont.

### Un fait mesuré, qui n'est pas un défaut

Entre deux versements espacés de quarante minutes, le décompte des tickets
est passé de 488 à 489. Vérifié plutôt que supposé : **Soukara a émis
4 tickets dans la nuit du 19 au 20**. Fideliz vit pendant qu'on prépare la
migration. C'est exactement ce que le gel de l'étape 3.1 arrête, et la
répétition vient d'en donner la démonstration par accident.

---

## 7. Constats ouverts, relevés en chemin

- **`_peut_agir_sur` n'accepte que le rôle `root`, pas `admin`.** Vérifié
  empiriquement sur banc le 19/08 : le compte du fondateur y est refusé,
  alors que `is_admin()`, `est_root()` et `mes_restaurants()` l'acceptent.
  C'est la « double notion de fondateur » du lot 6, mesurée pour la première
  fois. Non corrigé : ce serait changer une sémantique d'autorisation.
- **`mes_restaurants` et `mes_restaurants_gestion` ont le corps strictement
  identique** — même empreinte, mêmes 319 octets, pour 33 policies au total.
  La prochaine main qui modifie l'une oubliera l'autre.
- **Les fichiers de migration locaux n'ont pas de préfixe horodaté**
  (`083_…` et non `20260819210200_…`), contrairement à ce que la plateforme
  écrit dans son registre. Les deux conventions coexistent ; à trancher avant
  la répétition générale.

---

## 8. Ce qui n'a jamais été touché, et qu'il faudra ouvrir

- **Le gel de bascule** — écrit, installé inactif, jamais activé puis levé en
  séquence chronométrée. C'est le lot 8, et c'est désormais **le dernier
  chantier technique** avant la bascule.
- **Les 4 tables de sauvegarde Fideliz** — 133 lignes, 116 adresses. En attente.
- **`email_contact`, `telephone`, `abonnement_*`, `created_by`** sont lisibles
  publiquement sur `restaurants`. Antérieur à la fusion, non corrigé (085 ne
  traite que la mécanique). Ce sera 085-bis.
