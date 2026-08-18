# Diff sémantique — baseline + 8 contre la production

Mesuré le **18/08/2026**. Production `kzeuplszcqjqaqohfbzk` contre branche
`bngtokpnuebvvxbtnayn`, reconstruite depuis une base **réellement vierge** par
le vrai runner (`supabase db push --include-all`), sans le gel.

Rejouable : `supabase/verifications/empreintes.sql`, à exécuter tel quel sur
les deux bases.

## Résultat

| Dimension | Objets | Production | Branche | |
|---|---|---|---|---|
| colonnes | 214 | `8a1ce810` | `8a1ce810` | ✅ |
| contraintes | 38 | `ba3582f9` | `ba3582f9` | ✅ |
| fonctions | 22 | `912a071a` | `912a071a` | ✅ |
| index | 45 | `e56eac9c` | `e56eac9c` | ✅ |
| policies | 43 | `5b6dd5bc` | `5b6dd5bc` | ✅ |
| rls | 16 | `80c6b750` | `80c6b750` | ✅ |
| triggers | 6 | `eed0d031` | `eed0d031` | ✅ |
| vues | 4 | `4854f9fc` | `4854f9fc` | ✅ |
| acl_relations | 78 | `e16eae01` | `e16eae01` | ✅ |
| acl_fonctions | 22 | `1f70b6b8` | `1f70b6b8` | ✅ |
| default_privileges | 6 / 3 | `78d36312` | `152d89c8` | ⚠️ |

**Dix dimensions sur onze, identiques.** La onzième est expliquée plus bas et
n'a d'effet sur aucun objet.

La qualification passe donc de « ACL et privilèges par défaut historiques
exacts » à **schéma historique exact sur dix dimensions mesurées**. Ce qui
n'est pas dans le tableau n'est pas prouvé : ni les données, ni les comptes
Auth, ni les objets du Storage, ni les tâches `cron`.

## Les quatre écarts trouvés, et leur cause

### Le trigger absent — le seul qui pouvait faire mal

`on_auth_user_created` sur `auth.users` manquait à la baseline. Une base
reconstruite sans lui paraît saine et **ne crée aucun profil au premier
compte** : ni rôle, ni restaurant, ni accès, pour personne.

Il est resté invisible parce que mon empreinte des triggers ne regardait que
le schéma `public`. Les cinq de `public` concordaient, et j'en ai conclu
« triggers identiques ». L'erreur portait sur le périmètre de la mesure, pas
sur son résultat — et une mesure dont personne ne peut relire le périmètre
n'est pas une preuve. D'où `empreintes.sql`, versionné.

Même faute corrigée sur les ACL des relations : elles ne regardaient que
`anon`, `authenticated` et `service_role`, et auraient laissé passer une
différence sur `postgres`. Le périmètre élargi compte 78 lignes au lieu de 58,
et concorde.

### Un nom de contrainte — deux dimensions pour le prix d'une

La clé primaire de `activity_logs_legacy` s'appelle `activity_logs_pkey`,
sans le suffixe : la table a été renommée en production, et renommer une table
ne renomme pas ses contraintes. Sans nom explicite, PostgreSQL la déduit du
nom courant — et l'index qui la porte suit. Ce seul détail faisait diverger
**contraintes ET index**.

### Huit corps de fonction — cosmétiques, et corrigés quand même

`_log_event`, les deux `check_restaurant_status`, `current_role`,
`fn_audit_restaurant_changes`, `handle_deleted_commercial`,
`trg_log_profile_active`, `trg_log_restaurant_block`.

`prosecdef`, `provolatile` et `proconfig` étaient identiques des deux côtés :
seul le corps différait, par la casse des mots-clés et des commentaires perdus
à la transcription. **Fonctionnellement équivalentes.**

Corrigées malgré tout, car « crois-moi, c'est cosmétique » n'est pas
vérifiable, alors qu'une empreinte l'est. Le texte exact de la production a
été réinjecté par programme, jamais retapé.

Le remplacement automatique s'est mal ancré sur `current_role`, écrite sur une
seule ligne : il a touché le corps de la fonction suivante, réparé par hasard
à l'itération d'après. **C'est l'empreinte qui l'a détecté**, pas une
relecture. Corrigé à la main, puis rejoué de zéro.

### Les policies Storage — la baseline ne se rejouait pas

Les huit `create policy` sur `storage.objects` n'avaient pas leur
`drop policy if exists`. Les objets de `storage` survivent à un nettoyage de
`public`, donc le second passage s'arrêtait sur un `42710`.

Une baseline qui ne passe qu'une fois n'est pas une baseline, c'est un script
d'installation. Constaté en la rejouant, pas en la relisant.

## L'écart qui restera

La production porte **six** entrées de privilèges par défaut : trois pour
`postgres`, trois pour `supabase_admin`. Un rejeu n'en produit que trois.

- Les trois de `supabase_admin` sont **hors d'atteinte** : `postgres` n'est pas
  membre de ce rôle, donc `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`
  échouerait. Elles sont par ailleurs **inertes** — zéro relation et zéro
  fonction de `public` ne lui appartiennent, et les migrations s'exécutent en
  tant que `postgres`.
- `postgres` porte en production une entrée explicite pour lui-même
  (`postgres=arwdDxtm/postgres`) que le rejeu ne recrée pas. Sans effet : il
  est propriétaire des objets et détient tout à ce titre.

**Preuve que l'écart ne porte à conséquence sur rien** : l'ACL effectif des
20 relations, tous rôles confondus, `postgres` inclus, donne la même empreinte
des deux côtés — `e16eae01`, 78 lignes. Les défauts diffèrent ; ce qu'ils ont
produit, non.

C'est un écart connu, mesuré et borné, pas un écart ignoré.

## Ce qui reste à mesurer

- Données, comptes Auth, objets du Storage — hors périmètre d'une baseline.
- Tâches `cron` : `pg_cron` est absent de la branche (6 extensions contre 7),
  donc les quatre doublons de production ne sont pas reproductibles ici.
- Le gel de bascule, tenu à l'écart de ce rejeu, doit être mesuré seul : son
  delta attendu est connu à l'avance et doit l'être exactement.
