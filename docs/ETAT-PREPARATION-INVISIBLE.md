# État de la préparation invisible — checkpoint durable

Écrit le 19/08/2026. Ce fichier est le point de reprise : il dit ce qui est
**prouvé**, ce qui est **préparé mais non prouvé**, et ce qui n'est **pas
commencé**. Il ne gonfle rien.

## Règle de qualification appliquée

Un artefact n'est **prouvé** que si **le fichier réellement livré** a été
exécuté sur la cible synthétique. Une réimplémentation sert à explorer, jamais
à qualifier. Cette règle a coûté deux tours (le rollback du hotfix ne
compilait pas alors que je le déclarais prouvé) ; elle est désormais tenue.

## Fermé et prouvé

| Lot | Preuve | Fichier de preuve |
|---|---|---|
| Cascade de suppression | manifeste FK identique avant/après, 4 fautes détectées | `harnais-cascade-*.sql` |
| Fenêtre de suppression | 7/7 + jeton 10/10 | `harnais-fenetre-suppression.sql`, `harnais-jeton-fenetre.sql` |
| Enregistrement du jeu | 10/10 + agrégat 19/19 | `harnais-enregistrement-jeu.sql`, `harnais-agregat-jeu.sql` |
| Isolation lot/jeu (P0) | attaque 2/5 → 5/5, machine d'état 11 transitions | `harnais-isolation-lot-jeu.sql`, `harnais-machine-etat-hotfix.sql` |
| Contrat monétaire | oracle unique, corrigé 34/34, permissif 13/34 | `harnais-contrat-monetaire.sql` |
| Création atomique du jeu | 13/13, ancien jeu actif après refus | `harnais-creation-jeu.sql` |
| Paquet hotfix | fichiers **livrés** exécutés : préimage ↔ postimage | `harnais-hotfix.test.ts` |
| Lecteurs monétaires (lot 3) | 24/24 avec le correctif, **5/24 sans lui** ; aller-retour migration ↔ rollback par empreinte | `harnais-lecteurs-monetaires.sql`, `lecteurs-monetaires.test.ts` |

**797 tests** (21 fichiers), `tsc --noEmit` code 0, `npm run build` vert.

## Préparé, non appliqué

Dix migrations `20260819*`, chacune avec son rollback, toutes jouées sur la
branche synthétique, **aucune en production**.

### ⚠️ Ordre de déploiement — migrations AVANT code

Le code applicatif exige désormais les colonnes de la migration
`20260819060000`. `getWinnerInfoAction` sélectionne
`winners.min_spend_cents_snapshot` : déployé sur une base qui n'a pas la
colonne, PostgREST renvoie une erreur, et le scanner répond « QR code invalide
ou introuvable » **pour tous les tickets**.

Les migrations `20260819*` doivent donc être appliquées **avant** toute mise en
ligne du code. Ce couplage est volontaire — les colonnes sont nullables et les
fonctions ne changent pas de signature, donc l'inverse (migrations seules, sans
code) est parfaitement sûr.

## Hotfix P0 — appliqué en production le 19 août 2026

La faille permettant à un joueur de présenter le lot d'un autre restaurant est
**fermée en production**. Samy l'a autorisée explicitement, pour ce seul
correctif ; les trois étapes du paquet `hotfix/isolation-lot-jeu/` ont été
jouées dans l'ordre, avec le contenu exécutable des fichiers livrés.

Préflight vert, application commitée, contrôles post verts. Empreinte
`374e1382…` → `32a32389…`, manifeste et droits effectifs inchangés, aucune
donnée métier touchée. Trace complète et point ouvert (la migration n'est pas
inscrite au journal de production) : `hotfix/isolation-lot-jeu/APPLICATION-PRODUCTION.md`.

C'est **la seule opération réelle** menée en production à ce jour. Toutes les
autres migrations `20260819*` restent sur la branche synthétique.

## Non commencé — ce qu'il reste

| Lot | Contenu | Pourquoi ce n'est pas fait |
|---|---|---|
| 5 | audit `service_role` exhaustif | partiellement fait (`docs/inventaire-destructif.md`) |
| 6 | compatibilité interfaces, affichage monétaire, marque | — |
| 7 | migrateur complet rejouable | le dry-run existe et est idempotent ; le reste non |
| 8 | répétition du gel | scripts prêts, non rejoués en séquence complète |
| 9 | répétition générale synthétique de bout en bout | — |
| 10 | dossier `READY_FOR_MIGRATION` | — |

## Lot 4 — la matrice de conservation, écrite avec ses trous

`docs/matrice-conservation-fonctionnelle.md`. Une ligne par fonction, quatre
niveaux dont un seul est une preuve : **PROUVÉ**, **SOUS TÉMOIN**, **ANALYSÉ**,
**RIEN**.

Le témoin de non-régression existe déjà côté Cartiz (`npm run qr:verifier`,
171 contrôles) et couvre les cinq parcours dont les QR sont imprimés. Il n'a
pas été reconstruit. Vérifié au passage : le lot 3 n'a cassé aucune de ses
assertions.

**Cinq trous nommés**, mesurés et non déduits :

1. le Storage n'est sous aucun témoin côté Fideliz — alors que **9 jeux sur 9**
   et **4 logos sur 4** en dépendent ;
2. **aucun jeu 100 %-gagnant n'existe** en production : la conservation de ce
   cas ne peut être prouvée que sur fixture synthétique ;
3. les **1 513 avis** n'ont aucun témoin de lecture applicative ;
4. `pg_cron` est **présente en production et absente du banc** ; et l'état
   actuel porte une dette — **trois tâches d'archivage identiques à la même
   minute**, une quatrième dix minutes plus tard ;
5. les 4 tables de sauvegarde (133 lignes) attendent une décision de Samy.

⚠️ Le témoin n'a **pas** été lancé le 19/08 : une boucle de requêtes avait
déclenché le pare-feu Vercel sur mon adresse. C'est la première chose à faire
à la reprise.

## Lot 3 — les lecteurs monétaires, fermé et prouvé

Le contrat monétaire est désormais fermé **des deux côtés** : écriture et
lecture. Six lecteurs partageaient cinq grammaires différentes du même montant ;
ils en partagent une seule.

| Lecteur | Avant | Après |
|---|---|---|
| `play_game` (SQL) | `^[0-9]+$` … `else 0` | `minimum_effectif_centimes` |
| `register_win` (SQL) | idem | idem |
| `getWinnerInfoAction` (scanner) | `/^[0-9]+$/` … `: 0` | `lireMinimum` |
| `/verify/[id]` | `parseFloat` | `lireMinimum` |
| roue publique | `parseFloat` | `lireMinimum` |
| fiche d'édition du jeu | `parseFloat(...) \|\| 0` | `lireMinimum` |

Trois acquis en plus du calcul :

- **Le snapshot est écrit à l'émission.** `winners.min_spend_cents_snapshot`
  fige la condition au moment du gain, comme le fait déjà le libellé du lot.
  Modifier un jeu ne réécrit plus la condition d'un ticket déjà remis.
- **`min_spend` garde son unité.** La charge JSON rendue au navigateur reste en
  EUROS ; elle cesse simplement d'être fausse. `min_spend_cents` est ajouté à
  côté et devient la référence.
- **Trois états au lieu de deux.** « Aucun minimum » et « minimum illisible » ne
  s'écrivent plus pareil. L'ancien scanner affichait « Aucun » dans les deux
  cas — la même faute que le `else 0`, déplacée dans l'interface.

### Appliqué en production le 19 août 2026

Le paquet a été joué : préflight `ETAPES 2 ET 3 REQUISES`, étapes 2 et 3
commitées, contrôles post `CONTROLE OK`. Empreintes `bd472a31…` → `9e7af73a…`
et `32a32389…` → `2ae951e4…`, isolation lot/jeu intacte, aucune donnée métier
touchée (vérifié par empreinte dans chaque transaction).

**Ce qui est acquis :** chaque ticket émis depuis ce commit porte sa condition
figée, correctement calculée.

**Le code a suivi le même jour**, par un commit isolé construit depuis
`origin/main` — jamais en fusionnant `candidat/baseline-acl`, qui appelle six
RPC absentes de production et casserait la création et la modification d'un
jeu. Commit `f655267`, onze fichiers, aucune dépendance ajoutée.

Puis `e14ba98`, qui ferme l'interrupteur « Minimum de commande » : l'éteindre
masquait le champ et laissait le montant en base.

Trace : `deploiement/lot-3-lecteurs-monetaires/APPLICATION-PRODUCTION.md`.

### Le paquet lui-même

`deploiement/lot-3-lecteurs-monetaires/` : quatre étapes plus un retour
arrière, chacune exécutée en répétition générale sur la branche synthétique
replacée dans la forme exacte de la production. Les trois verdicts du préflight
ont été observés.

Le paquet est **généré** (`generer.mjs` versionné) et un test compare les
fichiers livrés à ce que le générateur produit : le paquet ne peut pas dériver
des migrations qu'il embarque.

Deux points que le README dit sans détour : cette application est **nécessaire
mais pas suffisante** — le scanner continuera d'afficher « Aucun » jusqu'au
déploiement du code ; et le rollback de l'étape 2 **supprime les colonnes**,
donc les conditions figées de tous les tickets émis depuis (il est hors du
paquet, voir `DANGER-retour-arriere-contrat.md`).

### Trouvé et corrigé dans la foulée : l'interrupteur qui ne retirait rien

Éteindre « Minimum de commande » sur une fiche existante masquait le champ à
l'écran et **laissait le montant en base** : `updateGameAction` ne lisait
jamais `has_min_spend`. Le restaurateur croyait avoir retiré la condition, son
client se la voyait encore opposée en caisse.

La règle existait pourtant — la fiche de *création* tranchait déjà au moment de
l'appel. Elle vivait dans une page et pas dans l'autre.

Corrigé des deux côtés le 19/08 : `e14ba98` en production
(`lib/montant-formulaire.ts`, une seule règle, du côté qui écrit) et `4841f58`
sur cette branche, où les **deux** actions portaient le défaut. Le corriger
seulement en production l'aurait fait revenir à la fusion.

`=== false` et non `!has_min_spend` : un champ absent n'est pas un refus, et
transformer une information manquante en décision métier serait le `else 0`
réintroduit par la porte de service.

### Point ouvert, mineur

La grammaire accepte `« 999999,99 »` → 99 999 999 centimes, au-dessus de la
borne `games_min_spend_cents_borne` (99 999 900). Une telle saisie passe le
parseur et se fait rejeter par la contrainte, avec un message opaque au lieu du
`P0120` lisible. Rien n'est écrit, rien n'est corrompu : c'est un message
d'erreur, sur une saisie absurde. Le comportement actuel est figé par un test
pour qu'une correction soit un choix et non un accident.

## Avancement — voir `TABLEAU-DE-BASCULE.md`

Les pourcentages qui figuraient ici sont retirés le 19/08/2026, à la demande
de Samy et parce qu'ils mentaient : un pourcentage sur un chantier dont la
moitié des inconnues n'est pas encore ouverte est une intuition déguisée en
mesure.

`docs/TABLEAU-DE-BASCULE.md` porte désormais l'état stable : lots fermés,
lots restants, chemin critique, et les dix critères vérifiables de
`READY_FOR_MIGRATION`.
