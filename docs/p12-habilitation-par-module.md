# P-12 — L'habilitation prend la forme d'une table `restaurant × module`

**Tranchée par Samy le 19/08/2026.** Règle produit. **Elle ouvre P-11, P-13 et P-14.**

---

## La règle

Dire « ce restaurant a droit à ça » se fait par une table dédiée, tenue par le
vendeur — ni par des booléens sur `restaurants`, ni par un libellé de plan.

## Ce qui existe aujourd'hui, et pourquoi rien n'est une habilitation

Relevé en production Cartiz : sept tables portent une bascule.

| Table | Bascule | Ce que c'est |
|---|---|---|
| `loyalty_settings` | `tampons_actif`, `points_actif`, `vip_actif`, `champ_*_actif` | le restaurateur **configure son programme** |
| `promos`, `recompenses_catalogue`, `automatisations`, `staff_codes` | `actif` | une ligne activée ou non |
| `restaurants` | `publie`, `horaires_actifs` | l'état de la carte |
| `restaurants` | `abonnement_debut`, `abonnement_fin` | deux dates, lues par la console admin |

Côté Fideliz : `subscription_end` (une date), `subscription_plan` (**un libellé
d'affichage** — `set-subscription.ts` y écrit `"Personnalisé"`), et
`is_retention_alert_enabled`, seul précédent d'un droit par fonctionnalité.

### La distinction qui décide de tout

`tampons_actif = false` veut dire **« le restaurateur a éteint ses tampons »**.
Une habilitation dirait **« il n'a jamais acheté la fidélité »**.

Confondre les deux est la faute classique : un restaurateur qui éteint son
programme passerait pour un impayé, et un impayé pour quelqu'un qui a choisi.
Les deux notions doivent vivre à deux endroits différents, et c'est
exactement ce que P-12 acte.

### Et une raison mesurée de ne PAS mettre l'habilitation sur `restaurants`

| | |
|---|---|
| Policy `restaurants_owner_all` | `ALL` sur `is_admin() OR id = my_restaurant_id()` |
| Droits de table | `authenticated` a `UPDATE` sur **les 26 colonnes**, `abonnement_debut` et `abonnement_fin` comprises |

Autrement dit : **le restaurateur peut réécrire ses propres dates
d'abonnement.** Rien n'a été tenté — c'est la surface de droits qui le dit, RLS
et `GRANT` combinés.

Ce n'est pas encore une élévation de privilège, puisque ces dates ne gardent
rien aujourd'hui : seule la console admin les affiche. Mais elles seraient la
première chose qu'on brancherait sur le gating — et on aurait posé le verrou à
portée de celui qu'il contraint.

⚠️ **Constat à traiter indépendamment de la fusion.** Un restaurateur peut
aujourd'hui modifier les dates que la console de Samy affiche comme vérité
commerciale.

## La forme proposée (décision technique, `T`)

```
habilitations
  restaurant_id  uuid    → restaurants(id) on delete cascade
  module         text    check (module in ('carte','fidelite','jeu','avis'))
  accorde_le     timestamptz not null default now()
  accorde_par    uuid    → auth.users(id)     -- qui a vendu
  retire_le      timestamptz                  -- null = en cours
  primary key (restaurant_id, module)
```

**RLS :** lecture pour le restaurant concerné, **écriture réservée à `sales`,
`admin` et `root`**. Jamais au restaurateur — c'est toute la différence avec les
sept bascules ci-dessus.

`retire_le` plutôt qu'un `actif boolean` : on veut savoir **depuis quand** un
droit a été retiré, pas seulement qu'il l'est. Une facturation se conteste.

## Les 32 écrans, et leur module

| Module | Écrans |
|---|---|
| `carte` | `/app/carte` ×2, `/app/import` ×2, `/app/flyer`, `/app/qr`, `/app/horaires`, `/app/promos` — **8** |
| `fidelite` | `/app/fidelite` + 10 sous-écrans — **11** |
| `jeu` | `/admin/[slug]/games` ×3, `/winners`, `/scanner` — **5** |
| `avis` | `/admin/[slug]/reviews` — **1** |
| socle, **jamais gaté** | `/app`, `/app/profil`, `/app/stats`, `/admin`, `/admin/[slug]`, `/admin/[slug]/settings`, `/app/fidelite/clients` — **7** |

Le socle n'est pas gaté parce qu'un restaurateur sans aucun module doit
pouvoir se connecter, voir son compte et joindre Samy. Une porte qui se ferme
sur tout est une porte qu'on ne peut plus rouvrir sans support.

## Ce qui reste à trancher

- **P-13** — l'absence de droit vaut-elle refus, et backfill du parc existant ?
  La table ci-dessus fonctionne dans les deux sens ; seule la migration de
  peuplement change. Sans réponse, rien ne peut être écrit.
- **P-11** — ce qu'une échéance dépassée coupe, et surtout ce qu'elle **ne
  coupe jamais** (`/m`, `/c`, `/verify` — et la question ouverte de `/scan`,
  que le jeu Fideliz coupe déjà).
- **P-14** — l'impersonation ignore-t-elle le gating ?

## Ce qui n'est pas mesuré

- Le **nombre de points d'application** : combien de routes, de composants de
  navigation et de Server Actions devront consulter l'habilitation. Les 32
  écrans sont comptés, pas leurs gardes.
- La relation entre `habilitations` et `abonnement_fin` : un droit accordé
  survit-il à une échéance dépassée, ou l'échéance retire-t-elle tout ? C'est
  P-11, et ça se décide avant d'écrire la table.

## État

**Rien n'est exécuté.**
