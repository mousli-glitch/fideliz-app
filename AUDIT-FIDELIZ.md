# 🔍 Audit Fidéliz — Rapport complet (code + base de données)

> Version révisée APRÈS analyse de la vraie base Supabase (projet `fideliz`, `kzeuplszcqjqaqohfbzk`).
> Objectif : tout comprendre **sans rien casser**. Ce qui marche est conservé tel quel.

---

## ✅ La grande conclusion : ton projet est sain

Tes données réelles sont **propres** : sur 9 contrôles d'intégrité (gagnants sans jeu, jeux sans
restaurant, contacts sans restaurant, lots sans jeu, profils orphelins, stock négatif…),
**résultat = 0 problème partout.** Tu avais raison : « ça marche ». Et ce n'est pas de la chance.

Tu as mis plusieurs semaines parce que tu as fini par bien faire les choses au niveau de la base :
**les clés étrangères ont les bonnes règles de suppression en cascade.** C'est ce qui empêche les
fameux « enregistrements fantômes ».

| Quand tu supprimes… | Ce qui se passe automatiquement | Règle |
|---|---|---|
| un **restaurant** | ses jeux, lots, gagnants, contacts, mappings commerciaux partent avec | CASCADE |
| un **jeu** | ses lots et ses gagnants partent avec | CASCADE |
| un **lot** | les gagnants gardent leur ticket, juste le lien lot devient vide | SET NULL |
| un **compte (auth user)** | son profil, ses restaurants liés, ses mappings partent avec | CASCADE |
| un **commercial** | ses restaurants restent, le champ « créé par » se vide | SET NULL |

➡️ **Donc je corrige mon premier rapport** : les points « suppression dangereuse » et « orphelins »
que j'avais notés en CRITIQUE étaient **trop prudents**. La base gère ça correctement. Ton
« protocole nucléaire » (`delete-restaurant-full.ts`) supprime même dans le bon ordre
(restaurant → profil → compte) pour respecter la seule contrainte non-cascade (`owner_id`). C'est bien vu.

---

## 💡 Pourquoi tu as utilisé la « super clé » partout — et est-ce grave ?

En regardant ta base, **je comprends ton choix, et il est défendable.** Tu as accumulé des dizaines
de règles de sécurité (RLS) au fil du débogage, et elles sont devenues un **labyrinthe** : règles
qui se contredisent, doublons, et même des règles « temporaires » (`temp_open_*`) et des
**identifiants écrits en dur** dans le code des règles (ton ID root `04eb7091…`, un restaurant
`9ca36072…`). Avec ça, le client normal se faisait bloquer sans arrêt → tu as contourné en passant
par la super clé côté serveur. **Pragmatiquement, c'est ce qui fait que l'appli fonctionne.**

Le compromis : la super clé ignore toutes les règles de sécurité. Tant que c'est utilisé
**uniquement côté serveur** (c'est ton cas), ça reste raisonnable. Le vrai sujet, ce sont 2-3 trous
résiduels listés plus bas — corrigeables un par un, sans toucher à ce qui marche.

---

## Légende des priorités

- 🔴 **À corriger** (exposition de données réelle, vérifiable).
- 🟠 **À fiabiliser** (bug latent ou trou qui finira par servir).
- 🟢 **Confort / ménage** (rien d'urgent).

---

## 🔴 À corriger

### 1. La table `winners_archive` est ouverte à tout le monde
**Source : alerte officielle Supabase (niveau ERROR).** Cette table contient 37 anciens gagnants
(noms, emails) et **n'a aucune protection RLS** : n'importe qui possédant la clé publique (qui est
dans le code du site) peut la lire. C'est le seul vrai trou de confidentialité « grand public ».

**Correctif (à valider par toi, ne pas appliquer à l'aveugle) :**
```sql
ALTER TABLE public.winners_archive ENABLE ROW LEVEL SECURITY;
-- puis ajouter une policy réservée au root, ex :
CREATE POLICY archive_root_only ON public.winners_archive
  FOR ALL TO authenticated USING (is_root()) WITH CHECK (is_root());
```
⚠️ Activer RLS sans policy = plus personne n'y accède. Comme ton appli lit cette table via la super
clé (qui ignore RLS), ça ne cassera pas l'appli — mais ajoute quand même la policy par propreté.

### 2. Des fonctions SQL sensibles sont appelables par n'importe qui
**Source : alertes Supabase.** Plusieurs fonctions `SECURITY DEFINER` sont exposées au public, dont :
- `register_win(...)` → en théorie, on peut **créer un gagnant sans jouer** en appelant l'API directement.
- `get_sales_stats()` → fuite des stats commerciales.

Bonne nouvelle : ton appli n'utilise **même pas** `register_win` (elle passe par le code TypeScript).
Donc tu peux retirer le droit d'exécution public sans rien casser :
```sql
REVOKE EXECUTE ON FUNCTION public.register_win(uuid,uuid,text,text,text,boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sales_stats() FROM anon, authenticated;
```

---

## 🟠 À fiabiliser

### 3. Deux composants de jeu coexistent, dont un cassé
- Le **vrai** parcours utilise `components/game/public-game-client.tsx` → `register-winner.ts`. ✅
- L'ancien `components/game-flow.tsx` → `save-winner.ts` essaie d'écrire des colonnes **qui n'existent
  pas** dans la table `winners` (`restaurant_id`, `prize_title`). S'il était encore branché quelque
  part, il **planterait**.

**À faire :** confirmer que `game-flow.tsx` / `save-winner.ts` ne sont plus utilisés, puis les supprimer.

### 4. Le stock d'un lot peut théoriquement passer en négatif
**Fichier :** `register-winner.ts`. Le stock est lu puis réécrit en deux temps. Deux joueurs
simultanés peuvent gagner le même dernier lot. Risque faible à ton volume actuel, mais à corriger
avant un gros afflux. Idéalement : une décrémentation atomique en SQL (`... quantity = quantity - 1 WHERE quantity > 0`).

### 5. Pas de garde anti-rejeu — et ça arrive déjà
J'ai trouvé **1 cas réel** d'un même email gagnant 2 fois au même jeu. Rien n'empêche de rejouer.
À décider : « 1 participation par email/jeu » et l'imposer côté serveur.

### 6. Bug latent sur la validation d'un gain
La table `winners` n'autorise que les statuts `available` ou `redeemed`. Or `app/actions/admin.ts`
(`redeemWinnerAction`) écrit le statut `consumed` → **violation de contrainte**. Aucun gain n'a
encore été validé (tes 64 gagnants sont tous `available`), donc le bug est « endormi ». Vérifier
quelle fonction de validation est réellement branchée (`validate-win.ts` semble la bonne) et aligner les statuts.

---

## 🟢 Confort / ménage (base de données)

- **Règles RLS en doublon / temporaires** : `temp_open_profiles`, `temp_open_restaurants`,
  `global_nav_*` (toutes en `USING (true)`) rendent **tous les restaurants et profils lisibles par
  tout utilisateur connecté**. Tant que l'appli passe par la super clé ça ne gêne pas, mais à nettoyer
  un jour. Ne PAS supprimer en masse sans tester (c'est ce labyrinthe qui t'a fait perdre des semaines).
- **Identifiants en dur** dans certaines policies (`04eb7091…`, `9ca36072…`) : vestiges de débogage à retirer.
- **Contrainte FK en double** sur `restaurants.created_by` (`fk_commercial` + `restaurants_created_by_fkey`).
- **Protection mots de passe compromis** désactivée (Auth) → activable en 1 clic dans Supabase.
- **`search_path` non figé** sur quelques fonctions + **buckets publics listables** (logos, backgrounds) : durcissements mineurs.

## 🟢 Confort / ménage (code)

- Beaucoup de `console.log` avec emojis en production (à retirer/mettre derrière un drapeau).
- Usage massif de `any` en TypeScript (à typer progressivement via `database.types.ts`).
- Archives/fichiers en double dans le dépôt (`*.zip`, `mon_projet_sain.txt`, etc.) → à sortir du repo.
- `NEXT_PUBLIC_APP_URL` = `localhost` en local : vérifier qu'en prod (Vercel) il pointe sur le vrai
  domaine, sinon les QR codes générés pointeraient vers localhost.
- Reste de la fonctionnalité « Avis Google » à supprimer (5 fichiers + 3 à nettoyer).

---

## 🎯 Ordre conseillé (du plus sûr au plus délicat)

1. **Activer la protection mots de passe** (Auth) — 1 clic, zéro risque.
2. **Sécuriser `winners_archive`** (point 1) + **révoquer les fonctions exposées** (point 2) — sûr, l'appli n'en dépend pas.
3. **Supprimer le code mort** : Avis Google, puis `game-flow.tsx`/`save-winner.ts` après confirmation (points 3 + ménage).
4. **Anti-rejeu + stock atomique** (points 4, 5) — vraie amélioration produit.
5. **Aligner les statuts de validation** (point 6).
6. **Plus tard, à tête reposée** : grand ménage des policies RLS (point confort) — uniquement avec tests, un par un.

> Règle d'or pour ne rien casser : on traite **un point à la fois**, on teste, on commit. Jamais
> de nettoyage RLS massif d'un coup.
