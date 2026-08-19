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
--
-- Signalé le 19/08/2026, et c'est juste : la version précédente vérifiait
-- « combien de tickets consommés portent un snapshot », c'est-à-dire un état
-- GLOBAL, et non les lignes que CETTE exécution a écrites. Deux conséquences,
-- et la seconde est la vraie :
--
--   — faux positif garanti à terme : dès que le code écrira le snapshot à
--     l'émission, un ticket légitimement figé puis consommé ferait lever le
--     verdict alors que le migrateur n'aurait touché à rien. Le migrateur
--     deviendrait injouable au moment précis où le système fonctionne ;
--
--   — surtout, l'assertion ne mesurait PAS le comportement du migrateur. Elle
--     tombait juste par coïncidence, parce qu'aucun ticket consommé ne porte
--     de snapshot aujourd'hui. Une coïncidence n'est pas une preuve.
--
-- `UPDATE … RETURNING` capture donc les lignes RÉELLEMENT écrites, et les
-- assertions portent sur ce seul ensemble.

create temp table _jeux_touches    (id uuid, centimes int) on commit drop;
create temp table _tickets_touches (id uuid, centimes int, consomme boolean,
                                    supprime boolean, expire boolean) on commit drop;
create temp table _mesures (etape text, valeur text) on commit drop;

-- Manifeste canonique AVANT : ce que portent les deux colonnes, pas un compte.
insert into _mesures values ('manifeste_avant', (
  select coalesce(md5(string_agg(src || ':' || cle::text || '=' || coalesce(val::text,'NULL'), '|'
                                 order by src, cle)), 'vide')
  from (
    select 'g' as src, id as cle, min_spend_cents as val from public.games
    union all
    select 'w', id, min_spend_cents_snapshot from public.winners
  ) t));

/*
 * Les jeux d'abord : le champ canonique est calculé depuis le texte
 * historique, et une valeur illisible est LAISSÉE À NULL au lieu de devenir
 * zéro. C'est tout l'objet du contrat.
 */
with maj as (
  update public.games g
     set min_spend_cents = public.minimum_effectif_centimes(null, null, g.min_spend)
   where g.min_spend_cents is null
     and public.minimum_effectif_centimes(null, null, g.min_spend) is not null
  returning g.id, g.min_spend_cents
)
insert into _jeux_touches select id, min_spend_cents from maj;

/*
 * Les tickets ensuite, et UNIQUEMENT ceux que la règle de Samy désigne :
 * encore valides, non consommés, non supprimés, non expirés. Le minimum figé
 * est celui qui était AFFICHÉ au client.
 */
with maj as (
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
     and public.minimum_effectif_centimes(null, null, g.min_spend) is not null
  returning w.id, w.min_spend_cents_snapshot,
            (w.status = 'redeemed' or w.redeemed_at is not null or w.consumed_at is not null),
            (w.deleted_at is not null),
            (w.expires_at is not null and w.expires_at <= now())
)
insert into _tickets_touches select * from maj;

insert into _mesures values ('jeux_ecrits',    (select count(*)::text from _jeux_touches));
insert into _mesures values ('tickets_ecrits', (select count(*)::text from _tickets_touches));

-- ─── 3bis. IDEMPOTENCE : un second passage ne doit RIEN écrire

create temp table _second_passage (id uuid) on commit drop;

with maj as (
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
     and public.minimum_effectif_centimes(null, null, g.min_spend) is not null
  returning w.id
)
insert into _second_passage select id from maj;

insert into _mesures values ('second_passage_ecrits', (select count(*)::text from _second_passage));

insert into _mesures values ('manifeste_apres', (
  select coalesce(md5(string_agg(src || ':' || cle::text || '=' || coalesce(val::text,'NULL'), '|'
                                 order by src, cle)), 'vide')
  from (
    select 'g' as src, id as cle, min_spend_cents as val from public.games
    union all
    select 'w', id, min_spend_cents_snapshot from public.winners
  ) t));

-- ─── 4. VERDICT — la règle de Samy est-elle tenue, sur les lignes ÉCRITES ?

do $$
declare
  v_n int;
  v_second int;
begin
  -- (a) Aucun ticket consommé, supprimé ou expiré n'a été écrit.
  select count(*) into v_n from _tickets_touches where consomme or supprime or expire;
  if v_n <> 0 then
    raise exception 'MIGRATEUR REFUSÉ : % ticket(s) consommé(s), supprimé(s) ou expiré(s) ont été ÉCRITS. La règle est « inchangé » pour eux.', v_n;
  end if;

  -- (b) Aucune écriture à NULL : on ne fige pas une condition qu'on ne sait
  --     pas lire. Illisible reste illisible.
  select count(*) into v_n from _tickets_touches where centimes is null;
  if v_n <> 0 then
    raise exception 'MIGRATEUR REFUSÉ : % ticket(s) figé(s) à NULL — une valeur illisible ne doit pas être écrite.', v_n;
  end if;
  select count(*) into v_n from _jeux_touches where centimes is null;
  if v_n <> 0 then
    raise exception 'MIGRATEUR REFUSÉ : % jeu(x) écrit(s) à NULL.', v_n;
  end if;

  -- (c) Chaque ticket écrit porte EXACTEMENT le minimum affiché par son jeu.
  select count(*) into v_n
  from _tickets_touches t
  join public.winners w on w.id = t.id
  join public.games g   on g.id = w.game_id
  where t.centimes is distinct from public.minimum_effectif_centimes(null, null, g.min_spend);
  if v_n <> 0 then
    raise exception 'MIGRATEUR REFUSÉ : % ticket(s) figé(s) sur une valeur qui n''est pas le minimum affiché.', v_n;
  end if;

  -- (d) IDEMPOTENCE : rejouer n'écrit rien de plus.
  select valeur::int into v_second from _mesures where etape = 'second_passage_ecrits';
  if v_second <> 0 then
    raise exception 'MIGRATEUR REFUSÉ : un second passage a écrit % ligne(s). Le migrateur n''est pas idempotent.', v_second;
  end if;

  raise notice 'MIGRATEUR : règle tenue sur les lignes écrites, et rejeu sans effet.';
end $$;

select etape, valeur from _mesures order by etape;

/*
 * ANNULATION INCONDITIONNELLE. Ce fichier ne laisse rien derrière lui, même
 * quand tout est vert. L'application réelle est un acte séparé, qui demande
 * la validation finale de Samy.
 */
rollback;
