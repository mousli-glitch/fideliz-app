# Reprise après sinistre Cartiz — ce que la vérification a trouvé

**19 août 2026.** La procédure `cartiz/docs/08-reprise-apres-sinistre.md` date
du 13/08 et se terminait par : *« Si 250 000 cartes disparaissaient demain,
nous ne savons pas répondre. »* Elle demandait un exercice. Le banc créé
aujourd'hui a permis d'en jouer une partie.

---

## Ses chiffres tiennent, six jours après

| | 13/08 | 19/08 |
|---|---|---|
| Base | 200 Mo | **202 Mo** |
| `archive_mode` / `wal_level` | on / logical | **inchangés** |
| Storage `flyer-pages` | 30 fichiers, 130 Mo | **30, 130 Mo** |
| Storage `menu-photos` | 14 fichiers, 3 Mo | 16, 3,2 Mo |

**L'angle mort n'a pas bougé** : 130 Mo de cartes en images, protégés par rien
de vérifié. Les deux buckets sont **publics**.

Et le contrôle que la procédure demandait elle-même — *« vérifier
`schema_migrations` contre `supabase/migrations/` »* — a été fait : **91
enregistrées contre 83 fichiers**, avec deux conventions de nommage
incompatibles. Le dépôt raconte, le registre exécute.

## ⚠️ Ce que le banc a trouvé, et qui change le verdict

L'étape 3 de la procédure dit : *restaurer, puis rejouer les batteries
d'invariants*. J'ai voulu l'éprouver sur un schéma reconstruit **uniquement
depuis l'historique**.

**Ça s'arrête avant la première assertion.**

### 1. Aucune ligne métier sans identité

`restaurants.created_by` est `NOT NULL` vers `auth.users`. Un schéma
reconstruit depuis l'historique n'a **aucun compte** — les comptes ne sont pas
dans les migrations. Il faut donc créer une identité avant de pouvoir créer
quoi que ce soit.

### 2. Et même avec une identité, la création échoue

```
23514 : automatisations_scenario_check
        Failing row contains (…, vip_obtenu, …)
```

Créer un restaurant déclenche `creer_automatisations()`, qui insère onze
scénarios. Deux d'entre eux — `vip_obtenu` et `recompense_qui_dort` — sont
**refusés par la contrainte** sur le schéma reconstruit.

### 3. La cause : une contrainte sur trente-huit

| | Production | Banc |
|---|---|---|
| Contraintes CHECK | 38 | **38** |
| Identiques | — | **37** |
| **Différente** | `automatisations_scenario_check` — **12 valeurs** | **10 valeurs** |

La migration `079_vip_obtenu_et_recompense_qui_dort` a élargi la contrainte en
production. Son entrée au registre ne le fait pas. Le déclencheur, lui, a bien
été mis à jour — d'où la contradiction.

## Je dois corriger ce que j'ai écrit il y a une heure

J'ai annoncé une **« parité parfaite »** après avoir comparé les comptes de
tables, de fonctions et de policies, plus l'empreinte de huit corps de
fonctions. Tout cela était vrai. **Ça ne prouvait pas la parité.**

Les contraintes CHECK sont **38 des deux côtés** — le compte concordait
pendant que le contenu divergeait. C'est exactement le piège que la procédure
elle-même nomme dans ses bonnes pratiques, et que je répète depuis ce matin :
**compter n'est pas prouver.**

La formulation juste : *l'historique rejoue de bout en bout, et produit un
schéma qui diffère de la production d'une contrainte sur trente-huit.*

## Ce que ça dit de la reprise après sinistre

| Sinistre | Avant aujourd'hui | Maintenant |
|---|---|---|
| Perte du projet | « à prouver » | l'historique **rejoue** — mais donne un schéma où **on ne peut pas créer de restaurant** |
| Suppression de fichiers | « rien de vérifié » | **inchangé** — 130 Mo sans filet vérifié |
| Corruption logique | PITR « statut inconnu » | inchangé — non vérifiable depuis le dépôt |
| Suppression de lignes | « à prouver » | inchangé |

**Le verdict de la procédure reste valide**, et il est maintenant plus précis :
on sait rebâtir le schéma, on ne sait toujours pas ramener les fichiers, et le
schéma rebâti a un défaut qui bloque la création d'un restaurant.

## ✅ La contrainte est élargie, et l'exercice passe

**Tranché par Samy : « élargis la contrainte dans le registre ».**

### La cause exacte, trouvée avant d'écrire

Le fichier `079_vip_obtenu_et_recompense_qui_dort.sql` du dépôt **élargit bien
la contrainte**, à ses lignes 18-22. C'est son entrée au registre qui n'en
porte que la moitié — elle s'appelle `..._fonctions`.

La migration a donc été appliquée **en deux temps, et une seule moitié a été
enregistrée**. Le déclencheur savait insérer `vip_obtenu` ; la contrainte
enregistrée l'ignorait.

### Le correctif

Une entrée `20260815154315`,
`vip_obtenu_et_recompense_qui_dort_contrainte`, posée **juste après** celle
qu'elle complète — pour que l'histoire se lise dans l'ordre. Sa définition est
**engendrée depuis la production**, donc incapable de diverger. Empreintes des
contraintes et des fonctions comparées avant/après : **inchangées**.

### L'exercice, joué sur un banc reconstruit depuis l'historique seul

| | Verdict |
|---|---|
| Empreinte des **contraintes** | **identique à la production** |
| Empreinte des **index** | **identique** |
| Empreinte des **triggers** | **identique** |
| Création d'un restaurant | **réussie** — 11 automatisations et 1 réglage posés par déclencheur |
| Batterie `transitions` (invariant I-4) | **toutes les assertions vertes** |
| Nettoyage | banc rendu vierge, 0 restaurant, 0 compte |

**C'est l'étape 3 de la procédure, jouée pour la première fois.** Elle
fonctionne — sur le schéma. Pas sur les données.

## Ce qui reste à faire

1. **Comparer ce qui ne l'a pas été** : valeurs par défaut, droits de colonne,
   séquences. Contraintes, index, triggers et huit corps de fonctions l'ont été
   **par le contenu** ; le reste ne l'est pas.
2. **Le Storage** — toujours le point le plus exposé, et toujours sans
   procédure. **C'est désormais le seul angle mort majeur.**
3. **Un exercice complet** avec `Restore to new project`, qui seul apporte les
   données. Le banc n'apporte que le schéma — mais il l'apporte juste.

## Ce que je n'ai pas vérifié

Les sauvegardes quotidiennes, le PITR et l'existence d'une sauvegarde du
Storage : aucune requête SQL ne les atteint, et je n'ai pas accès au tableau de
bord. Les trois questions de la procédure restent adressées à Samy.
