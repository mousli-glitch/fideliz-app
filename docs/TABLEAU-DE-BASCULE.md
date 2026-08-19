# Tableau de bascule — état stable, sans pourcentage

> Ce document remplace les pourcentages. Un pourcentage d'avancement sur un
> chantier dont la moitié des inconnues n'est pas encore ouverte est une
> intuition déguisée en mesure. Ici : ce qui est fermé, ce qui reste, ce qui
> bloque quoi, et à quelles conditions exactes on peut basculer.
>
> Dernière mise à jour : 19/08/2026.

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

| Lot | Objet |
|---|---|
| **8** | Répétition du gel, séquence complète chronométrée |
| **9** | Répétition générale de bout en bout sur banc, versement compris |
| **10** | Dossier `READY_FOR_MIGRATION` constitué et signé |

---

## 4. Chemin critique

```
  7h  arbitrage des comptes  ──┐
  P-9 unité du panier moyen  ──┼──►  7g migrateur  ──►  lot 9 répétition  ──►  bascule
  P-x couleurs / theme_json  ──┘            ▲
                                            │
        7d ──► 7e ──► 7f  (indépendants entre eux, tous requis)
```

**7h est fermée depuis le 19/08.** Le chemin critique passe désormais par le
schéma d'accueil du jeu :

```
  087 schéma d'accueil  ──►  7g migrateur  ──►  lot 8 gel  ──►  lot 9 répétition  ──►  bascule
  (games, prizes,
   winners, avis,
   contacts)
```

Cartiz n'a **aucune** de ces cinq tables. Elles doivent exister, avec leur RLS
et leurs policies bornées au restaurant, avant qu'une seule ligne ne bouge.

Deux décisions produit secondaires (`P-9` panier moyen, couleurs contre
`theme_json`) bloquent des tranches, pas l'ensemble.

---

## 5. Critères de `READY_FOR_MIGRATION`

Chacun est un fait vérifiable, pas une appréciation. Aucun n'est acquis
aujourd'hui.

| # | Critère | Comment il se prouve |
|---|---|---|
| **R1** | Schéma d'accueil complet | Comparaison automatique entre la liste des colonnes que le migrateur écrit et le schéma vivant de Cartiz : **0 manquante** |
| **R2** | Aucune décision produit ouverte sur le chemin | Intersection { P-xx ouverts } ∩ { objets versés } = **∅** |
| **R3** | Annuaire des comptes arbitré nominativement | **ACQUIS** — `mapping-comptes.json`, 9 lignes pour 9 comptes, chacune avec son action et sa justification |
| **R4** | Migrateur rejouable et idempotent — **ACQUIS le 19/08** | Sur banc neuf : deux exécutions consécutives donnent des empreintes de contenu **identiques** ; un arrêt au milieu se reprend sans doublon. **⚠ Un banc fraîchement créé est EN RETARD sur son parent** — mesuré le 19/08 : il n'a rejoué que les migrations de version ≤ 20260819190000, laissant 081→085 de côté. Le protocole doit les réappliquer avant toute mesure, sans quoi on éprouve un schéma qui n'est pas celui de la production |
| **R5** | Témoin de conservation au vert **après versement** | Les 189 points passent sur une base CHARGÉE. ⚠ `verifier.mjs` vise une application déployée et ses fixtures encodent les vrais identifiants : sur banc, l'application doit tourner en local contre lui. Sinon c'est un contrôle de phase 3, joué juste après le versement. **Joué le 19/08 avant versement : GO 189/189** |
| **R6** | Isolation entre restaurants prouvée après versement | **ACQUIS le 19/08** — `supabase/tests/isolation-apres-versement.sql`, sur 1 743 lignes versées, RLS intacte, éprouvée dans les deux sens : elle rougit et nomme la fuite quand on rend une policy permissive |
| **R7** | QR imprimés intacts | **Préalable ACQUIS le 19/08** — `lib/fusion/surface-menu.test.ts` prouve exhaustivement que le versement n'écrit dans aucune colonne que le menu lit. Reste `npm run qr:verifier` après le versement réel : GO 189/189 avant, à refaire après |
| **R8** | Rien de Fideliz ne s'active à tort | **Sonde écrite et éprouvée** : `supabase/tests/exclusions-fideliz.sql`, 32 objets nominatifs, contre-épreuve de complétude incluse. Vert sur Cartiz aujourd'hui ; **à rejouer après le versement**, c'est là qu'elle compte |
| **R9** | Sauvegarde et retour arrière éprouvés | Une sauvegarde datée de Cartiz **restaurée avec succès** sur un banc, procédure de retour arrière écrite et **jouée**. Storage inclus — 130 Mo, 2 buckets publics, **aujourd'hui sans aucune procédure** |
| **R10** | Répétition générale jouée | De bout en bout, gel compris, chronométrée, avec journal des écarts |

---

## 6. Constats ouverts, relevés en chemin

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

## 7. Ce qui n'a jamais été touché, et qu'il faudra ouvrir

- **Le Storage** — 130 Mo dans `flyer-pages`, deux buckets publics, aucune
  procédure de sauvegarde. C'est le dernier angle mort complet (`R9`).
- **Les 4 tables de sauvegarde Fideliz** — 133 lignes, 116 adresses. En attente.
- **`email_contact`, `telephone`, `abonnement_*`, `created_by`** sont lisibles
  publiquement sur `restaurants`. Antérieur à la fusion, non corrigé (085 ne
  traite que la mécanique). Ce sera 085-bis.
