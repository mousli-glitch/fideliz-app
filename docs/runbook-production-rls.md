# Runbook de production — migration RLS d'isolation inter-tenant

Cible : `20260818011000_rls_isolation_inter_tenant.sql`, **une seule migration**.
Candidat : `candidat/rls-final`. Production applicative : `a99cb0c`.

> ⚠ **Un rollback Vercel ne répare pas une migration SQL.** Aucune application
> nouvelle n'accompagne ce hotfix : revenir en arrière côté Vercel ne touche
> pas une policy. Le seul retour possible est le rollback SQL du §9.

---

## 1. Préflight — trois mesures avant de toucher à quoi que ce soit

```sql
-- (a) Empreinte des policies. DOIT valoir 5b6dd5bc9df9ce6068c148a3f5288c05 / 43.
select count(*) as policies, md5(string_agg(t, E'\n' order by t)) as empreinte
from (select tablename||' '||policyname||' '||cmd||' '||permissive||' '||roles::text
       ||' using='||coalesce(qual,'-')||' check='||coalesce(with_check,'-') as t
      from pg_policies where schemaname='public') s;
```

```sql
-- (b) Registre. DOIT contenir exactement les 8 historiques, ni baseline ni durcissement.
select version, name from supabase_migrations.schema_migrations order by version;
```

```sql
-- (c) Un root actif doit exister, sinon `current_role()` ne rendra jamais 'root'.
select count(*) from public.profiles where role = 'root' and is_active is distinct from false;
```

**Arrêt immédiat** si l'empreinte diffère, si le registre porte autre chose que
les huit, ou si (c) rend zéro.

## 2. Sauvegarde des définitions concernées

Non destructif, à conserver hors dépôt. C'est le filet si le rollback du §9
devait lui-même être reconstruit.

```sql
select tablename, policyname, permissive, cmd, array_to_string(roles,', ') as roles,
       qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('profiles','restaurants','crm_notes','games','system_logs')
order by tablename, policyname;

select proname, pg_get_functiondef(oid) as definition, array_to_string(proacl,' | ') as droits
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('current_role','handle_deleted_commercial');
```

## 3. Dry-run

```bash
npx supabase db push --dry-run --linked
```

**Sortie attendue, exactement :**

```
Would push these migrations:
 • 20260818011000_rls_isolation_inter_tenant.sql
```

**Arrêt immédiat** si apparaît : un `repair`, une `baseline`, le durcissement
`20260818010000`, l'ancienne version en deux migrations, un fichier inattendu,
une divergence de registre, ou un avertissement non expliqué.

## 4. Application

```bash
npx supabase db push --linked
```

Durée mesurée sur la branche : **moins de 5 secondes**. Le fichier est
enveloppé dans une transaction unique : un échec en cours n'écrit rien et
n'inscrit rien au registre — vérifié en provoquant l'échec (§8).

## 5. Empreinte attendue après application

**`124e7014b337989bb9d96b7ec5057f94`, 41 policies.**

> Correction du 18/08 : la documentation antérieure annonçait `06ab49ed…`.
> Cette valeur datait de la version en **deux** migrations, avant leur fusion
> et avant la réparation du bloc de commentaire qui avait fait perdre la
> section `crm_notes`. Elle n'est pas reproductible avec le candidat final et
> ne doit plus servir de référence.

Rejouer la requête (a) du §1. Toute autre valeur = ne pas poursuivre, passer au §9.

## 6. Contrôles immédiats, non destructifs

```sql
-- Chaque identité ne doit voir que le sien. root voit tout.
-- Remplacer <uuid> par un compte réel de chaque rôle.
select set_config('request.jwt.claims', json_build_object('sub','<uuid>','role','authenticated')::text, true);
set local role authenticated;
select count(*) from public.profiles;      -- restaurateur : 1
select count(*) from public.restaurants;   -- restaurateur : 1
reset role;
```

Puis, sans rien modifier : `/login`, `/play/{best-pizza,la-ruche,soukara}`,
`/scan/...`, `/verify/<id>`, un dashboard restaurateur, `/super-admin/root`,
le dashboard commercial. Aucun 500, aucune boucle.

## 7. Corrections en avant

Les six correctifs exécutables sont dans `docs/runbook-rls.md`. Ils traitent :
root refusé, restaurateur ne lisant plus son profil, récursion `54001` de
`current_role()`, commercial refusé, policy `crm_notes` incorrecte, création
root de restaurant refusée. **Toujours préférer une correction en avant au
rollback.**

## 8. Ce qui est prouvé sur la branche

| Étape | Empreinte | Policies |
|---|---|---|
| État historique (= production) | `5b6dd5bc…` | 43 |
| Après application | `124e7014…` | 41 |
| Après rollback | `5b6dd5bc…` | 43 |
| Après réapplication | `124e7014…` | 41 |
| Après rollback (2ᵉ) | `5b6dd5bc…` | 43 |

**Atomicité** : échec délibéré injecté au milieu du fichier → empreinte
inchangée à `5b6dd5bc…`, la policy créée en tête du fichier absente, la policy
supprimée en tête toujours présente, aucune entrée au registre. Rien ne
survit, dans aucun sens.

## 9. Rollback SQL — dernier recours

`supabase/rollback/20260818011000_rollback.sql`, à exécuter tel quel.

⚠ **Il restaure volontairement les failles.** C'est un rollback de
**continuité**, pas un état de sécurité acceptable : il rouvre la lecture
inter-tenant des profils. **Deux heures au maximum**, au-delà la fuite
redevient le risque dominant devant l'incident qui a motivé le retour.

Empreinte de sortie attendue : `5b6dd5bc9df9ce6068c148a3f5288c05`, 43 policies.

Puis retirer l'entrée du registre pour que le CLI reste cohérent :

```sql
delete from supabase_migrations.schema_migrations where version = '20260818011000';
```

## 10. Surveillance

- Erreurs d'exécution Vercel, 30 min après application.
- `system_logs` : les refus tracés par les gardes (`*.refus`) — un pic signale
  un parcours légitime cassé, pas une attaque.
- Code `54001` en base = récursion de `current_role()`, §7 correctif 3.

## 11. GO / NO-GO

**GO** si : préflight (a)(b)(c) verts ; dry-run proposant exactement la seule
migration ; empreinte post-application `124e7014…` ; contrôles du §6 sans 500
ni boucle.

**NO-GO / rollback** si : empreinte inattendue ; un restaurateur ne lit plus
son propre profil ou son restaurant ; root perd un parcours ; le commercial
perd un parcours qui fonctionnait ; `54001` ; 500 ou boucle ; registre
divergent.
