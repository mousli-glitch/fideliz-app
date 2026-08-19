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

**751 tests** (20 fichiers), `tsc --noEmit` code 0, `npm run build` vert.

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
| 4 | matrice de conservation fonctionnelle | — |
| 5 | audit `service_role` exhaustif | partiellement fait (`docs/inventaire-destructif.md`) |
| 6 | compatibilité interfaces, affichage monétaire, marque | — |
| 7 | migrateur complet rejouable | le dry-run existe et est idempotent ; le reste non |
| 8 | répétition du gel | scripts prêts, non rejoués en séquence complète |
| 9 | répétition générale synthétique de bout en bout | — |
| 10 | dossier `READY_FOR_MIGRATION` | — |

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

### Point ouvert, mineur

La grammaire accepte `« 999999,99 »` → 99 999 999 centimes, au-dessus de la
borne `games_min_spend_cents_borne` (99 999 900). Une telle saisie passe le
parseur et se fait rejeter par la contrainte, avec un message opaque au lieu du
`P0120` lisible. Rien n'est écrit, rien n'est corrompu : c'est un message
d'erreur, sur une saisie absurde. Le comportement actuel est figé par un test
pour qu'une correction soit un choix et non un accident.

## Pourcentages, sans arrondi flatteur

- **Préparation invisible : ~65 %.** Les fondations de sécurité et
  d'atomicité sont fermées et prouvées, le contrat monétaire l'est de bout en
  bout ; la conservation, le migrateur complet, la répétition générale et le
  dossier opératoire ne le sont pas.
- **Avant mise en service complète : ~25 %.** Le hotfix P0 est appliqué, mais
  c'est la seule opération réelle : ni migration de données, ni gel, ni
  bascule visible.
