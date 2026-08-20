/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUE LA BASE PORTE VRAIMENT — ET QUI NE SE LIT PAS DANS LE REGISTRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rejouable, sans effet de bord. À jouer sur la production Fideliz, et sur
 * tout banc censé lui ressembler.
 *
 * ─── LE DÉFAUT QU'ELLE RÉVÈLE, MESURÉ LE 20/08/2026 ───
 *
 * `supabase_migrations.schema_migrations` annonce **10 migrations**, la
 * dernière datée du 18/08 à 15 h. Le dépôt en porte **25**.
 *
 * Sur les 15 de l'écart :
 *
 *   7 SONT APPLIQUÉES — dont les trois correctifs de sécurité du 19/08
 *     (l'oracle `play_count`, l'état fantôme `consumed`, la faille du lot
 *     d'un autre restaurant). Elles ont été posées par SQL direct, sans
 *     passer par l'outil de migration, et le registre ne les connaît pas.
 *
 *   8 NE LE SONT PAS — dont **le gel de bascule lui-même**.
 *
 * ─── POURQUOI C'EST DANGEREUX, ET PAS SEULEMENT INESTHÉTIQUE ───
 *
 * 1. **Un banc frais est une RÉGRESSION.** Une branche Supabase rejoue le
 *    registre. Elle porterait donc les 10 migrations connues et AUCUN des
 *    7 correctifs — c'est-à-dire un `get_replay_status` qui publie encore le
 *    nombre de parties d'un joueur, et un `register_win` qui laisse décompter
 *    le stock du lot d'un autre restaurant. Éprouver quoi que ce soit sur un
 *    tel banc, c'est éprouver une base qui n'existe plus.
 *
 * 2. **Le registre ne peut pas servir d'inventaire.** Ni pour dire ce qui est
 *    appliqué, ni pour dire ce qui ne l'est pas : il se tait sur les deux.
 *
 * 3. **`supabase db push` sur cette base est un piège.** Il tenterait de
 *    rejouer les 15 absentes du registre, dont 7 déjà en place. Sept d'entre
 *    elles sont bornées par empreinte et refuseraient proprement ; les autres
 *    n'ont pas cette garde.
 *
 * ─── COMMENT ELLE MESURE ───
 *
 * Par l'EFFET, jamais par le registre. Et pour les fonctions réécrites
 * plusieurs fois, par un marqueur SÉMANTIQUE et non par l'empreinte du corps.
 *
 * La distinction a compté : `isolation_lot_jeu` a d'abord été classée absente
 * parce que l'empreinte de `register_win` ne correspondait plus. Elle ne
 * correspondait plus parce qu'une migration POSTÉRIEURE avait réécrit la même
 * fonction — le correctif, lui, avait bien survécu à la réécriture. Une sonde
 * qui compare des empreintes de corps déclare absente toute correction qu'un
 * travail ultérieur a recouverte.
 */

with attendu(version, nom, effet_present, marqueur) as (
  values
  /*
   * DEUX fonctions, pas trois.
   *
   * Cette ligne a d'abord exige `maintenance_actif` en plus des deux autres —
   * chiffre repris du §6 du dossier de qualification, une section que le
   * dossier lui-meme signale comme perimee (« audit initial du 18/08, avant
   * §0bis/§7 »). Le fencing de §7 a fusionne le verrou et la lecture DANS
   * `refuser_pendant_maintenance`, et `maintenance_actif` a disparu du design.
   *
   * Consequence si on ne l'avait pas vu : la sonde aurait declare le gel
   * ABSENT juste apres l'avoir pose correctement. Une sonde qui se trompe sur
   * ce qu'elle attend est pire qu'une absence de sonde.
   */
  ('20260818160000', 'gel_source_fideliz',
     (to_regclass('public.maintenance') is not null)
     and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public'
            and p.proname in ('en_maintenance','refuser_pendant_maintenance')) = 2
     and (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and t.tgname='gel_de_bascule' and not t.tgisinternal) = 10,
     'table maintenance + 2 fonctions + 10 triggers'),

  ('20260819000000', 'heritier_ordre_total',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='handle_deleted_commercial'),
     'fonction handle_deleted_commercial'),

  ('20260819010000', 'intention_suppression_restaurant',
     to_regclass('public.suppressions_restaurant') is not null,
     'table suppressions_restaurant'),

  ('20260819020000', 'fenetre_de_suppression_compte',
     to_regclass('public.comptes_en_suppression') is not null,
     'table comptes_en_suppression'),

  ('20260819030000', 'enregistrement_atomique_du_jeu',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='enregistrer_jeu_et_lots'),
     'fonction enregistrer_jeu_et_lots'),

  ('20260819040000', 'jeton_de_fenetre_suppression',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='forcer_fermeture_fenetre'),
     'fonction forcer_fermeture_fenetre'),

  ('20260819050000', 'agregat_jeu_complet',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='enregistrer_jeu_et_lots'),
     'fonction enregistrer_jeu_et_lots (même objet que 030000)'),

  ('20260819060000', 'contrat_monetaire_centimes',
     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in ('centimes_depuis_saisie','minimum_effectif_centimes','minimum_effectif_du_ticket')) = 3
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='games' and column_name='min_spend_cents')
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot'),
     '3 fonctions monétaires + 2 colonnes canoniques'),

  ('20260819070000', 'double_ecriture_monetaire',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='enregistrer_jeu_et_lots'),
     'fonction enregistrer_jeu_et_lots (même objet que 030000)'),

  /*
   * MARQUEUR SÉMANTIQUE, et non empreinte : `register_win` a été réécrite par
   * 100000 après ce correctif. C'est la borne au jeu qui prouve sa présence,
   * pas le SHA-256 d'un corps que le travail suivant a remplacé.
   */
  ('20260819080000', 'isolation_lot_jeu',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='register_win'
               and position('from prizes where id = p_prize_id and game_id = p_game_id' in p.prosrc) > 0
               and position('where id = p_prize_id and game_id = p_game_id and quantity > 0' in p.prosrc) > 0
               and position('from prizes where id = p_prize_id;' in p.prosrc) = 0),
     'register_win : lot ET stock bornés au jeu, aucune lecture non bornée résiduelle'),

  ('20260819090000', 'creation_atomique_du_jeu',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='creer_jeu_et_lots'),
     'fonction creer_jeu_et_lots'),

  ('20260819100000', 'lecteurs_monetaires',
     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('play_game','register_win')
        and position('minimum_effectif_centimes' in p.prosrc) > 0
        and position('min_spend_cents_snapshot' in p.prosrc) > 0) = 2,
     'play_game ET register_win lisent le contrat et écrivent le relevé'),

  ('20260819110000', 'anonymiser_les_archives',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='anonymize_expired_data'
               and encode(digest(p.prosrc,'sha256'),'hex')
                   = '3b6d8f888bc77bfdc5ab79bb057e36e416059e3ed330371d764aa0c522960526'),
     'anonymize_expired_data · postimage 3b6d8f88'),

  ('20260819120000', 'replay_sans_compteur',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='get_replay_status'
               and encode(digest(p.prosrc,'sha256'),'hex')
                   = '1e372ccad530c6225f72eeda6e67b3e14d52830e1785300827f254db2feaaefb'),
     'get_replay_status · postimage 1e372cca'),

  ('20260819130000', 'etat_consumed_supprime',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='archive_redeemed_winners'
               and encode(digest(p.prosrc,'sha256'),'hex')
                   = 'ff8c11cfdfa940ebcde16aa99b11c705c47d950546af1ee24eb7b533963dc51e'),
     'archive_redeemed_winners · postimage ff8c11cf')
),
juge as (
  select a.*,
         exists (select 1 from supabase_migrations.schema_migrations m
                  where m.version = a.version) as au_registre
  from attendu a
)
select version, nom,
       case
         when au_registre and effet_present     then 'CONFORME — au registre et en place'
         when not au_registre and effet_present then 'HORS REGISTRE — appliquée sans être enregistrée'
         when au_registre and not effet_present then 'ROUGE — enregistrée mais SON EFFET MANQUE'
         else                                        'ABSENTE — écrite, jamais appliquée'
       end as etat,
       marqueur
from juge
order by
  case
    when au_registre and not effet_present then 0   -- le cas le plus grave d'abord
    when not au_registre and effet_present then 1
    when not au_registre and not effet_present then 2
    else 3
  end,
  version;
