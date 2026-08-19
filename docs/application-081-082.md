# Habilitations et rétention — trace d'application

**Appliqué le 19 août 2026 sur la production Cartiz** (`rxdbotnuwfakukcbgeqo`).
Autorisation explicite de Samy : « applique 081 et 082 ».

---

## 081 — la table `habilitations`

Décisions P-12 (une table `restaurant × module`, écrite par le vendeur) et
P-13 (l'absence de droit vaut refus, avec backfill).

| | |
|---|---|
| Table créée | `habilitations`, PK `(restaurant_id, module)` |
| RLS | activée, **2 policies** — lecture au restaurant concerné, écriture à `sales`/`admin`/`root` uniquement |
| Backfill | **6 lignes**, déduites de l'usage, aucun slug en dur |

### Le résultat, tel qu'il est en base

| Restaurant | Modules accordés |
|---|---|
| `best-pizza` | `carte`, `fidelite` |
| `chez-samy` | `carte`, `fidelite` |
| `la-ruche` | `carte` |
| `mpbmeru` | `fidelite` |
| `testmicro` | **aucun** — c'est P-13, et c'est voulu |

**`best-pizza` obtient `fidelite`** sur un unique client inscrit, zéro passage,
programme éteint. C'était le seul point laissé à l'arbitrage ; appliqué tel
quel, il suit ma recommandation — retirer un module dont un client final
détient déjà la carte Wallet, c'est casser quelque chose qui est dans une
poche. **Réversible** : une ligne `retire_le` suffit.

### Garanties vérifiées dans la transaction

Le backfill devait produire **exactement** ce que la simulation en lecture
seule annonçait — 3 `carte`, 3 `fidelite`, 1 restaurant sans droit. Un écart
annulait tout. Et le parc métier a été comparé avant/après : restaurants,
clients, passages, cartes, tous inchangés.

## 082 — la rétention sur `clients`

Décision P-15. Fonction `anonymiser_donnees_expirees()`, tâche planifiée à
**4 h** — après le moteur d'automatisations, et à une heure qui n'entrera pas
en collision avec l'anonymisation Fideliz (`0 3`) ni son archivage (`10 3`) le
jour où les deux bases n'en feront plus qu'une.

### Elle a été JOUÉE dans sa propre transaction

Une fonction posée sans avoir jamais tourné n'est pas une fonction prouvée.
Elle a donc été exécutée avant le `commit`, avec l'exigence de rendre **0
partout** — clients, messages push, messages de cartes. Un seul chiffre non nul
annulait la pose.

Résultat : `0 / 0 / 0`. Conforme à la simulation. **17 clients nominatifs, 38
messages, 14 push conservés — intacts.**

## Les types TypeScript : greffés, pas régénérés

CLAUDE.md impose de régénérer les types après migration. **Une régénération
aveugle casse le build.**

`supabase gen types` produit aujourd'hui trois types **plus larges** que ceux
dont le code dépend :

| Champ | Fichier versionné | Sortie du CLI |
|---|---|---|
| `flyer_pages.mode` | `"simple" \| "double" \| "ecran"` | `string` |
| `loyalty_settings` (×2) | `number \| undefined` | `number \| null` |

Le fichier avait été resserré **à la main, délibérément**, et
`app/app/flyer/page.tsx` comme `lib/actions/fidelite.ts` s'appuient dessus —
trois erreurs `TS2322` au build.

J'ai donc greffé les deux objets neufs, verbatim depuis la sortie du CLI, à
leur place alphabétique, et laissé le reste intact. Vérifié : 29 tables au lieu
de 28, aucune perdue, le type étroit préservé.

⚠️ **Dette nommée** : ce fichier n'est plus reproductible par
`supabase gen types`. Le prochain qui le régénérera cassera le build sans
comprendre pourquoi. Soit on élargit les trois sites de code, soit on documente
le resserrement là où il se trouve.

## Vérifications finales

| | |
|---|---|
| Persistance | relue dans un appel séparé — 6 lignes, RLS, 2 policies, fonction et cron en place |
| `npm run build` | ✅ 198 tests, compilation verte |
| Témoin des QR imprimés | ✅ **GO**, code 0, en 17,4 s |

## Ce que rien ne fait encore

**Aucune route, aucun écran ne consulte `habilitations`.** Poser le droit et le
faire respecter sont deux gestes. Le second est du travail applicatif, encadré
par P-11 — désormais tranchée et déployée.

## Ce qui n'a pas été éprouvé, et le reste

**Il n'existe toujours pas de banc à la forme de Cartiz.** Ces deux migrations
sont parties en production sans avoir jamais été jouées ailleurs — seules leurs
sélections avaient été simulées en lecture seule. La transaction, ses gardes et
l'exécution à blanc de la fonction ont remplacé la répétition ; ce n'est pas
équivalent.

C'est la troisième fois aujourd'hui que ce manque coûte quelque chose. Il
mérite d'être comblé avant la fusion.
