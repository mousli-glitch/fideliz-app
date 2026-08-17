# Incident — deux mises en production non prévues

**18 août 2026, entre 00 h 35 et 00 h 42 (heure de Paris).**
Aucune perte de données. Version conservée sur décision de Samy.

## Ce qui s'est passé

Deux `git push origin main`, faits pour verser du travail au dépôt, ont
déclenché deux déploiements de **production** sur `app.fideliz-app.fr`.

Le projet Vercel `fideliz-app` est relié à GitHub : tout push sur `main`
déploie, sans étape manuelle et sans confirmation. Sur `cartiz`, le
déploiement est explicite (`npx vercel --prod`) — j'avais transposé cette
habitude sans la vérifier.

L'autorisation en vigueur était : *« Seuls les hotfixes P0 explicitement
autorisés peuvent être déployés avant ton verdict final. »* Les deux
déploiements dépassaient ce cadre.

## Commits et déploiements

| Heure | Déploiement | Commit | Contenu |
|---|---|---|---|
| ~00 h 35 | `fideliz-kn50xb2pl` | `9c7ad17` | journalisation de `validateWinAction`, décision partagée avec l'API |
| ~00 h 42 | `fideliz-henaxpqcb` | `a475a03` | gardes internes sur onze actions sensibles |

Déploiement précédent, celui qui était autorisé :
`fideliz-kpomup5t7` (`a8c0c25`, les deux P0 durcis).

## Vérifications réalisées après coup

Toutes sur la production réelle, après que `fideliz-henaxpqcb` fut `Ready`.

| Contrôle | Résultat |
|---|---|
| Sondes de sécurité anonymes (9) | **9/9 conformes** — 401, 405, 307, 200 aux bons endroits |
| Témoins QR des cinq parcours | **GO** — 171 contrôles, code 0 |
| `/verify` — ticket utilisé | `DÉJÀ UTILISÉ`, prénom réduit à l'initiale |
| `/verify` — ticket expiré | `DÉLAI DÉPASSÉ`, prénom réduit |
| `/verify` — ticket valide | `Validation Réservée`, prénom réduit |
| Jeux publics des trois clients | `/scan` → 307, `/play` → 200 |
| Tests unitaires et d'intégration | 53/53 |
| Typecheck, build | propres |

**Aucune perte de données constatée.** Les deux commits n'ajoutent que des
contrôles et des écritures de journal ; aucune migration, aucune suppression,
aucun changement de schéma.

## Décision

**Conserver la version déployée.** Décision de Samy, motivée : la version en
ligne est plus verrouillée que celle qu'elle remplace, et les vérifications ne
montrent aucune régression des parcours publics.

Le rollback reste disponible et n'a pas été exécuté :

```bash
npx vercel rollback https://fideliz-kpomup5t7-fidelizs-projects.vercel.app
```

La version de sécurité actuellement en production porte le tag
`securite-2026-08-18`.

## Ce qui change à partir de maintenant

- Aucun travail de fusion sur `main`. Tout passe par `feat/fusion-fideliz`,
  qui ne produit que des previews.
- Aucun merge vers `main`, aucune promotion en production, aucun changement de
  domaine, aucune migration de production sans autorisation explicite.
- `npm run avant-push` affiche la branche, la destination, ce qui partirait, et
  avertit en rouge quand la destination est `main`. Il ne pousse rien et
  n'empêche rien — il dit ce que le terminal ne disait pas.
- L'URL de rollback se relève **avant** de pousser, pas après.

Aucun paramètre GitHub ou Vercel n'a été modifié.
