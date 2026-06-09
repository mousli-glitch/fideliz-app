# ✅ Batterie de tests Fidéliz — Validation avant commercialisation

> Légende : ☐ = à tester par toi (clics réels) · ✅ = déjà vérifié ensemble (code/base) · ⚠️ = point de vigilance
> Méthode conseillée : crée **1 restaurant de test** + **1 commercial de test**, et déroule chaque bloc.

État vérifié automatiquement (base + code) au moment de l'écriture :
- ✅ Code compile sans erreur · ✅ 0 enregistrement orphelin · ✅ comptes = profils (cohérent)
- ✅ Cascades de suppression OK · ✅ Anti-rejeu (email + tél) testé en base · ✅ Validation anti-réutilisation testée
- ✅ Anonymisation RGPD planifiée (cron actif) · ✅ winners_archive protégée · ✅ étanchéité par restaurant testée

---

## BLOC 1 — Parcours de jeu client (lien public)

Ouvrir le lien d'un restaurant : `app.fideliz-app.fr/play/<slug>` (ou via QR → `/scan/<slug>`).

- ☐ 1.1 La page de jeu s'affiche avec le **logo, les couleurs et le fond** du restaurant.
- ☐ 1.2 La **roue tourne** et un lot est tiré (animation + confettis).
- ☐ 1.3 Le **formulaire** s'affiche après le gain (prénom, e-mail, téléphone, case consentement).
- ☐ 1.4 Champs obligatoires : impossible de valider sans **prénom + e-mail**.
- ☐ 1.5 La **case de consentement** est **non pré-cochée**.
- ☐ 1.6 La **mention d'information RGPD** + le lien **politique de confidentialité** sont visibles sous le formulaire.
- ☐ 1.7 Après validation → **ticket gagnant** avec QR, validité, minimum de commande, et mention « usage unique ».
- ☐ 1.8 Boutons **Enregistrer** (image du ticket) et **Offrir/Partager** fonctionnent.
- ✅ 1.9 **Anti-rejeu** : rejouer avec le **même e-mail** → bloqué ; **même téléphone** → bloqué ; e-mail + tél différents → autorisé. *(à reconfirmer en vrai sur mobile)*
- ☐ 1.10 **Stock** (si activé sur le jeu) : quand un lot est épuisé → message « dernier lot parti », jamais de stock négatif.
- ☐ 1.11 **Mobile réel** : tester sur **Android ET iPhone** (affichage + soumission).
- ☐ 1.12 Restaurant **bloqué / sans jeu actif** → message correct (pas de jeu en cours), pas d'erreur.
- ⚠️ 1.13 Vérifier que le QR du ticket pointe bien vers `app.fideliz-app.fr/verify/...` (et non vers la vitrine).

---

## BLOC 2 — Back-office restaurateur (connexion sur /login)

### 2.0 Connexion
- ☐ Bons identifiants → arrive sur le dashboard du **bon** restaurant.
- ☐ Mauvais identifiants → message « Identifiants incorrects ».
- ☐ Compte désactivé / restaurant bloqué → message de blocage.
- ☐ Lien « Mot de passe oublié » → e-mail de réinitialisation reçu et fonctionnel.

### 2.1 Menu Dashboard
- ☐ Les 4 cartes (CA estimé, **Clients uniques**, Participations, Taux de retour) affichent des chiffres cohérents.
- ☐ « Clients uniques » = nb de contacts (≠ participations).
- ☐ Le **graphique 14 jours** se remplit avec les vraies participations.
- ☐ Le **donut** (gains disponibles / validés) est correct.
- ☐ Le **stock du jeu actif** s'affiche en X/Y avec alerte « bientôt épuisé ».
- ☐ L'**activité récente** liste les derniers gagnants/validations.
- ☐ Les raccourcis « Pilotage » mènent aux bonnes pages.

### 2.2 Menu Mes Jeux
- ☐ La liste des jeux s'affiche avec leur **statut**.
- ☐ **Créer un jeu** : onglets Infos / Lots / Design ; impossible de créer si total des chances ≠ 100 % ; champ nom (placeholder « Roue de la Chance »).
- ☐ Options : dates de campagne, minimum de commande, gestion de stock par lot.
- ☐ **Modifier un jeu** existant : les changements sont bien enregistrés.
- ☐ **Activer / désactiver** un jeu.
- ✅ Contrainte « 1 seul jeu actif par restaurant » (testée en base).
- ☐ **Supprimer un jeu** → ses lots et gagnants partent avec (cascade).
- ☐ Boutons **Lien public**, **Jouer**, **QR Code** fonctionnent.

### 2.3 Menu Clients CRM
- ☐ Liste paginée (30/page) ; navigation entre pages.
- ☐ **Recherche** par nom/e-mail.
- ☐ **Export CSV** : fichier correct.
- ☐ **Supprimer** un ou plusieurs contacts.

### 2.4 Menu Gagnants
- ☐ Liste paginée (50/page) ; navigation.
- ☐ **Valider un gain** depuis la liste → statut passe à « validé ».
- ✅ Anti double-validation (testé en base).
- ☐ Affichage du statut, date, lot.

### 2.5 Menu Scanner
- ☐ Ouvrir la **caméra** (autorisation demandée).
- ☐ Scanner un ticket → écran de **confirmation** avec verdict **vert « GAIN VALABLE »** ou **rouge**.
- ☐ Affichage : client, lot (nom du ticket), **minimum de commande**, **validité**, date du gain.
- ☐ Bouton **Valider** → gain validé ; **Annuler** → rien.
- ☐ Re-scanner le même ticket → **« Déjà utilisé »** (rouge), pas de bouton valider.
- ☐ Ticket **expiré** → rouge + « Valider quand même ».
- ✅ Étanchéité : scanner le ticket d'un **autre** restaurant → refusé (testé en base).

### 2.6 Menu Paramètres
- ☐ Modifier **nom**, **e-mail de contact**, **panier moyen** → **sauvegarde réelle** (recharger pour confirmer).
- ☐ Le **panier moyen** modifié change le « CA estimé » du dashboard (et n'affecte QUE ce restaurant).
- ☐ Lien public copiable.

---

## BLOC 3 — Super-admins

### 3A — Super-admin ROOT (le tien, le plus puissant)
- ☐ 3A.1 Login root → `/super-admin/root`.
- ☐ 3A.2 **Créer un restaurant** (compte + mot de passe provisoire) → pas d'erreur « Database error » ; le nouveau compte a le rôle **restaurant** et est bien **lié** à son resto. ✅ *(corrigé et testé)*
- ☐ 3A.3 **Gestion des restaurants** : lister, **bloquer/débloquer**, **supprimer** (→ cascade complète, aucun orphelin). ✅ *(cascades testées)*
- ☐ 3A.4 **Gestion des commerciaux** : **créer** un commercial (rôle sales) ; **supprimer** un commercial (jamais bloqué, même avec des logs). ✅ *(durci en base)*
- ☐ 3A.5 Le root **voit tout** (tous restos, tous commerciaux).
- ☐ 3A.6 Les **statistiques root** s'affichent correctement.
- ☐ 3A.7 Se connecter avec un nouveau resto créé → il accède bien à SON dashboard.

### 3B — Super-admin COMMERCIAL
- ☐ 3B.1 Login commercial → `/super-admin/sales/dashboard`.
- ☐ 3B.2 **Créer un restaurant** → le commercial **reste connecté** (pas déconnecté), le resto apparaît dans **son** portefeuille. ✅ *(bug signUp corrigé)*
- ☐ 3B.3 Dashboard commercial : ne voit que **ses** restaurants et stats.
- ☐ 3B.4 **Étanchéité / droits** : un commercial **ne peut pas** accéder à `/super-admin/root`, ni à l'admin d'un restaurant, ni voir les restos d'un autre commercial.

---

## BLOC 4 — Transversal (à valider avant le grand lancement)

- ☐ 4.1 **Étanchéité globale** : aucun restaurant ne voit les données d'un autre (clients, gagnants, jeux). ✅ *(testé en base)*
- ☐ 4.2 **RGPD** : page `/confidentialite` accessible et à jour ; mentions formulaire/ticket ; case consentement OK ; anonymisation planifiée. ✅
- ☐ 4.3 **QR codes** : pointent vers `app.fideliz-app.fr/scan/...` ; téléchargement **PNG HD** OK ; stables (ne pas changer les slugs après impression).
- ☐ 4.4 **Domaines** : `fideliz-app.fr` → vitrine ; `app.fideliz-app.fr` → appli ; racine de l'appli → `/login`.
- ☐ 4.5 **Variable `NEXT_PUBLIC_APP_URL`** = `https://app.fideliz-app.fr` (sinon QR cassés).
- ☐ 4.6 **Sauvegardes** : Supabase Pro = sauvegardes quotidiennes (7 j) actives. ✅
- ☐ 4.7 **Performance** : pages rapides, aucune erreur dans la console du navigateur (F12).
- ☐ 4.8 **Responsive** : back-office utilisable sur mobile (le caissier scanne au téléphone).
- ☐ 4.9 **Sécurité** : protection « mots de passe compromis » activée. ✅ ; réinitialisation de mot de passe fonctionnelle.
- ☐ 4.10 **Charge multi-restaurants** : plusieurs restos actifs en même temps, chacun isolé.
- ⚠️ 4.11 Nettoyer le **projet Vercel en double** (`fideliz-app-su4f`) pour éviter les confusions de déploiement.
- ⚠️ 4.12 Avant le vrai lancement : **purger les données de test** restantes (3 gagnants / 3 contacts d'essai).

---

## Comment je peux t'aider sur cette liste
- Les points **✅** sont déjà validés côté code/base (je peux les re-démontrer).
- Les points **☐** côté **base de données** (étanchéité, simulations de jeu, suppressions) → je peux les **rejouer en direct** sur tes vraies données et te montrer les résultats.
- Les points **☐** purement **visuels / clics** → c'est toi qui testes, et tu me remontes tout souci (je corrige).
