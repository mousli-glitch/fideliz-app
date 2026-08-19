# Hotfix — isolation lot/jeu dans `register_win`

**Statut : `READY_FOR_HOTFIX`. Rien n'a été appliqué. Ce paquet attend l'accord explicite de Samy.**

## Le défaut

`register_win(p_game_id, p_prize_id, …)` chargeait le lot par son seul identifiant,
sans vérifier qu'il appartient au jeu. Le décrément de stock avait le même défaut.

`registerWinnerAction` est l'action publique du parcours joueur — sans garde de rôle,
à raison : un client anonyme enregistre son gain. Elle transmet `data.prize_id`
**verbatim** depuis le navigateur, à la clé de service. La fonction n'est exécutable ni
par `anon` ni par `authenticated`, ce qui ne protège rien : la Server Action est la porte.

Mesuré sur cible synthétique, deux restaurants, lot à stock limité chez chacun,
appel avec le jeu de A et le lot de B :

| | avant correctif | après correctif |
|---|---|---|
| Appel | accepté | refusé (`prize_not_found`) |
| Stock du confrère | **3 → 2** | 3 (intact) |
| Ticket chez l'attaquant | 1, libellé « MAGNUM DE CHAMPAGNE (lot de B) » | 0 |
| Chemin légitime | vert | vert, libellé « Lot de A » |

## Empreintes

| | SHA-256 de `prosrc` | caractères |
|---|---|---|
| Préimage vulnérable | `374e138285cb2962702ede05c713a62b5c0bbfa797ee6b50d5e5e91da6516cb3` | 3552 |
| Postimage corrigé | `32a3238976acd880c9711aaf04fb4b540ecb1ed055dcebf062828d6e0a988442` | 3600 |

Les tailles sont en **caractères** (`length`), pas en octets : le corps est multioctet —
3600 caractères pour 3604 octets sur le corrigé. L'autorité sur l'identité du corps est
le SHA-256, pas la longueur.

Mesurées sur la production **en lecture seule**, sans aucune mutation. Le corps de la
fonction n'a jamais été affiché ni recopié hors de la base.

## Pourquoi un patch borné plutôt qu'une définition complète

Une définition complète **écrase** ce qui est déployé. Si la production porte le moindre
écart avec ce qui a été audité, elle remplace silencieusement son comportement — sur une
fonction qui porte le rejeu, les quotas, les stocks, les contacts et les séquences
d'action. Le mode d'échec d'un patch borné par empreinte, lui, est un **refus**.

## Machine d'état

| État observé | Migration | Rollback |
|---|---|---|
| Préimage exacte | applique | no-op strict |
| Postimage exacte | no-op strict | restaure la préimage |
| Toute autre empreinte | **refus** | **refus** |

Un état partiel, mixte ou dupliqué n'a par construction ni l'une ni l'autre empreinte :
il tombe dans « inconnu » et se fait refuser. Prouvé sur les deux états partiels
possibles.

## Procédure — dans cet ordre, et en s'arrêtant au premier écart

1. **`01-preflight-production.sql`** — lecture seule. Si une seule colonne rend autre
   chose que `OK`, **arrêt immédiat**. Ne pas continuer.
2. **`02-appliquer.sql`** — atomique et fail-closed. Ouvre sa propre transaction, refuse
   si l'empreinte n'est pas la préimage autorisée, revérifie les droits **avant** le
   commit. Ne touche aucune donnée.
3. **`03-controles-post.sql`** — lecture seule, lève au premier écart. L'empreinte doit
   être le postimage, la signature, les attributs, le propriétaire et l'ACL inchangés, et
   `service_role` doit conserver `EXECUTE`.

**Il n'y a pas d'étape 4.** Le comportement fonctionnel est déjà prouvé sur la cible
synthétique fidèle — même préimage bit-à-bit que la production. Vérifier le parcours
joueur sur un vrai restaurant créerait un ticket réel, un contact, un mouvement de stock
et potentiellement une donnée personnelle : c'est une **mutation de donnée métier**, qui
ne fait pas partie de l'autorisation d'appliquer un correctif de fonction. Elle demande
une **autorisation distincte et explicite** de Samy.

## Sur les comptages métier

`03-controles-post.sql` affiche des totaux (jeux, lots, tickets). Ils **ne prouvent rien**
sur une production active : de vrais joueurs et de vrais restaurateurs les font varier
légitimement entre deux lectures, et deux variations opposées se compensent. Ils sont là
pour l'œil de l'opérateur, **jamais comme critère**.

La preuve que ce hotfix ne touche aucune donnée est ailleurs, et elle est plus solide :
le script ne contient aucun DML sur une table métier, il s'exécute dans une transaction
bornée, il ne lit que des métadonnées de fonction, et son comportement est prouvé sur
cible synthétique.

## En cas d'écart

**`04-retour-arriere.sql` RÉOUVRE LE P0.** Une fois le correctif en service, ce n'est pas
la bonne réponse à un incident : la bonne réponse est une correction **forward**, ou la
neutralisation temporaire du parcours d'enregistrement. Un rollback aveugle réexpose les
clients pour régler un problème qui n'est probablement pas celui-là.

Ne le jouer que sur décision explicite, et seulement si l'incident est causé par ce
correctif précis.

## Ce que ce hotfix ne fait pas

- Il ne touche **aucune donnée** : ni jeu, ni lot, ni ticket, ni contact, ni compte.
- Il ne touche ni Auth, ni OAuth, ni Storage, ni domaine, ni alias.
- Il n'active aucun gel et ne déploie aucune interface.
- Il est **indépendant du chantier de fusion** : aucune de ses migrations n'est requise.

## Preuves jouées sur cible synthétique

- `supabase/verifications/harnais-machine-etat-hotfix.sql` — **11 transitions**, dont les
  quatre états anormaux (chargement corrigé seul, décrément corrigé seul, corps inconnu,
  fonction absente) **refusés par la migration ET par le rollback** ;
- retour à la **préimage exacte** après rollback, ACL et attributs identiques ;
- `supabase/verifications/harnais-isolation-lot-jeu.sql` — oracle d'attaque unique joué
  dans les deux polarités : **2/5 sur la préimage** (l'attaque passe), **5/5 sur le
  corrigé** ;
- `supabase/verifications/harnais-hotfix.test.ts` — garde que le paquet ne diverge pas du
  dépôt : substance canonique, constantes partagées, transaction explicite, préflight
  fail-closed.

## Commande qui attend l'autorisation de Samy

Aucune commande n'a été lancée. Celle qui attend son accord est l'étape 3 ci-dessus :

    02-appliquer.sql   sur le projet de PRODUCTION Fideliz

à ne lancer qu'après un préflight entièrement `OK`.
