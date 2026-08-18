# Rollback RLS — joué pour de vrai, pas décrit

Exécuté le **18/08/2026** sur la branche `bngtokpnuebvvxbtnayn`.
**Production non touchée.**

## Le cycle complet

| Étape | Empreinte des policies | Policies | UUID root | `profiles` | `crm_notes` |
|---|---|---|---|---|---|
| État corrigé | `124e7014…` | 41 | 0 | 3 | 2 |
| **Après rollback** | `5b6dd5bc…` | 43 | 3 | 7 | 1 |
| **Après réapplication** | `124e7014…` | 41 | 0 | 3 | 2 |

`5b6dd5bc9df9ce6068c148a3f5288c05` est **l'empreinte exacte de la
production** — celle relevée lors du diff sémantique. Le rollback ne ramène
donc pas « un état ressemblant » : il ramène l'état historique au caractère
près, sur les 43 policies des 11 tables.

Et la réapplication retombe sur `124e7014…`, l'empreinte d'avant le rollback.
Les deux sens sont rejouables.

## Un défaut trouvé en le jouant, et qui ne se voyait pas

Au premier passage, **dix tables sur onze** concordaient avec la production.
La onzième, `crm_notes`, portait le bon nombre de policies mais pas le bon
texte.

La cause : la policy d'origine porte un `with check` **explicite**. Mon
rollback la recréait avec le seul `using`. Un `for all` sans `with check`
réutilise le `using`, donc le comportement était identique — mais
`pg_policies.with_check` valait `NULL` au lieu de l'expression, et l'empreinte
ne retombait pas.

Fonctionnellement invisible. Suffisant pour ruiner la preuve. **Un rollback
relu ne l'aurait jamais montré.** Corrigé dans la section de retour arrière de
`20260818011000`.

## La preuve que le rollback restaure vraiment

Un rollback qui ne casse rien peut n'avoir rien fait. Mesuré à l'état
restauré, la fuite est **intégralement revenue** :

| Rôle | Profils vus | Crée un restaurant | Notes CRM | `system_logs` |
|---|---|---|---|---|
| A | **5** | **oui** | 0 | 0 |
| commercial | **5** | **oui** | **4** | 0 |
| sans rattachement | **5** | **oui** | 0 | 0 |
| root synthétique | 5 | oui | 4 | **0** ⟵ perd l'admin |

Le root synthétique reperd son accès à `system_logs` : la policy à UUID est
revenue, et il n'est pas cette personne-là. C'est le signe le plus net que le
rollback a mordu.

Après réapplication :

| Rôle | Profils | Crée un resto | Notes | `system_logs` | Restos |
|---|---|---|---|---|---|
| A | 1 | **DENY** | 0 | 0 | 1 |
| B | 1 | **DENY** | 0 | 0 | 1 |
| commercial | 1 | **DENY** | **2** | 0 | 1 |
| sans rattachement | 1 | **DENY** | 0 | 0 | **0** |
| root synthétique | 5 | oui | 4 | **23** | 2 |

## L'ordre, qui n'est pas une préférence

`current_role()` doit être traitée **en dernier au rollback** et **en premier
à la réapplication**.

À l'aller, retirer les policies larges avant de passer la fonction en
`SECURITY DEFINER` rouvre la récursion qu'elles masquaient : toute lecture de
`profiles` rend `54001`. Au retour, l'inverse. C'est écrit dans les deux sens
parce que se tromper d'ordre ne produit pas une erreur à l'application — ça
produit une base où plus personne ne lit son profil.

## Données

Aucune donnée modifiée : chaque sonde annule son sous-bloc. Compteurs
identiques avant et après le cycle complet — 2 restaurants, 5 profils,
4 notes, 0 ligne intruse.

---

# Qualification : rollback de CONTINUITÉ, pas de sécurité

Le cycle ci-dessus prouve une chose et une seule : le rollback ramène l'état
historique **au caractère près**. Il ne prouve pas que cet état soit
souhaitable — et il ne l'est pas.

## Ce que le rollback restaure, littéralement

Mesuré à l'état restauré, pas déduit :

| Ce qui revient | Mesure |
|---|---|
| Lecture de tous les profils par tout compte connecté | 4 rôles sur 4 voient les **5** profils |
| Création de restaurants par des rôles non autorisés | 4 rôles sur 4 réussissent |
| Accès transversal du commercial à `crm_notes` | **4** notes, dont celles d'un tenant non rattaché |
| Dépendance des policies à l'UUID root | **3** policies |
| Perte d'accès du root synthétique | `system_logs` : **0** ligne |

La dernière ligne mérite d'être lue deux fois : après rollback,
l'administration ne fonctionne plus que pour **une personne précise**. Un
second root, ou un root de secours, n'aurait aucun accès.

## Comment l'employer, et comment ne pas l'employer

**C'est un rollback de continuité.** Il sert à rendre le service quand la
migration coupe un parcours essentiel — pas à revenir à un état sûr.

- Employable **uniquement en urgence**, si un parcours légitime est cassé.
- La durée passée dans cet état est à **réduire au minimum** : chaque heure
  est une heure où tout compte connecté lit tous les profils.
- **La correction en avant est préférable** dès qu'elle est possible. Les
  défauts probables sont tous réparables par une policy ajoutée, ce qui prend
  moins de temps que le cycle rollback + analyse + réapplication.
- Il n'est **jamais** un état de repos. Si on y revient, on en repart.

## Correction en avant — les cinq pannes probables

Ordre de probabilité décroissante, d'après ce que la matrice et la traversée
ont réellement montré.

### 1. Un rôle légitime refusé sur une table

*Symptôme* : une liste vide là où elle était pleine ; aucune erreur.

*Cause probable* : une policy `SELECT` retirée sans équivalent, ou un
prédicat plus étroit que le besoin réel.

```sql
-- Diagnostic : ce que le rôle voit vraiment, sans deviner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
select count(*) from public.<table>;
reset role;
select policyname, cmd, qual from pg_policies
 where schemaname='public' and tablename='<table>';
```

*Correction* : ajouter la policy manquante, ciblée sur le rattachement. Ne
jamais élargir avec `using (true)` « en attendant » — c'est exactement
l'origine de la fuite qu'on vient de fermer.

### 2. `current_role()` en récursion — `54001`

*Symptôme* : `stack depth limit exceeded` sur toute lecture de `profiles`.

*Cause* : la fonction est repassée en `SECURITY INVOKER`, ou une nouvelle
policy sur `profiles` l'appelle alors qu'elle lit `profiles`.

*Correction immédiate*, sans rollback :

```sql
create or replace function public."current_role"()
returns text language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon'); $$;
grant execute on function public."current_role"() to anon, authenticated, service_role;
```

⚠ `anon` doit conserver `EXECUTE` : deux policies visant `{public}` passent
par `is_root()` / `is_sales()`, qui l'appellent en cascade.

### 3. Rattachement commercial incomplet

*Symptôme* : un commercial ne voit plus « ses » restaurants ou ses notes.

*Cause* : `sales_restaurants` est **vide en production** (0 ligne, mesuré).
Les policies qui s'y adossent ne rendent donc rien.

*Correction* : peupler `sales_restaurants`, pas élargir la policy. C'est une
donnée manquante, pas une règle trop stricte — et c'est une **décision
métier** : quel commercial pour quel restaurant. À arbitrer, jamais à deviner.

### 4. Un dashboard cassé par la garde par slug

*Symptôme* : « Ce restaurant n'est pas accessible avec ce compte » pour un
restaurateur légitime.

*Cause probable* : `profiles.restaurant_id` absent ou faux pour ce compte.

```sql
select p.id, p.role, p.restaurant_id, r.slug
from public.profiles p left join public.restaurants r on r.id = p.restaurant_id
where p.id = '<uuid>';
```

*Correction* : réparer le rattachement du profil. La garde a raison — c'est
la donnée qui est fausse.

### 5. Root sans accès administratif

*Symptôme* : root ne voit plus les restaurants ou les logs.

*Cause* : `profiles.role` du compte n'est pas `'root'`.

*Correction* : corriger le rôle. Ne **jamais** remettre un UUID en dur : ce
serait défaire la correction qui rend le parcours testable hors production.

## Ce qui vaut pour les cinq

Aucune ne demande un rollback. Toutes se corrigent en avant, par une policy
ou une donnée, en moins de temps que le cycle complet. Le rollback reste le
dernier recours — et un recours dont on ressort vite.
