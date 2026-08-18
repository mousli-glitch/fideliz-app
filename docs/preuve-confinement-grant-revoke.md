# Preuve de confinement — reconstitution des appels GRANT/REVOKE

Fichier local, non destiné à Git par défaut (à committer seulement si Samy le
demande explicitement — il ne contient aucun secret mais reconstitue un
historique d'appels, ce qui n'a pas sa place dans l'historique versionné sans
décision explicite). Aucune URL, référence de projet, connexion, clé ni
secret. Les environnements sont désignés par alias.

## Pourquoi ce document existe

La stabilité des empreintes de production (mesurée avant et après, identique
sur les 11 dimensions) prouve l'**état final** de la production. Elle ne
prouve PAS, à elle seule, l'absence d'une mutation transitoire : une
production dont l'ACL aurait été modifiée puis restaurée dans la fenêtre de
mesure présenterait la même empreinte stable sans que rien n'ait jamais
bougé de façon visible. C'est la reconstitution des CIBLES de chaque appel —
quel environnement, dans quel ordre — qui ferme réellement l'ambiguïté, pas
la seule empreinte.

## Alias des environnements

| Alias | Référent |
|---|---|
| `PROD` | le projet de production Fideliz |
| `SYNTH` | la branche synthétique déjà active, utilisée tout au long de cette séance |

## Reconstitution — démonstration `preuve-acl-avis` (faux vert de la v1)

Ordre exact des appels de mutation (GRANT/REVOKE) effectués pour cette
démonstration spécifique, dans l'ordre où ils ont été émis :

| # | Cible | Opération |
|---|---|---|
| 1 | `SYNTH` | `grant truncate on public.avis to public;` |
| 2 | `SYNTH` | (lecture — aucune mutation) mesure ancienne logique (aclexplode) |
| 3 | `SYNTH` | (lecture — aucune mutation) mesure nouvelle logique (has_table_privilege) |
| 4 | `SYNTH` | `revoke truncate on public.avis from public;` |
| 5 | `SYNTH` | (lecture — aucune mutation) vérification retour à l'état initial |

**Aucun appel de cette séquence n'a ciblé `PROD`.** Les seuls appels ayant
ciblé `PROD` dans cette fenêtre étaient des lectures (`select`) — inventaire
des privilèges par défaut, ACL de `avis`, empreintes des 11 dimensions — et
une exécution du bloc `do $$ ... raise exception/notice $$` de la sentinelle,
qui ne contient aucune instruction `grant`, `revoke`, `alter`, `insert`,
`update`, `delete` ni `create` : uniquement des `select ... into` suivis de
`raise`.

## Reconstitution — les autres cycles GRANT/REVOKE de la séance

Tous les autres cycles GRANT/REVOKE/ALTER DEFAULT PRIVILEGES/CREATE ROLE/DROP
ROLE de cette séance (scénarios de la sentinelle, harnais, couches 1/2/3,
couche 4) ont ciblé exclusivement `SYNTH`, selon le même schéma : seed →
mesure (lecture) → nettoyage → vérification (lecture). Aucun de ces cycles
n'a jamais désigné `PROD` comme cible d'une instruction de mutation.

## Ce qui ferme l'ambiguïté

1. Chaque appel de mutation porte, dans son invocation, l'identifiant du
   projet ciblé — jamais implicite, jamais par défaut. Un appel visant
   `SYNTH` ne peut pas atteindre `PROD` par erreur de contexte : ce sont deux
   identifiants distincts, passés explicitement à chaque appel.
2. L'ordre des appels ci-dessus est celui effectivement émis, reconstitué
   depuis l'historique de la conversation — pas déduit après coup.
3. Combiné à la stabilité des empreintes (état final identique), la
   reconstitution des cibles ferme les deux moitiés de la preuve : ni un
   changement transitoire non observé (aucun appel de mutation n'a visé
   `PROD`), ni un changement final non détecté (empreintes stables).
