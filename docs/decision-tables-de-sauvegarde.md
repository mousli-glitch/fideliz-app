# Les quatre tables de sauvegarde — décision attendue de Samy

**Instruit le 19/08/2026.** Je ne tranche pas : c'est une décision de rétention
de données personnelles, donc une règle produit. Ce document retire toute
incertitude autour du choix, et propose une recommandation motivée.

---

## Le fait qui change tout

Ces tables ne sont **pas** des copies redondantes. Mesuré en lecture seule :

| Table | Lignes | Encore présentes dans la table vive | Portent un e-mail |
|---|---|---|---|
| `contacts_backup_20260606` | 52 | **0 sur 52** | 52 |
| `winners_backup_20260606` | 64 | **0 sur 64** | 64 |
| `auth_ghosts_backup_20260606` | 16 | sans équivalent vif | — |
| `auth_orphan_backup_20260606` | 1 | sans équivalent vif | — |

**Aucune** des lignes sauvegardées n'existe encore ailleurs. Ce sont les
**seuls exemplaires** restants des données de 116 personnes, figées lors d'un
nettoyage daté du 6 juin 2026.

Je m'attendais à trouver des doublons de commodité. C'est l'inverse.

---

## Les deux conséquences, qui tirent en sens opposés

**Les supprimer détruit ce qui n'existe nulle part ailleurs.** Il n'y a pas de
retour arrière : ni la table vive, ni l'archive, ni une autre sauvegarde ne
porte ces lignes.

**Les garder, c'est conserver des données personnelles sans règle de
rétention.** `anonymize_expired_data()` ne touche que `winners` et `contacts` —
jamais ces quatre tables. Elles échappent donc à la politique d'anonymisation,
indéfiniment, et les 116 lignes portent toutes un e-mail.

C'est précisément la tension qu'une décision doit trancher, et elle ne se
tranche pas techniquement.

---

## Ce qui est déjà en place, et qui ne suffit pas

- **RLS active, aucune policy** sur les quatre : personne n'y accède hors
  `service_role`. La fermeture est correcte.
- **Aucun code applicatif ne les lit.** Les seules références sont
  `scripts/sauvegarde-logique.mjs` (qui les inclut dans la sauvegarde logique)
  et la baseline qui les crée.

Fermées et inutilisées — mais toujours là, et toujours nominatives.

---

## Les trois options

### A — Anonymiser sur place, garder la structure

Appliquer aux quatre tables la même règle que `anonymize_expired_data` :
prénom à `Anonyme`, e-mail et téléphone à `NULL`.

- Ce qui survit : les volumes, les dates, les rattachements — tout ce qui sert
  à comprendre ce qui s'est passé le 6 juin.
- Ce qui disparaît : l'identité des 116 personnes.
- **Réversible ?** Non pour les identités. Oui pour tout le reste.

### B — Supprimer les quatre tables

- Ce qui survit : rien.
- **Réversible ?** Non.

### C — Ne rien faire

- Ce qui survit : tout, y compris 116 e-mails sans règle de rétention.
- **Réversible ?** Oui, à tout moment — c'est la seule option qui laisse les
  deux autres ouvertes.

---

## Ma recommandation : A, et pas tout de suite

**A**, parce qu'elle répond à la seule vraie question — pourquoi garder
l'identité de 116 personnes dont les comptes ont été nettoyés il y a deux
mois — sans détruire la trace de l'opération elle-même. Une sauvegarde sert à
comprendre ce qui a été fait ; elle n'a pas besoin de noms pour ça.

**Pas tout de suite**, parce que rien ne presse et que B et C restent
accessibles depuis A seulement en partie. L'ordre raisonnable :

1. copier les quatre tables telles quelles hors de la base, **une fois**, dans
   la sauvegarde logique (le script les inclut déjà) ;
2. vérifier cette copie ;
3. puis seulement appliquer A.

Sans l'étape 1, A détruit une information qu'on ne saura pas reconstituer si
la décision change.

---

## Ce que je ne ferai pas sans ton accord écrit

Aucune de ces trois options. Ni anonymisation, ni suppression, ni
déplacement — y compris sur le banc, pour ne pas créer d'écart entre les deux
bases pendant que la question est ouverte.

## Question annexe, à trancher en même temps

La fusion doit-elle **emporter ces tables dans Cartiz** ?

Ma lecture : non, quelle que soit l'option retenue. Ce sont des vestiges d'un
nettoyage propre à Fideliz, sans usage applicatif. Les emporter reviendrait à
transporter dans un système neuf des données personnelles dont personne ne se
sert et que rien n'anonymise.

Si tu retiens A, la question se pose différemment : des lignes anonymisées
peuvent voyager sans difficulté — mais elles n'apportent rien à Cartiz non
plus.
