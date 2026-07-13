# Fidéliz — Récapitulatif anti-fraude & validation des contacts

Ce document résume les protections en place contre les faux contacts et les abus, côté jeu client.
Principe général : **bloquer uniquement ce qui est clairement faux/abusif, sans jamais bloquer un vrai client.**

---

## 1. Validation du numéro de téléphone

Fichier : `utils/contact-validation.ts` (fonction `validatePhone`).

**Règles de blocage :**

- **Mobile obligatoire** : le numéro doit commencer par **06** ou **07**. Les numéros fixes (01–05), spéciaux (08, 09) et formats invalides sont refusés.
- **Format** : 10 chiffres. Les espaces, points, tirets sont ignorés ; `+33` est converti en `0` automatiquement.
- **Numéros bidons** : refusés si trop peu de chiffres différents (ex. `0600000000`, `0611111111`).
- **Suites** : refusées (ex. `0612345678`).
- **Motifs en escalier / alternés** : refusés (ex. `0601020304`, `0602030405`, `0678787878`).

**Exemples :**

| Saisie | Résultat |
|---|---|
| `0699887766`, `0756143928` (vrais mobiles) | ✅ accepté |
| `0600000000`, `0611111111` | ❌ bloqué (bidon) |
| `0612345678` (suite) | ❌ bloqué |
| `0601020304` (escalier) | ❌ bloqué |
| `0145236789` (fixe) | ❌ bloqué (pas 06/07) |

**Limite connue :** un faux numéro « crédible » (chiffres aléatoires mais plausibles) ne peut pas être détecté. Seul un **code SMS** le garantirait (payant — reporté).

---

## 2. Validation de l'adresse e-mail

Fichier : `utils/contact-validation.ts` (fonction `validateEmail`).

**Règles de blocage :**

- **Format** invalide → refusé.
- **Domaines jetables / temporaires** (yopmail, mailinator, guerrillamail, 10minutemail, etc.) → refusés. La liste est dans `DISPOSABLE_EMAIL_DOMAINS` — ajouter un domaine = une ligne.

**Non bloqué (choix assumé) :** les adresses « aux lettres au hasard » mais bien formées (ex. `xk3j9fh@gmail.com`) sont acceptées, car essayer de les détecter bloquerait trop de vrais clients (faux positifs). Seule une **confirmation par e-mail** le garantirait (friction — reporté).

---

## 3. Où la validation s'applique

- **À la saisie (côté client)** : message clair au joueur, à l'étape formulaire et à l'étape identification (rejouabilité).
- **Côté serveur (impossible à contourner)** : `app/actions/register-winner.ts` et `app/actions/check-replay.ts` re-vérifient tout. Un contact invalide renvoie `invalid_email` / `invalid_phone`.
- Les numéros sont **normalisés** (`+33`→`0`, espaces retirés) avant enregistrement — ce qui améliore aussi la détection des rejeux.

---

## 4. Limite de fréquence par IP (anti-spam rapide)

Fichier : `app/actions/register-winner.ts` — colonne `winners.ip_hash`.

**Comment ça marche :** à chaque participation, l'adresse IP est **hachée** (jamais stockée en clair, RGPD) et on compte les participations venues de cette IP dans la **dernière heure**. Au-delà du seuil, la participation est refusée (« Trop de participations depuis cet appareil »).

**Seuil réglable par jeu** : champ « Anti-triche : participations max / heure / appareil » dans la config du jeu (`games.ip_rate_limit_per_hour`, défaut **5**).

**⚠️ Point important — WiFi partagé :** dans un restaurant, les clients sur le **même WiFi** partagent la même IP. Il ne faut donc **pas** mettre une valeur trop basse (ex. 1) si les clients jouent sur le WiFi du resto, sinon de vrais clients seraient bloqués. Recommandations :

- Clients sur le **WiFi du restaurant** → valeur **haute** (10–15).
- Clients sur leur **propre 4G** → valeur **basse** possible (1–2).

Ce n'est **pas** un blocage par personne : la limite « une seule fois » par personne est assurée par l'e-mail/téléphone unique (rejouabilité OFF) et le délai (rejouabilité ON).

---

## 5. Ce que ça couvre — et ce que ça ne couvre pas

**Bien couvert :** numéros bidons/motifs, numéros non-mobiles, e-mails jetables, formats invalides, spam rapide depuis un même appareil, rejeu avec le même e-mail/téléphone.

**Non couvert (nécessiterait un code SMS/e-mail, payant/friction — reporté) :** faux numéro « crédible », e-mail aléatoire bien formé, fraudeur qui change d'IP (4G ↔ WiFi) pour espacer ses tentatives.

---

## 6. RGPD

- L'IP est **pseudonymisée (hachée)**, jamais conservée en clair, utilisée **uniquement** pour la prévention de la fraude.
- Mention ajoutée dans la page **/confidentialite** (section « données collectées »).
