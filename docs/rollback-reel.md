# Rollback — ce qui est vérifié, ce qui ne l'est pas

Établi le **18/08/2026**. Corrige une affirmation trop rapide de ma part :
j'avais écrit que le rollback base consistait à « rejouer la baseline ».
**C'est faux.** Une baseline reconstruit un *schéma* ; elle ne rend ni les
lignes, ni les comptes Auth, ni les fichiers du Storage.

## Les sept dimensions, séparément

| # | Dimension | Mécanisme | Vérifié ? |
|---|---|---|---|
| 1 | Application Vercel | `vercel rollback <url>` | ✅ cible identifiée, déploiement `Ready` |
| 2 | Schéma SQL | migrations inverses ciblées | ⚠️ à écrire migration par migration |
| 3 | Données métier | sauvegarde logique vérifiée | ✅ **2 980 lignes, 20 fichiers, empreintes relues** |
| 4 | Auth | inclus dans la base ; export logique séparé | ⚠️ **sans les mots de passe** |
| 5 | Storage | inventaire + empreintes ; octets sur demande | ⚠️ voir plus bas |
| 6 | Écritures pendant la fenêtre | — | ❌ **rien aujourd'hui** |
| 7 | Ancienne appli sur schéma migré | stratégie additive | ✅ c'est la stratégie retenue |

## Ce que je ne peux pas affirmer

**Le PITR n'est pas vérifié.** Le plan Pro inclut des sauvegardes
quotidiennes ; le *point-in-time recovery* est une option payante distincte.
Je n'ai aucun outil pour lire son état sur ce projet, et je ne l'affirmerai
pas.

`wal_level = logical` et `archive_mode = on` sont relevés en base — mais ce
sont les réglages d'infrastructure de Supabase, **pas** une preuve que le
PITR est souscrit ici. Les confondre serait exactement le genre de raccourci
qui fait croire à un filet inexistant.

**La restauration d'une sauvegarde Supabase n'a pas été essayée**, et elle ne
peut pas l'être sans conséquence : elle restaure le projet *entier*, écrasant
tout ce qui a été écrit depuis. Sur une plateforme qui sert trois restaurants
en activité, ce n'est pas un geste d'essai.

**Le Storage : point à trancher.** Les sauvegardes automatiques de Supabase
n'ont historiquement jamais inclus les objets du Storage — seulement la base.
Je ne l'ai pas vérifié pour ce plan. En attendant, l'inventaire des 88 objets
et leurs empreintes sont sauvegardés ; `--fichiers` copie les 54 Mo d'octets.

## La vraie stratégie : additive

C'est elle qui rend le rollback simple, et c'est pour ça qu'elle est
choisie.

**Aucune migration de fusion ne supprime, ne renomme ni ne restreint quoi que
ce soit.** Elle ajoute des tables et des colonnes ; jamais un `drop`, jamais
un `rename`, jamais un `not null` sur une colonne existante.

La conséquence est décisive : **l'ancienne application continue de
fonctionner sur la base migrée.** Le rollback applicatif suffit — on
redéploie la version précédente, on ne touche pas au schéma. Les structures
nouvelles restent en place, inutilisées et sans effet.

Et pendant les 90 jours de la fenêtre de rollback, la base Fideliz reste
telle quelle : c'est Cartiz qui reçoit les données, pas Fideliz qui perd les
siennes.

Cela déplace la difficulté là où elle est traitable : **une migration
additive n'a pas besoin d'être défaite.** Les migrations inverses ciblées
(dimension 2) ne servent qu'aux rares cas où l'additif ne suffit pas — et
chacune s'écrit en même temps que son aller, jamais après.

## Le trou qui reste : les écritures pendant la fenêtre

Si la bascule s'accompagne d'écritures dans Cartiz — un ticket validé, une
partie jouée, un client inscrit — puis qu'on revient en arrière, **ces
écritures existent dans Cartiz et pas dans Fideliz.**

Aucun mécanisme ne les réconcilie aujourd'hui. C'est le vrai risque du
rollback, et il n'est ni technique ni automatisable : il faut décider quoi
faire de ces lignes. Trois options, à arbitrer avant le GO :

1. **Fenêtre fermée** — le jeu et le scanner sont suspendus pendant la
   bascule. Aucune écriture, aucune réconciliation. Le plus sûr, au prix
   d'une interruption.
2. **Fenêtre ouverte + rejeu** — les écritures de Cartiz sont rejouées dans
   Fideliz en cas de retour. Demande un outil de rejeu, et il faut l'écrire.
3. **Point de non-retour** — passé un certain délai, on ne revient plus. On
   corrige en avant.

**Ce choix est une décision métier, pas technique.** Il attend Samy.

## Deux jalons, à ne pas confondre

### Avant de créer la branche temporaire

- [x] Sauvegarde logique vérifiée de la production
- [x] Registre des migrations réconcilié avec Git
- [x] Aucune écriture involontaire en production
- [x] Tests, témoins QR, surface, préflight Auth — tous verts
- [x] Cible de rollback applicatif identifiée et `Ready`
- [x] Stratégie additive arrêtée

### Avant le GO de production

- [ ] Reconstruction sur base vierge **démontrée** (c'est le rôle de la branche)
- [ ] Rollback applicatif **chronométré** sur environnement isolé
- [ ] Migrations inverses écrites pour tout ce qui n'est pas additif
- [ ] Décision sur les écritures pendant la fenêtre
- [ ] Restauration Storage tranchée : incluse ou copiée à part
- [ ] État du PITR établi — souscrit ou non, et le plan qui en découle

**Ne pas transformer un test qui exige la branche en condition préalable à sa
création.** La reconstruction sur base vierge ne peut se prouver que sur une
base vierge ; c'est précisément à quoi la branche sert.

## La sauvegarde

```bash
npm run sauvegarde              # tables, Auth, inventaire Storage
npm run sauvegarde -- --fichiers  # + les 54 Mo d'octets
```

Elle relit et recompare chaque fichier après écriture. Une sauvegarde qu'on
n'a pas vérifiée n'est pas une sauvegarde — c'est une intention.

Sortie dans `sauvegardes/`, **ignoré par git** : ce sont les données réelles
de vrais clients. Les mots de passe chiffrés d'Auth ne sont pas exportés —
inutilisables hors de leur instance, et un fichier de plus à protéger à vie.

Dernière exécution : **2 980 lignes · 20 fichiers · 9 comptes · 88 objets
(54,4 Mo) · 0 écart.**
