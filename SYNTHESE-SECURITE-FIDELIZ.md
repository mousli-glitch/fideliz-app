# Fidéliz — Synthèse : résolution du problème client & renforcement de la sécurité

## 1. Le problème signalé par le client

Le gérant de **Best Pizza** a remonté qu'une personne, dans son restaurant, avait montré qu'on pouvait **« choisir son lot »** : en relançant la roue plusieurs fois jusqu'à tomber sur le lot voulu, puis en ne validant qu'à ce moment‑là. À cela s'ajoutait la crainte de **fausses coordonnées** (numéros de téléphone et adresses e‑mail bidons) utilisées pour participer plusieurs fois.

## 2. Ce qu'on a vérifié (pour ne pas travailler à l'aveugle)

- En base, sur Best Pizza : **14 participations, 0 doublon** d'e‑mail ni de téléphone → la règle « un e‑mail = une seule participation » fonctionnait déjà.
- **Le vrai trou** était ailleurs : dans le déroulé du jeu, on tournait la roue **avant** de laisser ses coordonnées (enregistrées seulement à la fin). On pouvait donc recharger la page et relancer la roue jusqu'au lot souhaité, puis valider. C'est exactement ce que la personne avait exploité.

## 3. Les solutions mises en place (plusieurs couches de protection)

| Protection | Ce que ça fait | Résultat |
|---|---|---|
| **Mode sécurisé** (réglable par jeu) | Le client s'identifie **avant** la roue ; le **lot est tiré par le serveur** et enregistré dès le 1er tour ; la roue ne fait qu'afficher le résultat | Impossible de rejouer, de choisir son lot ou de forcer le résultat |
| **Téléphone obligatoire** (en mode sécurisé) | Le numéro devient une 2ᵉ clé unique, en plus de l'e‑mail | Plus difficile de multiplier les participations |
| **Faux numéros bloqués** | Seuls les vrais mobiles (06/07) ; refus des numéros bidons (0600000000), suites (0612345678) et motifs en escalier (0601020304) | Base de contacts propre |
| **Fausses adresses e‑mail bloquées** | Refus des formats invalides et des adresses jetables/temporaires | Contacts fiables |
| **Limite par appareil (IP)** | Plafond du nombre de participations par heure et par appareil (réglable) ; IP **stockée hachée** (RGPD) | Stoppe le spam rapide sans bloquer les vrais clients d'un même WiFi |
| **Une participation par personne** | Blocage par e‑mail et par téléphone (déjà en place, renforcé) | Chacun joue une fois (sauf rejouabilité activée) |

## 4. Souplesse : chaque restaurant décide

- **Best Pizza** → mode sécurisé **activé** (c'est lui qui avait le souci).
- **La Ruche** → mode **fluide conservé** (aucune triche constatée), pour ne pas ajouter de friction et préserver les avis Google.
- Tous ces réglages sont **activables/désactivables par jeu**, au cas par cas.

## 5. Améliorations complémentaires réalisées dans la foulée

- **Design** des cartes de saisie modernisé et unifié (champs à icônes, boutons soignés), identique au début et à la fin du parcours.
- **RGPD** : mentions légales complètes sur les deux cartes + ajout de l'IP pseudonymisée dans la politique de confidentialité.
- **Stock** : correction d'un bug où des lots « illimités » étaient enregistrés à 0 (donc ingagnables) → réparés, affichage « ∞ Illimité ».
- **Parité création/modification** : rejouabilité, filtre de fond et stock désormais disponibles aussi à la création d'un jeu.
- **Abonnements** : arrêt automatique du jeu à l'échéance, bandeau de renouvellement pour le gérant, contrôles dans l'admin (+1 an / durée personnalisée) et rappel hebdomadaire des échéances.
- **Sécurité back‑office** : suppression d'un restaurant ou d'un commercial sécurisée (plus de risque d'effacer un compte admin).

## 6. Résultat final

Le jeu est désormais **fiable, équitable et sécurisé** : on ne peut plus choisir son lot ni tricher facilement, la base de contacts est propre, la conformité RGPD est renforcée, et chaque restaurant peut choisir entre sécurité maximale et tunnel plus fluide selon son besoin.
