/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  MIGRATEUR DU MINIMUM D'ACHAT — DRY-RUN PAR DÉFAUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ CE FICHIER N'EST PAS À JOUER SUR DES DONNÉES RÉELLES.
 *
 *  Il est en DRY-RUN par construction : il calcule ce qu'il ferait, l'affiche
 *  en agrégats, et ANNULE tout. Il n'existe aucun mode « appliquer » dans ce
 *  fichier, et c'est délibéré — l'application réelle demande la validation
 *  finale de Samy, qui l'a explicitement exigée.
 *
 *  ─── LA RÈGLE, DÉCIDÉE PAR SAMY LE 19/08/2026 ───
 *
 *  Elle porte sur des tickets déjà émis dont la condition affichée au client
 *  n'a jamais été appliquée. Deux cas, deux traitements :
 *
 *      TICKET DÉJÀ CONSOMMÉ ....... INCHANGÉ. La transaction a eu lieu, elle
 *                                   est close. On ne réécrit pas le passé,
 *                                   même pour le rendre cohérent.
 *
 *      TICKET ENCORE VALIDE ....... snapshot = le minimum AFFICHÉ, celui que
 *                                   le client a vu sur son ticket. C'est
 *                                   l'engagement qui lui a été présenté.
 *
 *  Le mot important est « affiché ». Le minimum réellement appliqué valait 0 ;
 *  le minimum annoncé valait 5,90. Samy a tranché pour l'annoncé — donc en
 *  faveur du client, et contre l'état de fait. Ce fichier applique cette
 *  règle-là, pas l'autre.
 *
 *  ─── LE TROISIÈME CAS, QUE JE SIGNALE PLUTÔT QUE DE LE DEVINER ───
 *
 *  Un ticket NI consommé NI encore valide : expiré, ou supprimé. Samy n'a
 *  nommé que deux cas. Traitement retenu : INCHANGÉ, comme un consommé — un
 *  ticket expiré ne peut plus être présenté en caisse, sa condition n'engage
 *  donc plus personne. C'est le choix conservateur, et il est réversible
 *  puisque la colonne reste nullable. Il est marqué à part dans le rapport
 *  ci-dessous pour qu'il puisse être revu, pas noyé dans un total.
 *
 *  ─── CE QUI DÉFINIT « CONSOMMÉ », MESURÉ DANS LE CODE ───
 *
 *  `status = 'available'` à l'émission ; la validation en caisse écrit
 *  `status = 'redeemed'` ET `redeemed_at` (`validate-win.ts`,
 *  `api/admin/winners/route.ts`). `consumed_at` existe en colonne mais aucun
 *  chemin d'écriture ne l'alimente — il est retenu quand même, par prudence :
 *  le compter comme consommé ne peut que PROTÉGER un ticket de la réécriture.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Transaction annulée à la fin, sans exception. Les sorties sont des
 *  agrégats : aucun identifiant, aucun nom, aucun montant individuel.
 *
 *  USAGE : script manuel, lecture. Ne jamais appliquer via `supabase db push`.
 */

begin;

-- Sans le contrat, ce migrateur n'a rien à écrire.
do $$
begin
  if to_regprocedure('public.centimes_depuis_saisie(text)') is null then
    raise exception 'MIGRATEUR INAPPLICABLE : la migration 20260819060000 n''est pas appliquée.';
  end if;
end $$;

-- ─────────────────────────── 1. Ce que deviendraient les JEUX

create temp view _jeux_a_reprendre as
select g.id,
       g.status,
       g.min_spend as texte_historique,
       case
         when g.min_spend_cents is not null then 'deja_renseigne'
         when btrim(coalesce(g.min_spend, '')) = '' then 'vide_aucun_minimum'
         when g.min_spend ~ '^[0-9]{1,6}$' then 'entier'
         when g.min_spend ~ '^[0-9]{1,6}[.,][0-9]{1,2}$' then 'decimal'
         else 'illisible'
       end as categorie
from public.games g;

select categorie,
       count(*) as jeux,
       count(*) filter (where status = 'active') as dont_actifs
from _jeux_a_reprendre
group by categorie
order by categorie;

-- ─────────────────────────── 2. Ce que deviendraient les TICKETS

create temp view _tickets_a_reprendre as
select w.id,
       /*
        * Consommé au sens large : trois signaux, et n'importe lequel suffit.
        * Se tromper dans ce sens PROTÈGE le ticket de la réécriture.
        */
       (w.status = 'redeemed' or w.redeemed_at is not null or w.consumed_at is not null) as consomme,
       (w.deleted_at is not null) as supprime,
       (w.expires_at is not null and w.expires_at <= now()) as expire,
       w.min_spend_cents_snapshot as snapshot_actuel,
       g.min_spend as texte_du_jeu
from public.winners w
join public.games g on g.id = w.game_id;

create temp view _decision as
select t.*,
       case
         when t.snapshot_actuel is not null           then 'deja_fige'
         when t.consomme                              then 'inchange_consomme'
         when t.supprime                              then 'inchange_supprime'
         when t.expire                                then 'inchange_expire'
         else                                              'a_figer_au_minimum_affiche'
       end as decision
from _tickets_a_reprendre t;

select decision,
       count(*) as tickets,
       /*
        * Pour la seule catégorie qu'on écrirait, on montre ce qui serait
        * écrit — en agrégat, jamais ticket par ticket.
        */
       count(*) filter (where decision = 'a_figer_au_minimum_affiche'
                          and public.minimum_effectif_centimes(null, null, texte_du_jeu) is null)
         as dont_montant_illisible,
       count(*) filter (where decision = 'a_figer_au_minimum_affiche'
                          and public.minimum_effectif_centimes(null, null, texte_du_jeu) = 0)
         as dont_sans_minimum,
       count(*) filter (where decision = 'a_figer_au_minimum_affiche'
                          and public.minimum_effectif_centimes(null, null, texte_du_jeu) > 0)
         as dont_minimum_reel
from _decision
group by decision
order by decision;

-- ─── 3. L'écriture, JOUÉE puis ANNULÉE : on prouve le résultat, on ne le garde pas

create temp table _avant_apres (etape text, valeur text) on commit drop;

insert into _avant_apres values ('snapshots_avant',
  (select count(*)::text from public.winners where min_spend_cents_snapshot is not null));

/*
 * Les jeux d'abord : le champ canonique est calculé depuis le texte
 * historique, et une valeur illisible est LAISSÉE À NULL au lieu de devenir
 * zéro. C'est tout l'objet du contrat.
 */
update public.games g
   set min_spend_cents = public.minimum_effectif_centimes(null, null, g.min_spend)
 where g.min_spend_cents is null;

/*
 * Les tickets ensuite, et UNIQUEMENT ceux que la règle de Samy désigne :
 * encore valides, non consommés, non supprimés, non expirés. Le minimum figé
 * est celui qui était AFFICHÉ.
 */
update public.winners w
   set min_spend_cents_snapshot = public.minimum_effectif_centimes(null, null, g.min_spend)
  from public.games g
 where g.id = w.game_id
   and w.min_spend_cents_snapshot is null
   and w.status = 'available'
   and w.redeemed_at is null
   and w.consumed_at is null
   and w.deleted_at is null
   and (w.expires_at is null or w.expires_at > now())
   and public.minimum_effectif_centimes(null, null, g.min_spend) is not null;

insert into _avant_apres values ('snapshots_apres',
  (select count(*)::text from public.winners where min_spend_cents_snapshot is not null));
insert into _avant_apres values ('tickets_consommes_touches',
  (select count(*)::text from public.winners
    where min_spend_cents_snapshot is not null
      and (status = 'redeemed' or redeemed_at is not null or consumed_at is not null)));

-- ─── 4. VERDICT — la règle de Samy est-elle tenue ?

do $$
declare
  v_consommes_touches int;
begin
  select valeur::int into v_consommes_touches
  from _avant_apres where etape = 'tickets_consommes_touches';

  /*
   * L'invariant qui compte : AUCUN ticket consommé ne doit avoir reçu de
   * snapshot. Si ce compte n'est pas nul, le migrateur a réécrit le passé et
   * il ne doit jamais être appliqué en l'état.
   */
  if v_consommes_touches <> 0 then
    raise exception 'MIGRATEUR REFUSÉ : % ticket(s) consommé(s) auraient reçu un snapshot. La règle est « inchangé » pour eux.', v_consommes_touches;
  end if;
  raise notice 'MIGRATEUR : aucun ticket consommé touché. Règle tenue.';
end $$;

select etape, valeur from _avant_apres order by etape;

/*
 * ANNULATION INCONDITIONNELLE. Ce fichier ne laisse rien derrière lui, même
 * quand tout est vert. L'application réelle est un acte séparé, qui demande
 * la validation finale de Samy.
 */
rollback;
