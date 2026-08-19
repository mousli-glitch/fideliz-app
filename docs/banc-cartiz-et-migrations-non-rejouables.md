# Le banc Cartiz, et ce qu'il a révélé en naissant

**19 août 2026.** Demandé par Samy après trois migrations appliquées sans
répétition possible.

---

## Le banc existe

| | |
|---|---|
| Type | branche Supabase de `cartiz`, nommée `banc-cartiz` |
| Coût | **0,01344 $/heure**, ~0,32 $/jour tant qu'elle vit |
| Données | **aucune** — `with_data: false`, 0 restaurant, 0 client, 0 compte Auth |

C'est ce qu'on veut d'un banc : le schéma, jamais les personnes.

## Et il est **inutilisable en l'état**

Statut rendu par la plateforme : **`MIGRATIONS_FAILED`**.

Le rejeu s'arrête à **41 migrations sur 88**, à `20260808112500
plus_de_plage_de_silence` — la 42ᵉ.

**L'historique de migrations de Cartiz ne sait pas reconstruire son propre
schéma.** Ce n'est pas une opinion : c'est le verdict de la plateforme, et
j'ai reproduit l'erreur à la main.

## Pourquoi — et c'est instructif

`042` ne **déclare** pas ses fonctions. Elle les **dérive** de celles qui
tournent :

```sql
select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'candidats_push';
v_def := replace(v_def, $old$…texte attendu…$old$, $new$…$new$);
if v_def = v_avant then raise exception '…n''ont pas été trouvées…'; end if;
execute v_def;
```

Rejouée sur une base neuve, la définition vivante fait **7973 caractères** et
ne contient pas le texte attendu. La garde a fait son travail : elle a refusé
de transformer à moitié, et la migration a échoué proprement.

C'est correct — et fatal à la reproductibilité. `pg_get_functiondef` **re-rend**
la fonction depuis l'arbre syntaxique ; son formatage n'est pas garanti stable
d'une chaîne d'applications à l'autre.

### Cinq migrations Cartiz suivent ce motif

`031`, `037`, **`042`**, `044`, `074`. Trois d'entre elles substituent
réellement du texte (`037` ×3, `042` ×5, `044` ×1).

## ⚠️ Et une des miennes aussi

`20260819080000_isolation_lot_jeu.sql` — le hotfix P0 appliqué ce matin en
production Fideliz — fait la **même chose** à sa ligne 191 :

```sql
v_new := replace(replace(v_def, c_lot_avant, c_lot_apres), c_stock_avant, c_stock_apres);
```

J'ai affirmé le contraire quelques minutes plus tôt dans cette séance. C'était
faux, et le grep l'a montré.

**Une différence réelle demeure**, et elle n'excuse rien mais elle compte : ma
garde porte sur l'empreinte SHA-256 de `prosrc` — le corps **tel que stocké** —
et non sur du texte cherché dans une définition re-rendue. `prosrc` est stable ;
`pg_get_functiondef` ne l'est pas. Le fichier le dit d'ailleurs lui-même à sa
ligne 59.

Il est donc **plausiblement** rejouable là où `042` ne l'est pas. Plausiblement
n'est pas prouvé — et cette fois, le banc existe pour le prouver :
`fusion-tests-2` porte le schéma Fideliz.

**À faire :** rejouer `20260819080000` sur `fusion-tests-2` depuis la baseline,
et savoir.

## Ce que ça met en cause au-delà du banc

`docs/08-reprise-apres-sinistre.md` existe côté Cartiz. Si sa procédure repose
sur le rejeu des migrations, **elle ne fonctionne pas**. Ce document n'a pas été
relu sous cet angle — c'est un trou nommé, pas mesuré.

## Le correctif appliqué — chemin A

**Tranché par Samy : « rends l'historique rejouable ».** Appliqué au registre de
production le 19/08/2026, dans une transaction bornée.

### Le registre a corrigé ma carte

Je travaillais depuis le dépôt. **Le dépôt n'est pas ce qui tourne.** Le
registre a montré cinq entrées dérivantes, dont **deux que le dépôt ne
montrait pas** — `brancher_paliers_sur_caisse` et
`brancher_paliers_sur_ajustement_v2` — et **une que je croyais dérivante et qui
ne l'est pas** (`silence_22h_9h`, 592 caractères).

C'est une garde qui l'a dit, pas moi : la transaction a refusé de s'exécuter
sur « 2 des 3 contiennent une dérivation ». Elle m'a empêché de réécrire la
mauvaise entrée.

### Ce qui a été fait

| | |
|---|---|
| **5 entrées neutralisées** | `20260808112500`, `20260808124721`, `20260809145249`, `20260809145349`, `20260812193556` — remplacées par un `select` qui dit pourquoi et renvoie à la canonique |
| **1 entrée canonique** | `20260819190000`, **engendrée depuis la production elle-même** : 23 instructions déclarant 8 fonctions avec leurs droits |
| **Catalogue** | fonctions, tables et policies empreintées avant/après — **identiques**. On n'a réécrit qu'un journal. |

Sur-déclarer les 8 plutôt que les 5 strictement nécessaires est délibéré : la
canonique clôt la chaîne, donc ce qu'elle déclare devient l'état final — par
construction celui de la production.

### Une garde qui a trébuché sur ma prose

Premier essai annulé : mon message explicatif contenait le mot
`pg_get_functiondef`, et le contrôle « plus aucune dérivation » l'a donc vu
subsister. Reformulé. Rien n'avait été écrit.

### Prouvé par le rejeu — parité parfaite

`081` et `082` ont ensuite été enregistrées, avec un garde-fou nécessaire :
la planification `pg_cron` de `082` est devenue **conditionnelle**, `pg_cron`
étant absente des branches. La fonction, elle, est posée partout — c'est elle
qu'on veut éprouver.

Banc reconstruit **entièrement depuis l'historique**, comparé à la production :

| | Production | Banc |
|---|---|---|
| migrations rejouées | 91 | **91** |
| tables | 29 | **29** |
| fonctions | 40 | **40** |
| policies | 50 | **50** |
| `habilitations` | oui | **oui** |
| `anonymiser_donnees_expirees` | oui | **oui** |
| **empreinte des 8 fonctions** | `2ffa7364…` | **`2ffa7364…`** |
| données | réelles | **0 restaurant, 0 compte** |

Les huit fonctions que la canonique déclare sont **identiques au bit près**.
L'historique reconstruit le schéma de production, sans les personnes.

### Un comportement de plateforme, mesuré deux fois

**`reset_branch` ne relit pas le registre du parent** : il rejoue depuis
l'instantané pris à la création. Deux réinitialisations sont restées bloquées
au même endroit alors que le registre était déjà corrigé. Seule une **création
fraîche** lit le registre tel qu'il est.

C'est à savoir avant de conclure qu'un correctif de registre n'a pas marché.

### Le banc est à la demande, pas permanent

**Supprimé le 19/08/2026 après usage**, sur décision de Samy. Il ne coûte donc
plus rien, et il n'y a rien à y perdre : les preuves vivent dans ces documents,
le banc ne portait aucune donnée.

**Le recréer est une seule opération**, et depuis les correctifs d'aujourd'hui
elle donne un banc **fidèle** — ce qui n'était pas vrai ce matin :

```
create_branch(project_id: rxdbotnuwfakukcbgeqo, name: 'banc-cartiz')
```

⚠️ **Toujours créer, jamais réinitialiser.** `reset_branch` rejoue depuis
l'instantané pris à la création et **ne relit pas le registre du parent** —
mesuré deux fois, à une heure d'intervalle, sur deux branches différentes. Un
correctif de registre qu'on croit inopérant est peut-être simplement invisible
à un `reset`.

| | |
|---|---|
| Coût | 0,01344 $/h — ~0,32 $/jour tant qu'il vit |
| Contenu | schéma complet, **aucune donnée** |
| Temps de construction | ~2 minutes pour 92 migrations |

⚠️ `pg_cron` n'y est pas. Les tâches planifiées ne s'y éprouvent pas — c'est la
même limite que `fusion-tests-2` côté Fideliz, et le harnais des tâches le
documente déjà.

## Trois chemins, à trancher

| | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **A — rendre l'historique rejouable** | remplacer les entrées de registre des 5 migrations par leur **résultat** (le corps complet des fonctions, tel qu'il est aujourd'hui en production) | 5 réécritures de registre en production ; l'historique redevient une vérité |
| **B — un banc par copie de schéma** | extraire le schéma de production et le poser sur un projet neuf | contourne le problème sans le régler ; le sinistre reste ingérable |
| **C — laisser** | rien | la prochaine migration Cartiz partira encore sans répétition |

**Je recommande A**, et pas seulement pour le banc : un historique qui ne
rejoue pas n'est pas un historique, c'est un journal. La reprise après sinistre
en dépend plus que la fusion.

## Décisions immédiates

- **Garder ou supprimer `banc-cartiz` ?** Elle coûte 0,32 $/jour et, en l'état,
  ne sert qu'à porter la preuve. Je la garde tant que tu n'en dis rien.
- **Le registre de production ignore `081` et `082`** : je les ai appliquées par
  `execute_sql`, qui n'enregistre pas. À corriger avec le chemin A — les y
  inscrire rend le registre vrai, ce n'est pas le falsifier.
