# Prompt RGPD « clé en main » pour ChatGPT

> Copie tout le bloc ci-dessous dans ChatGPT (GPT-5 / o-series de préférence). Il contient le
> contexte technique réel de ton appli. **Avant d'envoyer**, remplace les champs entre [CROCHETS]
> par tes vraies infos (liste en bas de ce fichier).

---

## ⬇️ À COPIER DANS CHATGPT ⬇️

Tu es juriste spécialisé en protection des données (RGPD / droit français et européen, doctrine CNIL à jour 2026). Tu rédiges des documents de conformité **clairs, complets et prêts à publier**, en français. Quand une information manque ou nécessite un arbitrage juridique, signale-le explicitement plutôt que d'inventer.

### Contexte de mon entreprise et de mon produit

- **Produit** : « Fidéliz », une plateforme SaaS en marque blanche de **jeux marketing par QR code** pour commerces de proximité (restaurants, cafés, salons, boutiques). Le commerçant propose un jeu (roue de la chance / scratch) à ses clients. Le client scanne un QR code, remplit un court formulaire, gagne un lot, et le récupère en magasin (le ticket gagnant est un QR validé en caisse par le personnel).
- **Modèle de responsabilité** : le **commerçant** (le restaurant/commerce client de Fidéliz) est **responsable de traitement** des données de ses joueurs ; **Fidéliz** est **sous-traitant** (article 28 RGPD), car il traite les données pour le compte du commerçant.
- **Technologie & hébergement** : application web (Next.js) hébergée sur **Vercel** ; base de données et authentification sur **Supabase**, hébergées dans l'**Union européenne (centre de données de Francfort, Allemagne)**.

### Données personnelles traitées

**Joueurs (clients des commerces) :**
- Prénom (obligatoire), adresse e-mail (obligatoire), numéro de téléphone (facultatif).
- Consentement marketing : case à cocher **non pré-cochée**, avec **horodatage** du consentement.
- Données de jeu : lot gagné, date de participation, statut du gain (disponible / validé), date d'expiration du lot, identifiant de ticket (QR).
- Aucune donnée dite « sensible » n'est collectée.

**Professionnels (comptes commerçants et commerciaux) :**
- Adresse e-mail et mot de passe (haché, jamais lisible).

### Finalités et bases légales
- Gérer la participation au jeu et la remise du lot → base légale : exécution de la relation liée à la participation / intérêt légitime du commerçant.
- Envoyer des offres et actualités du commerçant (e-mail et éventuellement SMS) → base légale : **consentement** (case à cocher), retirable à tout moment.

### Destinataires et sous-traitants ultérieurs
- **Supabase** (hébergement base de données, UE).
- **Vercel** (hébergement de l'application).
- **Twilio** (envoi de SMS aux gagnants, société établie aux **États-Unis**) — [PRÉCISER : utilisé OUI/NON]. Si oui, transfert hors UE encadré par des clauses contractuelles types.
- Les données ne sont jamais vendues à des tiers.

### Mesures de sécurité en place
- Mots de passe hachés + vérification contre les fuites connues (HaveIBeenPwned).
- Contrôle d'accès par rôle (Row Level Security), accès aux données uniquement via le serveur.
- Hébergement dans l'UE, sauvegardes quotidiennes (rétention 7 jours).

### Durée de conservation
- [À DÉFINIR — ex. suppression des contacts inactifs après 36 mois].

### Cookies
- Uniquement des cookies strictement nécessaires au fonctionnement (connexion à l'espace professionnel). Aucun cookie publicitaire ou de traçage. (Donc, a priori, pas de bandeau de consentement cookies requis — confirme ce point.)

### Mes informations légales
- Société Fidéliz : [RAISON SOCIALE], [FORME JURIDIQUE], [ADRESSE COMPLÈTE], [SIRET], représentée par [NOM DU REPRÉSENTANT].
- Contact protection des données : [EMAIL DE CONTACT RGPD].
- Site / application : [URL — ex. https://jeu.fideliz.net].
- Public visé : grand public. [PRÉCISER si les mineurs peuvent jouer, et à partir de quel âge.]

### Ce que je te demande de produire
1. Une **Politique de confidentialité** complète et lisible, destinée aux **joueurs**, conforme RGPD/CNIL (toutes les rubriques : responsable & sous-traitant, données, finalités, bases légales, destinataires, transferts hors UE, durées, droits + modalités d'exercice, réclamation CNIL, cookies, sécurité, date de mise à jour).
2. Des **mentions légales** pour l'application.
3. Un **modèle de contrat de sous-traitance (DPA, article 28)** entre Fidéliz (sous-traitant) et chaque commerçant (responsable de traitement).
4. Un **registre des activités de traitement** (modèle synthétique).
5. Les **textes courts** à afficher au moment de la collecte : la mention d'information sous le formulaire de jeu + le libellé de la case de consentement marketing.
6. La **liste des informations qu'il me reste à compléter** et des **points nécessitant l'avis d'un avocat**.

Rédige le tout en français, structuré par documents, prêt à copier-coller. Pose-moi des questions si une information essentielle manque.

## ⬆️ FIN DU BLOC À COPIER ⬆️

---

## 📝 Les infos que TU dois préparer avant d'envoyer

Remplace ces [CROCHETS] dans le bloc ci-dessus :

1. **Raison sociale** de Fidéliz + **forme juridique** (auto-entreprise, SAS, SASU…)
2. **Adresse complète** du siège
3. **SIRET** (si déjà immatriculé)
4. **Nom du représentant légal**
5. **E-mail de contact RGPD** (ex. `contact@fideliz.net` ou `rgpd@fideliz.net`)
6. **URL finale** de l'appli (ex. `https://jeu.fideliz.net`)
7. **Twilio / SMS** : utilisé ou non ?
8. **Durée de conservation** souhaitée (ex. 24 ou 36 mois)
9. **Mineurs** : peuvent-ils jouer ? À partir de quel âge ?

> ⚠️ Même généré par ChatGPT, fais **relire le résultat par un avocat / DPO** avant publication commerciale. Un texte « presque conforme » peut suffire pour démarrer, mais la responsabilité juridique reste la tienne.
