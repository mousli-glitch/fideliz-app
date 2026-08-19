# P-1 — Le gérant s'appelle `restaurateur` partout

**Tranchée par Samy le 19/08/2026.** Règle produit.

---

## La règle

Un seul vocabulaire de rôle après fusion : `admin`, `root`, `sales`,
`restaurateur`. Celui de Cartiz. Les 7 comptes Fideliz qui portent
`restaurant` sont réécrits.

## Ce que ça coûte, mesuré

`npm run fusion:roles` énumère la surface et se régénère — une liste écrite à
la main serait fausse le lendemain.

| | Sites portant une valeur de rôle | Dont `restaurant`, à convertir |
|---|---|---|
| Fideliz — TypeScript | 129 | **54** |
| Fideliz — fichiers SQL | 56 | 14 |
| Cartiz | 30 | **0** |

Les 54 se répartissent en **25 gardes** (qui lisent un rôle), **17 fixtures de
test**, **5 écritures** et **7 divers**.

### Ce qui compte vraiment : les 9 objets vivants en base

Les fichiers de migration comptent des versions périmées. Le relevé en
production dit la vérité :

| Type | Objet |
|---|---|
| Contrainte | `profiles_role_check` |
| Fonction | `handle_new_user_profile`, `is_restaurant_user`, `fn_audit_restaurant_changes` |
| Policy | `games_insert_own`, `games_select_own`, `games_update_own`, `restaurants_select_own`, `winners_update_own` |

## Le vrai écrivain n'est pas dans le code applicatif

Cinq sites TypeScript écrivent `role: 'restaurant'`. **Trois sont décoratifs.**

Le déclencheur `handle_new_user_profile` pose le rôle lui-même, et son propre
commentaire le dit : *« Le role est TOUJOURS restaurant […] : ni l'un ni
l'autre ne peut venir de raw_user_meta_data, que le client controle. »*
C'est le durcissement du 18/08, et il tient.

**Conséquence pour le portage :** convertir le code sans convertir le
déclencheur ferait échouer toute création de compte en `23514` — le
déclencheur écrirait `restaurant`, que la contrainte Cartiz refuse. C'est le
piège de cette décision, et il est silencieux jusqu'au premier compte créé.

## Pourquoi rien ne change dans Fideliz aujourd'hui

Après la fusion, c'est **le code Cartiz qui sert** — l'application Fideliz
s'arrête, seules ses URL survivent, servies par Cartiz. Élargir les gardes de
Fideliz maintenant n'apporterait donc rien en exploitation.

Et toucher 25 gardes de contrôle d'accès dans une application vivante, pour un
bénéfice qui n'arrive qu'à la bascule, est un mauvais échange. La conversion se
fait **au portage**, dans Cartiz, où le vocabulaire cible est déjà en place.

Ce qui est fait aujourd'hui, c'est rendre ce portage **énumérable**.

## Le plan, au portage

1. **Porter les gardes en écrivant `restaurateur`.** Les 25 sites sont listés ;
   aucun ne doit rester au hasard. Les 17 fixtures suivent.
2. **Porter les 9 objets de base**, contrainte comprise, et **le déclencheur en
   premier** — c'est lui qui décide.
3. **Convertir les données** : les comptes `restaurant` deviennent
   `restaurateur`. 7 lignes.
4. **Éprouver le refus** : un compte au rôle inconnu doit être refusé, pas
   ignoré. `lib/securite/garde-action.ts` rend `ROLE_INCONNU` — c'est du
   fail-closed, donc l'erreur ne se voit pas à l'écran : elle ferme. Un test
   doit la provoquer.

## Ce que ça fait tomber

`P-2` (garder `is_active`) et `P-6` (plusieurs comptes gérants) se répondent
dans la foulée : les trois touchent la même table et la même migration.

## Ce qui n'est pas décidé ici

- **Le sort de `admin`.** L'instruction Cartiz est de ne jamais le retirer.
  Fideliz ne le connaît pas. Après fusion, `admin` et `root` coexistent — leur
  différence n'est écrite nulle part.
- **`is_restaurant_user`** (48 caractères) : garder la fonction en la
  renommant, ou la supprimer ? Non mesuré : ses appelants ne l'ont pas été.

## État

**Rien n'est exécuté.** Seul l'inventaire est versé.
