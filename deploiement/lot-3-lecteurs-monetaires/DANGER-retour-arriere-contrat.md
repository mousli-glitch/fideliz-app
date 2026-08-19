# ⚠️ Pourquoi le rollback de l'étape 2 n'est pas dans ce paquet

`supabase/rollback/20260819060000_rollback.sql` existe, il est correct, et il
**ne doit pas être joué** une fois l'étape 3 appliquée.

## Ce qu'il fait

```sql
alter table public.winners drop column if exists min_spend_cents_snapshot;
alter table public.games   drop column if exists min_spend_cents;
```

Ces deux lignes sont irréversibles au sens qui compte : `DROP COLUMN` détruit
les valeurs, et aucune sauvegarde de schéma ne les rend.

## Ce que cela détruirait

À partir du `commit` de l'étape 3, chaque ticket émis porte
`min_spend_cents_snapshot` : **la condition d'achat telle qu'elle était au
moment du gain**. C'est ce qui empêche qu'une modification du jeu change
rétroactivement ce qu'on exige d'un client dont le ticket est déjà imprimé.

Supprimer la colonne, c'est effacer cette condition pour tous les tickets
émis depuis — et donc revenir à relire le jeu **courant**, y compris pour des
tickets dont le porteur a lu autre chose.

Le nombre de tickets concernés grandit à chaque gain. Une heure après
l'étape 3, l'opération est déjà destructrice.

## Ce qu'il faut faire à la place

Le rollback de l'étape 3 — `05-retour-arriere-lecteurs.sql` — suffit à annuler
le lot 3 :

- il remet `play_game` et `register_win` dans leur état d'avant ;
- il **laisse les colonnes en place** et les snapshots déjà écrits intacts ;
- les corps restaurés les ignorent, sans les effacer.

Les colonnes sont nullables et personne ne les lit après ce retour arrière :
elles ne coûtent rien, et elles gardent une information qu'on ne saurait pas
reconstruire.

## Si la suppression des colonnes devient malgré tout nécessaire

Ce n'est pas une opération de retour arrière, c'est une **suppression de
données**. Elle relève des mêmes règles que toute suppression :

1. décision explicite de Samy, écrite ;
2. sauvegarde préalable des deux colonnes (`id`, valeur) dans une table
   d'archive, vérifiée avant le `drop` ;
3. et pas dans le même geste que le retour arrière du lot.
