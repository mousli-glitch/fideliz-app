# 🔒 Plan RGPD Fidéliz — Analyse complète & mise en conformité

> ⚠️ Je ne suis pas juriste. Ce plan couvre les obligations RGPD techniques et organisationnelles
> de façon complète et pratique, mais pour un lancement commercial, fais relire la politique de
> confidentialité et le contrat de sous-traitance par un professionnel du droit.

---

## 1. Cartographie des données personnelles (ce que l'appli collecte réellement)

**Côté joueurs** (formulaire de jeu, après avoir gagné) :
- Prénom (obligatoire), e-mail (obligatoire), téléphone (facultatif)
- Consentement marketing (case à cocher) + date du consentement (`marketing_optin_at`)
- Historique : lot gagné, date, statut (gagné / validé), date d'expiration

**Côté professionnels** (comptes) :
- E-mail des restaurateurs et commerciaux (table `auth.users` + `profiles`)

**Où c'est stocké :** Supabase, tables `winners` et `contacts` (joueurs), `auth.users`/`profiles` (comptes).

---

## 2. Ce qui est DÉJÀ bon ✅

- **Hébergement en Europe** : ta base Supabase est en région **eu-central-1 (Francfort)**. Les données restent dans l'UE — excellent point de conformité.
- **Consentement marketing correct** : la case à cocher est **non pré-cochée** par défaut, distincte de l'action de jouer, et libellée clairement. C'est conforme.
- **Preuve du consentement** : la date `marketing_optin_at` est enregistrée → tu peux prouver quand le consentement a été donné.
- **Sécurité** : données protégées (RLS, accès via serveur uniquement, protection des mots de passe compromis activée). La sécurité est une obligation RGPD — c'est couvert.
- **Droit de suppression techniquement possible** : l'admin peut supprimer un contact (CRM), et les cascades nettoient les données liées.

---

## 3. Ce qu'il MANQUE (à mettre en place) 🔴

### a) Qui est responsable des données ? (point structurant pour un SaaS)
Dans ton modèle, le **restaurant est le « responsable de traitement »** (c'est lui qui exploite la relation client), et **Fidéliz est le « sous-traitant »** (tu traites les données pour son compte). Conséquences :
- Il te faut un **contrat de sous-traitance (DPA)** signé avec chaque restaurant client (obligatoire, article 28 RGPD).
- La politique de confidentialité doit nommer le **restaurant** comme responsable et **Fidéliz** comme sous-traitant.

### b) Politique de confidentialité — **absente** (à créer)
Aucune page légale n'existe aujourd'hui. Il faut une page accessible décrivant : données collectées, finalités, base légale, durée de conservation, destinataires/sous-traitants, droits, contact. → Page `/confidentialite`.

### c) Information au moment de la collecte — **absente** (à ajouter)
Le formulaire de jeu ne contient aucune mention d'information ni lien vers la politique. Il faut ajouter sous le formulaire un court texte + lien : *« Vos données sont traitées par [restaurant] pour gérer votre participation et, avec votre accord, vous envoyer des offres. Voir notre politique de confidentialité. »*

### d) Durée de conservation — **non définie** (à décider)
Il faut une règle, par ex. : **suppression des contacts inactifs après 24 ou 36 mois**. À automatiser plus tard (tâche planifiée).

### e) Sous-traitants à déclarer
Dans la politique, lister tes sous-traitants techniques :
- **Supabase** (hébergement base de données, UE)
- **Vercel** (hébergement de l'application)
- **Twilio** (envoi de SMS aux gagnants, **États-Unis** → à mentionner + vérifier les garanties de transfert) — uniquement si tu utilises les SMS.

### f) Droits des personnes — **process à formaliser**
Techniquement possible, mais il faut une **adresse de contact** (ex. `contact@fideliz.net`) et une procédure simple pour traiter les demandes d'accès / rectification / suppression sous 1 mois.

---

## 4. Cookies — faible enjeu ✅
L'appli n'utilise que des **cookies fonctionnels** (connexion Supabase de l'espace admin), qui sont **exemptés** de bandeau de consentement. Aucun cookie de pub/traçage détecté. → Pas de bandeau cookies nécessaire pour l'instant (à réévaluer si tu ajoutes des outils d'analyse type Google Analytics).

---

## 5. Plan d'action priorisé

| Priorité | Action | Type |
|---|---|---|
| 🔴 1 | Créer la **page Politique de confidentialité** (`/confidentialite`) | Code |
| 🔴 2 | Ajouter la **mention d'information + lien** sous le formulaire de jeu | Code |
| 🔴 3 | Rédiger un **modèle de contrat de sous-traitance (DPA)** à signer avec chaque restaurant | Document |
| 🟠 4 | Définir et afficher la **durée de conservation** | Décision + Code |
| 🟠 5 | Mettre une **adresse de contact RGPD** + procédure de traitement des demandes | Organisation |
| 🟢 6 | Plus tard : **suppression automatique** des contacts inactifs (tâche planifiée) | Code |

---

## 6. Ce que je te propose de faire ensemble (concret)
1. Je crée la **page `/confidentialite`** (un modèle complet et adapté à ton appli, à personnaliser avec tes mentions).
2. J'ajoute la **mention + lien** sous le formulaire de jeu.
3. Je te fournis un **modèle de DPA** (contrat de sous-traitance) à faire signer à tes clients.

Les points 1 et 2 sont du code (rapide, sûr). Le point 3 est un document à part.
