# L'état fantôme `consumed` — trace d'application

**Appliqué le 19 août 2026 en production.** Décision de Samy : **option P-a**
— `consumed` n'existe pas. Plus la validation de la borne monétaire.

---

## 1. Le défaut, mesuré

`winners.status` portait **deux contraintes CHECK, toutes deux validées** :

| Contrainte | Ce qu'elle autorisait |
|---|---|
| `check_winner_status` | `available`, `redeemed`, **`consumed`** |
| `winners_status_check` | `available`, `redeemed` |

PostgreSQL les applique ensemble : l'ensemble réellement écrivable était leur
**intersection**, `{available, redeemed}`. La première était entièrement
absorbée par la seconde — elle annonçait un état que l'autre interdisait.

En base : 129 `available`, 368 `redeemed`, 37 archives `redeemed`, **zéro
`consumed`** — et il ne pouvait pas y en avoir.

Ce n'était pas un défaut de données mais un **piège** : quelqu'un lit
`check_winner_status`, croit l'état légal, écrit du code, et prend un `23514`
en production. Quatre endroits le traitaient déjà comme réel.

Vérifié : la notion n'existe pas côté Cartiz. La fusion n'imposait rien.

## 2. Ce qui a été fait

| | |
|---|---|
| `check_winner_status` supprimée | le contrat est dit à **un seul endroit** |
| `winners_min_spend_cents_borne` validée | `NOT VALID` → validée ; 0 ligne la violait sur 497 |
| Branche `or w.status = 'consumed'` retirée de `archive_redeemed_winners` | `bd564337…` → `ff8c11cf…` |
| 3 branches mortes retirées du code | `winners-table.tsx` ×2, `winners/page.tsx` ×1 |

**La colonne `consumed_at` n'est PAS supprimée.** Supprimer une colonne est
destructif et n'a pas été décidé. Elle reste, vide — c'est une décision
distincte.

## 3. Deux découvertes en chemin

### La fonction de production n'était pas celle du dépôt

Empreinte brute production `bd564337…` (1375 car.), dépôt `0fca0c96…`
(1225 car.). L'écart faisait craindre un changement non tracé.

**Empreintes normalisées identiques** — `41efb2e1…`, 962 caractères hors
espaces. Même code, mise en forme différente. La garde de la migration porte
donc sur l'empreinte **normalisée** : elle accepte les deux formes et refuse
tout corps qui ferait autre chose. Après application, les deux environnements
convergent sur un corps unique. La dérive cosmétique est close.

### Le banc a attrapé une erreur que la production aurait subie

Premier essai : **`42P13, cannot remove parameter defaults`**. La fonction porte
`p_days integer DEFAULT 90, p_batch integer DEFAULT 5000` et mon
`create or replace` les omettait. Transaction annulée, rien n'a bougé.

Enseignement conservé dans la migration : le manifeste habituel s'appuie sur
`pg_get_function_identity_arguments`, qui **masque les défauts**. PostgreSQL
refuse qu'on les retire, mais rien n'empêche d'en *ajouter* un — et une
signature qui gagne un défaut change son contrat en silence. La vérification
assure désormais `pg_get_function_arguments`, qui les montre.

Vérifié : `play_game` et `register_win`, remplacées au lot 3, ont bien conservé
les leurs.

## 4. Les preuves

**Banc, 12/12** — état, contraintes, et une **polarité négative** qui compte :
sans `winners_status_check`, `consumed` redevient écrivable. La garde protège
donc d'un danger réel, pas théorique.

**Harnais des tâches planifiées, 30/30** sur les cinq blocs, dont le bloc 4
entièrement réécrit.

**Production** : relue dans un appel séparé — permissive absente, stricte
validée, borne validée, fonction `ff8c11cf…` avec ses défauts intacts, aucune
trace de `consumed` dans le corps, 497 gagnants et 37 archives inchangés,
statuts identiques.

## 5. Ce que le harnais disait de faux, et que j'ai corrigé

Deux défauts dans le harnais **versionné**, tous deux de mon fait :

1. **Le bloc 4 figeait le défaut de l'archive comme présent.** Il affirmait
   qu'un ticket archivé de 30 mois gardait prénom et e-mail après
   anonymisation. C'était vrai le matin, faux depuis la migration
   `20260819110000`. Les six contrôles que j'avais annoncés « joués et verts »
   avaient été exécutés à la volée sur le banc mais **jamais versés dans le
   fichier** — le commit `1ee45ff` ne touche pas le harnais. Une preuve qui ne
   finit pas dans le dépôt n'est pas une preuve : c'est un souvenir.

2. **La constante anti-dérive de `anonymize_expired_data` était périmée.** Elle
   valait encore `b9db1128…` alors que la fonction vaut `b89f0d08…` depuis le
   matin. Le harnais aurait **refusé de tourner** à sa prochaine exécution, sur
   une fausse alerte.

Règle ajoutée en tête du fichier : toute migration qui touche l'une de ces deux
fonctions met à jour sa constante **dans le même commit**.

## 6. Un défaut latent noté au passage, non corrigé

`games.status` a pour valeur par défaut `draft`, que sa propre contrainte
`games_status_check` **refuse**. Conséquence : aucune ligne ne peut être
insérée dans `games` sans préciser explicitement le statut. Le code applicatif
le fait toujours, donc c'est inoffensif aujourd'hui.

Ce n'est pas dans le périmètre de P-a — signalé, pas touché.

## 7. Retour arrière

`supabase/rollback/20260819130000_rollback.sql`, borné par empreinte
normalisée dans les deux sens.

⚠️ Il ne répare rien : il réintroduit le piège des deux contraintes
contradictoires et la branche morte. Il existe parce qu'une migration sans
retour arrière est une migration qu'on n'a pas fini d'écrire.

Un point à connaître : PostgreSQL ne sait pas « dé-valider » une contrainte. Le
retour arrière la **supprime et la recrée** en `NOT VALID`, dans la même
transaction, et vérifie qu'elle est bien revenue — sans quoi la colonne se
retrouverait sans borne du tout.
