# Analyse — Rejouabilité contrôlée & actions marketing progressives

> Étude technique et produit. **Rien n'est implémenté** : c'est une feuille de route pour décider.

---

## 0. Comment ça s'articule avec l'existant
- Aujourd'hui : 1 jeu = 1 action (`games.active_action` = GOOGLE_REVIEW / INSTAGRAM / FACEBOOK / TIKTOK).
- L'anti-rejeu actuel **bloque pour toujours** un même e-mail/téléphone sur un jeu (index uniques).
- La feature demandée transforme ce « blocage définitif » en « blocage temporaire + action différente à chaque retour ».

**Point de conception clé (à comprendre avant tout) :** aujourd'hui, l'e-mail est demandé **à la fin** (après avoir gagné). Or pour proposer une **action différente selon l'historique du joueur**, il faut **l'identifier au DÉBUT** (avant de jouer). C'est le vrai changement de fond : on déplace la saisie e-mail/téléphone en **première étape**.

---

## 1. Meilleure logique utilisateur
1. Le joueur arrive (scan QR) → on lui demande **e-mail ou téléphone** d'entrée.
2. L'appli regarde l'historique de ce joueur **sur ce restaurant** :
   - **Jamais venu** → action n°1 (ex. avis Google) → il fait l'action → il joue → ticket.
   - **Revenu avant le délai** (24/48h) → message « Vous avez déjà participé, revenez dans X h ».
   - **Revenu après le délai** → on lui propose **l'action suivante non encore faite** (Instagram, puis Facebook, etc.) → il joue.
3. Quand toutes les actions sont épuisées → soit on recommence la liste, soit on arrête (configurable).

---

## 2. Structure de base de données nécessaire
**Sur `games` (ou `restaurants`) — configuration :**
- `replay_enabled` (booléen)
- `replay_delay_hours` (entier : 24, 48, ou perso)
- `action_sequence` (jsonb : liste ordonnée, ex. `["GOOGLE_REVIEW","INSTAGRAM","FACEBOOK","TIKTOK"]`)
- `verification_mode` (texte : 'none' | 'email' | 'sms' | 'both')

**Sur `winners` (chaque participation) :**
- `assigned_action` (texte : l'action proposée à ce passage) → pour savoir où en est le joueur.

**Index anti-rejeu :** on **remplace** les index « 1 par email/jeu » par une logique « délai » dans la fonction `register_win` (on garde la détection email/téléphone, mais on autorise un nouveau jeu si le dernier remonte à plus de X heures).

> Pas besoin de nouvelle table : `winners` (qui historise déjà chaque participation avec email/téléphone/date) suffit pour l'historique et le calcul de la prochaine action.

---

## 3. Modifications du formulaire
- Ajouter une **étape d'entrée** : e-mail/téléphone **avant** le jeu (au lieu de seulement à la fin).
- Selon la réponse de l'appli : afficher le jeu + l'action du moment, OU le message « revenez dans X h ».
- (Option vérification) : un champ « code reçu par SMS/e-mail » à saisir avant de jouer.

---

## 4. Modifications du back-office
Dans la config du jeu :
- interrupteur **Rejouabilité** (on/off) ;
- **délai** (24h / 48h / perso) ;
- **liste ordonnée des actions** (glisser-déposer ou ajout/suppression) ;
- **mode de vérification** (aucune / e-mail / SMS / les deux) ;
- une vue **historique d'un joueur** : ses participations, l'action déjà faite, et quand il pourra rejouer.

---

## 5. Règles anti-fraude (par ordre d'efficacité/coût)
1. **Détection e-mail + téléphone + délai** (déjà presque en place) — gratuit, bloque l'abus de base.
2. **Vérification par code SMS/e-mail (OTP)** — très efficace mais : coûte de l'argent (SMS Twilio), ajoute de la friction, complexe.
3. **Empreinte appareil/session** (cookie/localStorage) — gratuit mais contournable (navigation privée).

**Recommandation anti-fraude :** commencer par (1) seul. N'ajouter (2) que si une vraie fraude apparaît.

---

## 6. Messages à afficher au joueur
- Déjà venu (avant délai) : « Vous avez déjà participé 🎉 Revenez dans **X h** pour rejouer et tenter un nouveau lot ! »
- Nouvelle action : « Pour rejouer, suivez-nous sur **Instagram** ⭐ »
- Code envoyé : « Un code vous a été envoyé par SMS/e-mail. Saisissez-le pour jouer. »
- Code faux : « Code incorrect. Il vous reste N essais. »
- Code expiré : « Ce code a expiré, demandez-en un nouveau. »

---

## 7. Workflow complet (version recommandée, sans OTP)
1. Scan QR → page du jeu.
2. Saisie **e-mail/téléphone**.
3. Appli vérifie l'historique :
   - jamais venu → action n°1 ;
   - < délai → message « revenez dans X h » (stop) ;
   - ≥ délai → action suivante non faite.
4. Le joueur fait l'action (suivre / avis / partage).
5. Il tourne la roue → gagne.
6. Ticket généré, `assigned_action` enregistrée, `last_play` = maintenant.

---

## 8. Risques techniques & légaux à anticiper
- **🔴 Avis Google (juridique) — le plus important.** Conditionner une récompense à « laisser un avis » (surtout positif) est **contraire aux règles Google** (avis incités) et encadré en France (DGCCRF / avis trompeurs). Risque : suppression d'avis, pénalité de la fiche, voire sanction.
  - **Formulation conforme proposée** : ne jamais exiger un avis *positif* ni l'avis comme condition stricte. Préférer « **Visitez notre page Google** » / « Donnez-nous votre avis (libre) » — l'avis reste **facultatif** et **non noté**. Pour les réseaux sociaux (suivre Instagram/TikTok), c'est OK.
- **💸 Coût SMS** : chaque OTP SMS est facturé (Twilio). À grande échelle, ça chiffre.
- **📉 Conversion** : demander un OTP **avant** de jouer fait abandonner beaucoup de joueurs. La friction tue le taux de participation.
- **RGPD** : plus on identifie tôt + on vérifie, plus on traite de données → cohérent avec ta politique, mais à mentionner.

---

## RÉPONSES À TES QUESTIONS (8)

### Est-ce une bonne idée ?
**Oui, le concept est excellent** pour Fidéliz : faire revenir le client régulièrement **en échange d'une action marketing différente** (suivi Instagram, TikTok, etc.) = vraie valeur pour le restaurant et bon argument de vente. Ça peut réellement augmenter les abonnements réseaux et les retours en magasin. **À condition** que l'expérience reste simple côté joueur (et c'est là que l'OTP pose problème).

### Maintenant ou plus tard ? Complexité ?
- **La rejouabilité progressive (sans OTP)** : **complexité MOYENNE**, bonne valeur → **à faire en version simple bientôt**.
- **La vérification OTP SMS/e-mail** : **complexité ÉLEVÉE** + coût + friction → **à reporter**.
- Pourquoi moyen : il faut déplacer la saisie e-mail au début (refonte du tunnel), gérer la séquence d'actions, la config back-office, et adapter `register_win`. C'est du travail mais sans techno exotique.

### Délais estimés (réalistes, dev senior)
| Version | Inclus | Non inclus | Estimation |
|---|---|---|---|
| **MVP** | Détection e-mail/tél + délai rejouabilité (24/48h) + action suivante automatique + 1 réglage back-office (on/off + délai + liste d'actions) | OTP, vue historique détaillée, fingerprint | **2–4 jours** |
| **Intermédiaire** | + config back-office complète (ordre des actions en glisser-déposer) + vue historique joueur | OTP | **+2–3 jours** |
| **Complète** | + vérification OTP SMS/e-mail (code unique, expiration, limites tentatives/envois) | — | **+3–5 jours** (+ coûts SMS récurrents) |

Ce qui peut rallonger : la refonte du tunnel de jeu (saisie e-mail au début), les tests anti-fraude, et l'intégration SMS.

### Ordre de priorité recommandé
1. Détection du joueur (e-mail/tél) — *déjà presque là*
2. Délai de rejouabilité 24/48h
3. Historique des actions déjà faites
4. Choix automatique de la prochaine action
5. Configuration back-office (délai + liste d'actions)
6. Messages joueur
7. *(plus tard)* Vérification SMS/e-mail
8. *(continu)* Sécurité anti-fraude

### Recommandation finale
- **Rejouabilité + actions progressives → « À faire en version simple d'abord » (MVP).** Vrai levier de valeur, effort raisonnable.
- **Vérification OTP SMS/e-mail → « À reporter ».** Trop de friction + coût pour un bénéfice anti-fraude que la détection e-mail/tél + délai couvre déjà à 80 %.
- **Gating d'avis Google → « À éviter tel quel »**, reformuler en action *facultative et non notée* (conforme).
