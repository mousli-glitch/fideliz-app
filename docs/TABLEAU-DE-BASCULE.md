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
| 7e — vocabulaire des rôles | à faire | `restaurant` → `restaurateur` : 54 sites TS + ~45 prédicats SQL. Le trigger `handle_new_user_profile` est l'écrivain autoritaire |
| 7f — exclusions à acter | à faire | `crm_notes`, `sales_restaurants`, `restaurants.is_active`, les 8 policies Storage Fideliz, `on_auth_user_created`, `tr_on_commercial_deleted` |
| 7g — le migrateur de données | à faire | rien n'est écrit ; dépend de 7h |
| 7h — l'annuaire des comptes | **bloquée — décision** | le mapping arbitre 9 restaurants et **zéro compte** |

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

**Un seul point vraiment bloquant : 7h.** Tant que l'annuaire des comptes n'est
pas arbitré nominativement, le migrateur ne peut pas être écrit — il ne saurait
pas quel UUID survit pour la-ruche et best-pizza, les deux vrais clients communs.

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
| **R3** | Annuaire des comptes arbitré nominativement | Un fichier de mapping des comptes, **9 lignes pour 9 comptes**, chacune portant : UUID survivant, adresse canonique, rôle cible, restaurant cible, sort du doublon |
| **R4** | Migrateur rejouable et idempotent | Sur banc neuf : deux exécutions consécutives donnent des empreintes de contenu **identiques** ; un arrêt au milieu se reprend sans doublon. **⚠ Un banc fraîchement créé est EN RETARD sur son parent** — mesuré le 19/08 : il n'a rejoué que les migrations de version ≤ 20260819190000, laissant 081→085 de côté. Le protocole doit les réappliquer avant toute mesure, sans quoi on éprouve un schéma qui n'est pas celui de la production |
| **R5** | Témoin de conservation au vert **après versement** | Les 189 points passent sur le banc chargé, pas seulement à vide |
| **R6** | Isolation entre restaurants prouvée après versement | Batterie d'isolation jouée avec des comptes de test réels : aucun restaurant ne lit ni n'écrit chez un autre, Storage compris |
| **R7** | QR imprimés intacts | `npm run qr:verifier` au vert **et** comparaison du contenu servi avant/après sur les 4 QR imprimés + `/m/<slug>` |
| **R8** | Rien de Fideliz ne s'active à tort | Sonde sur banc vérifiant l'absence nominative des objets non importés (les 6 de la tranche 7f) |
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
