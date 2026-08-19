# Hotfix isolation lot/jeu — trace d'application en production

**Appliqué le 19 août 2026.** Autorisation explicite de Samy, limitée à ce seul
correctif et à ces seuls trois fichiers.

---

## Ce qui a été corrigé

`public.register_win` chargeait le lot par son `id` **seul** :

```sql
select * into v_prize from prizes where id = p_prize_id;
update prizes set quantity = quantity - 1 where id = p_prize_id and quantity > 0;
```

`registerWinnerAction` est un parcours public, non gardé par conception : il
transmettait le `prize_id` reçu du navigateur, tel quel, à la clé de service.
Un `prize_id` appartenant à **un autre restaurant** était donc accepté — stock
du concurrent décrémenté, ticket émis chez l'attaquant portant le libellé d'un
lot qui ne lui appartenait pas.

Le correctif borne les deux requêtes au jeu :

```sql
select * into v_prize from prizes where id = p_prize_id and game_id = p_game_id;
update prizes set quantity = quantity - 1 where id = p_prize_id and game_id = p_game_id and quantity > 0;
```

Aucune autre ligne du corps ne change.

---

## Ce qui a été exécuté, dans l'ordre

| Étape | Fichier | Nature | Issue |
|---|---|---|---|
| 1 | `01-preflight-production.sql` | lecture seule | **PREFLIGHT OK** |
| 2 | `02-appliquer.sql` | transaction bornée | **appliqué**, commit |
| 3 | `03-controles-post.sql` | lecture seule | **CONTROLE OK** |

Chaque étape a été exécutée avec le **contenu exécutable du fichier livré**,
commentaires retirés. Cette identité n'est pas affirmée : elle est mesurée.
Le code envoyé et le fichier du dépôt, dépouillés de leurs commentaires et
normalisés, font **7603 caractères** pour l'étape 2 et **2959 caractères** pour
l'étape 3, et sont identiques caractère à caractère.

---

## Ce que la base a répondu

**Avant** — préimage vulnérable auditée, confirmée par empreinte :

```
374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3   3552 caractères
```

**Après** — postimage corrigé exact :

```
32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442   3600 caractères
```

**Manifeste, relu après le `revoke`/`grant` :** identique avant et après.

```
p_game_id uuid, p_prize_id uuid, p_email text, p_phone text, p_first_name text, p_marketing_optin boolean
  | owner=postgres | secdef=true | config=search_path=public | vol=v
  | acl=postgres=X/postgres service_role=X/postgres
```

**Droits effectifs après application :**

| Rôle | `EXECUTE` | Attendu |
|---|---|---|
| `service_role` | oui | oui — sans lui le parcours joueur serait cassé |
| `anon` | non | non |
| `authenticated` | non | non |

**Fragments bornés, relus dans le corps déployé :** chargement et décrément
portent tous deux `and game_id = p_game_id`.

Les totaux lus après coup (9 jeux, 36 lots, 493 tickets) sont **une
observation, pas un critère** : sur une production active, de vrais joueurs les
font varier légitimement entre deux lectures.

---

## Ce que ce hotfix n'a pas touché

Aucun `insert`, `update` ou `delete` sur une table métier. Aucun jeu, aucun
lot, aucun ticket, aucun contact, aucun compte. Seuls ont changé : le corps
d'une fonction, et ses droits — reposés à l'identique.

---

## Point ouvert, pour décision de Samy

Le correctif a été appliqué par le **paquet hotfix**, pas par le migrateur.
La migration `supabase/migrations/20260819080000_isolation_lot_jeu.sql` n'est
donc **pas inscrite** dans le journal de migrations de production.

Ce n'est pas un danger : cette migration est bornée par empreinte et
fail-closed. Rejouée un jour par le migrateur, elle lira le postimage, dira
« déjà appliqué » et ne modifiera rien. Inscrire la ligne dans le journal
serait une écriture supplémentaire en production, hors du périmètre autorisé —
elle n'a donc pas été faite.

---

## Si une anomalie apparaît

**Ne pas jouer `04-retour-arriere.sql` par réflexe : il rouvre le P0 et
réexpose les clients.**

1. Arrêt immédiat, ne rien relancer.
2. Conserver les preuves : sortie observée, empreinte, heure.
3. Neutraliser le parcours si l'enregistrement des gains devient incohérent —
   hors service est moins grave qu'incohérent.
4. Correction **forward** en priorité.
5. Rollback en dernier recours, **uniquement sur décision explicite de Samy**,
   et après avoir établi que l'incident vient de *ce* correctif.
