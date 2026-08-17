# RLS Fideliz — ce que les 51 policies disent vraiment

Relevé le **18/08/2026** pendant l'extraction de la baseline. Rien n'est
corrigé ici : la baseline doit être fidèle, et ces correctifs sont des
migrations à part.

Rappel de mécanique, parce qu'il décide de tout ce qui suit : **les policies
permissives d'une même table se combinent par OU.** La plus large gagne
toujours. Empiler des policies ne restreint pas — ça ouvre.

## Quatre trous réels

### 1. N'importe quel compte connecté peut créer un restaurant

```sql
create policy "Sales can create restaurants" on public.restaurants
  for insert to authenticated with check (true);
```

`with check (true)`. Le nom dit « Sales » ; la règle ne vérifie **aucun rôle**.
Les sept comptes restaurateurs peuvent insérer des restaurants.

La policy voisine, `"Enable insert for root users only"`, vérifie bien le rôle
root — mais comme les permissives s'additionnent, elle ne restreint rien.

### 2. Tous les profils sont lisibles par tout compte connecté

```sql
create policy temp_open_profiles       … for select to authenticated using (true);
create policy global_nav_profiles      … for select to authenticated using (true);
create policy final_profile_access_v3  … for select to authenticated using (true);
```

**Trois** policies identiques, chacune suffisant à elle seule. Un restaurateur
lit l'adresse e-mail, le rôle et le rattachement de tous les comptes, root
compris. Le préfixe `temp_` de la première suggère un dépannage devenu
permanent.

### 3. Une policy qui dit l'inverse de son intention

```sql
create policy root_read_all_profiles on public.profiles
  for select to authenticated using ((role = 'root'::text));
```

Elle se lit « si la LIGNE a le rôle root », pas « si JE suis root ». Elle
expose donc la ligne du root à tout le monde, au lieu de donner au root
l'accès à tout. Sans effet ici — le point 2 ouvre déjà tout — mais l'intention
et le code se contredisent.

### 4. Deux policies pointent un restaurant qui n'existe pas

```sql
… using ((restaurant_id = '9ca36072-90dc-4390-b610-b0e9670fd363'::uuid) OR …)
```

Sur `contacts` et sur `games`. Cet UUID ne correspond à **aucun** des quatre
restaurants de la base. Vestige d'un restaurant supprimé : la branche est
morte, mais elle donne l'illusion d'un contrôle de périmètre là où il n'y en
a pas.

## Trois fragilités

**L'UUID du root en dur, dans quatre policies** — `ADMIN_GAMES_FULL_ACCESS`,
`Super Admin Restaurants Access`, `Root Full Access`, et une autre. Changer de
compte root demanderait de réécrire des policies. `is_root()` existe pourtant
et fait le travail proprement.

**Des rôles qui n'existent pas.** `winners_update_by_restaurant_team_v3`
autorise `admin`, `owner`, `staff` — or `profiles_role_check` n'accepte que
`root`, `sales`, `restaurant`. Trois quarts de la condition sont morts.

**Onze policies sur `games`, huit sur `restaurants`, sept sur `profiles`.**
Des générations successives empilées sans que les précédentes soient
retirées. Personne ne peut dire de tête ce qui est autorisé.

## Ce que ça change, et ce que ça ne change pas

**Ça ne touche pas le public.** Un visiteur non connecté ne bénéficie
d'aucune de ces policies, et l'inscription publique est fermée depuis le
18/08 : on n'obtient pas de session `authenticated` sans qu'un root ait créé
le compte.

**Ça touche les neuf comptes existants.** Sept restaurateurs peuvent lire
tous les profils et créer des restaurants. Ce ne sont pas des inconnus — ce
sont de vrais clients — mais ce n'est pas ce que le produit prétend faire.

**Ça ne touche pas les chemins applicatifs**, qui passent presque tous par la
clé de service et contournent la RLS de toute façon. Les gardes internes
posées les 17 et 18/08 sont ce qui protège réellement ces chemins. La RLS est
la deuxième couche, et c'est elle qui est percée.

## Ce qu'il faut en faire

Pas un correctif à la va-vite. Les policies s'additionnent : en supprimer une
au hasard peut fermer un parcours légitime, et en ajouter une n'en ferme
aucune.

La bonne séquence, sur la branche temporaire :

1. Pour chaque table, établir qui doit lire et écrire quoi — la matrice, pas
   les policies.
2. Écrire un jeu neuf, minimal, avec les six comptes de test.
3. Prouver chaque cas, positif et négatif, avant de retirer l'ancien.
4. Retirer l'ancien d'un bloc, dans la même migration.

**Ce n'est pas un NO-GO pour créer la branche** — c'en est précisément
l'usage. C'en est un pour la production tant que le jeu neuf n'est pas
prouvé.
