/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  UNE SUPPRESSION DE RESTAURANT DOIT POUVOIR SE REPRENDRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Signalé le 19/08/2026, et c'est juste : le commentaire de
 * `deleteRestaurantFullAction` affirmait qu'après une panne de comptage
 * « l'appel est rejouable ». Il ne l'était pas. Le restaurant était DÉJÀ
 * supprimé ; au second appel, la première lecture ne retrouvait plus la
 * ligne, donc plus le propriétaire, et l'action n'avait aucun moyen de
 * reprendre. Même impasse quand la suppression du compte échouait après
 * celle du restaurant : la réponse annonçait `restaurantSupprime: true` et
 * personne ne pouvait plus rien en faire.
 *
 * Deux corrections, dont une seule est ici.
 *
 *   — Dans le code : toutes les lectures qui peuvent échouer passent AVANT
 *     l'irréversible. Une panne de comptage ne laisse plus d'état partiel,
 *     elle annule l'opération entière avant qu'elle ne détruise quoi que ce
 *     soit.
 *
 *   — Ici : une INTENTION DURABLE, écrite avant l'irréversible. Elle porte
 *     le propriétaire RÉEL — lu sur la ligne restaurant, jamais reçu de
 *     l'appelant — et la décision déjà prise sur son compte. Quand le
 *     restaurant a disparu, c'est elle, et elle seule, qui permet à un
 *     second appel de reprendre l'opération à l'identique.
 *
 * ─── POURQUOI PAS LE JOURNAL EXISTANT ───
 *
 * `system_logs` était le candidat évident. Il est disqualifié par sa propre
 * règle, écrite dans `lib/securite/journal.ts` : « Le journal ne bloque
 * jamais l'action. Si l'écriture échoue, la route continue. » Un registre
 * dont on accepte qu'il perde des lignes ne peut pas servir de point de
 * reprise — c'est précisément la ligne perdue qui rendrait l'opération
 * irrattrapable. L'intention, elle, est bloquante : si elle ne s'écrit pas,
 * rien n'est détruit.
 *
 * ─── CE QUE CETTE TABLE N'EST PAS ───
 *
 * Ce n'est pas un journal d'audit (c'est `system_logs`), ni une file de
 * travail asynchrone : rien ne la consomme en arrière-plan. C'est l'état
 * d'une opération en cours, lu par la seule action qui l'écrit.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Cette migration doit être appliquée AVANT le code qui l'utilise. Sans la
 * table, l'écriture d'intention échoue — et comme elle précède l'irréversible,
 * l'action refuse au lieu de détruire. La dégradation est sûre, mais elle est
 * totale : aucune suppression de restaurant ne passe. Migration d'abord.
 *
 * ─── HORS GEL ───
 *
 * `suppressions_restaurant` n'entre PAS dans le gel de bascule, et c'est un
 * choix, pas un oubli.
 *
 * Le gel suspend les écritures sur les données CLIENT le temps d'une
 * bascule. Cette table n'en est pas : elle décrit l'état d'une opération de
 * l'outillage. La geler produirait exactement ce que le gel cherche à
 * éviter — une suppression déjà commencée qui ne peut plus enregistrer où
 * elle en est, donc un état partiel sans trace. Le gel arrête de toute façon
 * l'opération une ligne plus loin, en refusant la suppression du restaurant
 * lui-même.
 *
 * Elle n'est pas non plus migrée vers Cartiz : elle ne porte aucune donnée
 * métier, seulement des opérations en cours au moment de la bascule, qui
 * doivent être terminées AVANT et non transportées.
 *
 * MIGRATION ADDITIVE : aucune table existante n'est touchée.
 */

create table if not exists public.suppressions_restaurant (
  /*
   * Le restaurant, en clé primaire : une seule opération de suppression par
   * restaurant, et la reprise se fait par cet identifiant — le seul dont
   * l'appelant dispose encore quand la ligne a disparu.
   *
   * Volontairement SANS clé étrangère vers `restaurants` : cette ligne doit
   * survivre à la suppression du restaurant, c'est toute sa raison d'être.
   */
  restaurant_id uuid primary key,

  /*
   * Le propriétaire RÉEL, lu sur la ligne restaurant au moment de la
   * décision. C'est la valeur autoritative de la reprise : au second appel,
   * on ne redemande rien à l'appelant.
   */
  owner_id   uuid,
  owner_role text,

  /*
   * La décision, prise AVANT l'irréversible, à partir d'un comptage
   * positivement réussi. On ne la recalcule pas à la reprise : le restaurant
   * a disparu, le comptage ne rendrait plus la même chose.
   */
  compte_a_supprimer boolean not null default false,

  /*
   *   intention           — décision prise, rien n'est encore détruit
   *   restaurant_supprime — l'irréversible a eu lieu, le compte reste à traiter
   *   termine             — plus rien à faire
   *
   * `restaurant_supprime` est un repère d'observation, pas une condition de
   * reprise : si sa mise à jour échouait, l'étape resterait à « intention »
   * alors que le restaurant est parti. La reprise se déclenche donc sur
   * « restaurant absent + intention non terminée », quelle que soit l'étape
   * enregistrée.
   */
  etape text not null default 'intention'
    check (etape in ('intention', 'restaurant_supprime', 'termine')),

  demandeur  uuid,
  resultat   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.suppressions_restaurant is
  'Intention durable d''une suppression de restaurant : porte le propriétaire réel et la décision prise avant l''irréversible, pour qu''un second appel puisse reprendre. Écrite et lue par deleteRestaurantFullAction uniquement.';

-- Retrouver les opérations restées ouvertes, sans balayer la table.
create index if not exists suppressions_restaurant_ouvertes_idx
  on public.suppressions_restaurant (created_at)
  where etape <> 'termine';

/*
 * ─── RLS deny-by-default ───
 *
 * RLS activée SANS aucune policy : personne ne passe par ce chemin. Le seul
 * accès légitime est `service_role`, qui contourne RLS — mais qui a quand
 * même besoin des droits de table pour passer par PostgREST.
 *
 * Aucun droit DELETE, à personne : une intention ne s'efface pas depuis
 * l'application. C'est la trace de ce qui reste à finir.
 */
alter table public.suppressions_restaurant enable row level security;
alter table public.suppressions_restaurant force row level security;

revoke all on table public.suppressions_restaurant from public, anon, authenticated;
grant select, insert, update on table public.suppressions_restaurant to service_role;

-- PostgREST ne voit une table nouvelle qu'après rechargement de son cache.
notify pgrst, 'reload schema';
