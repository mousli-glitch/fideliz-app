# Création des comptes — la règle, et pourquoi

Arrêtée le **18/08/2026**, après un P0 de production.

## La règle

**En V1, personne ne s'inscrit depuis une page publique.**

Les comptes naissent uniquement par un parcours protégé :

| Qui | Peut créer | Par où |
|---|---|---|
| `root` | un commercial | `masterCreateSalesAction` |
| `root` | un restaurant + son compte | `masterCreateRestaurant` |
| `sales` ou `root` | un restaurant client dans son périmètre | `createRestaurantAction` |

Trois invariants, non négociables :

1. **Aucun rôle ne vient de `raw_user_meta_data`.** C'est `options.data` du SDK :
   une valeur que le client écrit lui-même.
2. **Les rôles privilégiés sont posés côté serveur**, par une action gardée qui
   vérifie l'identité de l'appelant et journalise.
3. **L'inscription publique est fermée** (`disable_signup: true`).

## Ce qui a rendu cette règle nécessaire

Le 18/08/2026, la configuration Auth de Fideliz était :

```
disable_signup     = false   → n'importe qui pouvait s'inscrire
mailer_autoconfirm = true    → sans confirmer son adresse
```

Et `handle_new_user_profile()`, branchée sur chaque création de compte, écrivait :

```sql
coalesce(new.raw_user_meta_data->>'role', 'restaurant')
```

Une inscription portant `{"role":"root"}` produisait donc **un compte root
immédiatement utilisable**, sur une plateforme servant trois vrais restaurants.

`restaurant_id` était le piège discret : un inscrit pouvait se rattacher au
restaurant d'un vrai client, et les gardes applicatives — qui comparent le
restaurant de la session à celui de l'objet visé — l'auraient laissé passer.

**Audit des neuf comptes existants avant toute modification : aucune élévation
n'avait été réalisée.** Un root (celui de Samy, promu manuellement), un
commercial créé par l'action légitime, sept restaurateurs, tous cohérents.

## Ce qui protège aujourd'hui

| Contrôle | Où | Ce qu'il attrape |
|---|---|---|
| Rôle en dur dans le trigger | migration `20260817230642` | l'élévation par métadonnée |
| 7 tests sur les migrations | `supabase/migrations/migrations.test.ts` | la réapparition du défaut par recopie |
| Préflight Auth | `npm run preflight:auth` | la réouverture de l'inscription publique |
| Gardes internes | `lib/securite/garde-action.ts` | un compte sans rattachement ne peut rien |

Le préflight sait échouer — vérifié sur trois manifestes fabriqués :
inscription rouverte, fournisseur externe ajouté, fournisseur e-mail coupé.
Code **1** dans les trois cas.

**Un compte fraîchement créé ne peut rien.** `restaurant` sans `restaurant_id`
est un profil que toutes les gardes refusent, puisqu'elles exigent que le
restaurant visé soit le sien.

## La configuration Auth ne vit dans aucune migration

C'est le point qui rend ce document nécessaire. `disable_signup` est un réglage
du tableau de bord : aucun fichier du dépôt ne le porte, aucun `git revert` ne
le rétablit. Il doit donc figurer dans :

- **le Context Pack** de la fusion ;
- **la checklist de production** ;
- **le runbook de bascule** ;
- **les contrôles pré-déploiement** (`npm run securite` l'inclut) ;
- **ce document.**

### Critère de NO-GO

Si `disable_signup` repasse à `false` en production, **la bascule ne part pas.**
Le préflight sort en code 1.

`mailer_autoconfirm = true` est signalé sans être bloquant : sans conséquence
tant que l'inscription est fermée, mais il devrait rebasculer en même temps si
elle rouvrait un jour.

## Si une inscription self-service est ajoutée un jour

Chantier séparé, avec décision explicite de Samy, et sept exigences :

rôle non privilégié imposé · confirmation d'e-mail · protection anti-abus ·
limite de débit · validation du restaurant · tests Auth · nouvelle décision
explicite.

**Ne jamais rouvrir l'inscription publique pour débloquer un test ou un écran.**

## État vérifié le 18/08/2026

| Point | Résultat |
|---|---|
| `disable_signup` | **true** — inscription refusée en `422 signup_disabled` |
| Connexion des comptes existants | point d'entrée vivant (`400 invalid_credentials` sur des identifiants faux) |
| Récupération de mot de passe | point d'entrée vivant (`200`, sondé sur une adresse inexistante — aucun e-mail réel envoyé) |
| Autres fournisseurs publics | aucun |
| Comptes | 9 · 0 banni · 0 supprimé · 0 non confirmé · 0 sans mot de passe |
| Créations administratives | `auth.admin.createUser` avec la clé de service — **hors du champ de `disable_signup`** |
| Dépendance du produit à l'inscription publique | **aucune** — zéro appel à `signUp` dans Fideliz comme dans Cartiz |

Aucun compte n'a été créé pour établir ce tableau.

## Registre des migrations

Le registre Supabase contient **7 entrées**, dont la correction du 18/08
(`20260817230642_role_jamais_depuis_les_metadonnees`).

**Les six antérieures n'ont aucun fichier dans Git** — elles ont été appliquées
depuis le tableau de bord avant que ce dossier existe :

```
20260724002837  create_avis_mirror_table
20260724132406  add_auto_reply_since
20260731002821  add_wheel_custom_colors
20260802115534  add_stock_auto_refill
20260802121539  add_auto_reply_options
20260816120110  add_requires_review_proof
```

C'est l'écart que la baseline complète doit résorber : elle reconstruira l'état
réellement déployé, ces six migrations comprises. Les noms de fichiers suivent
désormais la version du registre, pour qu'un même objet ne porte jamais deux
identités.
