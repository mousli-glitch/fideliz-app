/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  L'EFFET DES TÂCHES PLANIFIÉES — PAS LE PLANIFICATEUR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── POURQUOI CE HARNAIS NE TESTE PAS `pg_cron` ───
 *
 * `pg_cron` est **présente en production et absente du banc**. Les cinq tâches
 * ne peuvent donc pas y être rejouées telles quelles.
 *
 * Ce n'est pas une perte. Ce qui doit survivre à la fusion, ce n'est pas le
 * planificateur — c'est **l'effet** : les tickets consommés partent à
 * l'archive, les données trop vieilles sont anonymisées. Tester la cadence
 * reviendrait à tester PostgreSQL ; tester l'effet teste Fideliz.
 *
 * Les deux fonctions sont appelées ici DIRECTEMENT, exactement comme le cron
 * les appelle :
 *
 *     select public.archive_redeemed_winners(90, 5000);
 *     select public.anonymize_expired_data();
 *
 * ─── FIDÉLITÉ DU BANC, VÉRIFIÉE ET NON SUPPOSÉE ───
 *
 * Relevé le 19/08/2026 : l'empreinte BRUTE de `archive_redeemed_winners`
 * diverge entre le banc et la production. Après normalisation des espaces, les
 * deux empreintes coïncident : l'écart est **typographique** — la production
 * met une colonne par ligne, le banc les groupe.
 *
 *     archive_redeemed_winners  normalisée  41efb2e1…  des deux côtés
 *     anonymize_expired_data    normalisée  b9db1128…  des deux côtés
 *
 * C'est le même piège que les « 9 fonctions cosmétiques » du diff sémantique :
 * une empreinte brute qui diverge ne prouve pas un comportement différent. Le
 * harnais commence donc par revérifier cette égalité, et refuse si elle tombe.
 *
 * ⚠️ RÉSERVÉ À UNE CIBLE SYNTHÉTIQUE : il écrit et supprime des tickets.
 */

-- ═══ GARDE : cible synthétique, et banc fidèle ═══

do $$
declare
  v_u int; v_p int; v_r int; v_h text;
  c_prefixe constant text := '00000000-0000-4000-8000-0000000092';
  c_archive constant text := '41efb2e1bd688f46f0c7ac610bc1b5381bf0f01f9225ceb23ff109d0b584a322';
  c_anonym  constant text := 'b9db11287af45202d12be7ae60ec74c89ed707d3986d5932a3921a2d955d1ec0';
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants where id::text not like c_prefixe || '%';
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception using errcode = 'P9811',
      message = format('HARNAIS REFUSE : cible non synthetique (%s comptes Auth, %s profils, %s restaurants hors harnais). Ce fichier ecrit et supprime des tickets.', v_u, v_p, v_r);
  end if;

  /* Les deux fonctions doivent être SÉMANTIQUEMENT celles de la production. */
  select encode(digest(regexp_replace(prosrc, '\s+', '', 'g'), 'sha256'), 'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='archive_redeemed_winners';
  if v_h is distinct from c_archive then
    raise exception using errcode = 'P9811',
      message = format('HARNAIS INAPPLICABLE : archive_redeemed_winners du banc n''est plus celle de la production (normalisee %s). Prouver son comportement ici n''apprendrait rien sur la production.', coalesce(v_h,'(absente)'));
  end if;

  select encode(digest(regexp_replace(prosrc, '\s+', '', 'g'), 'sha256'), 'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='anonymize_expired_data';
  if v_h is distinct from c_anonym then
    raise exception using errcode = 'P9811',
      message = format('HARNAIS INAPPLICABLE : anonymize_expired_data du banc n''est plus celle de la production (normalisee %s).', coalesce(v_h,'(absente)'));
  end if;
end $$;

create temp table _tp (bloc text, cas text, attendu text, obtenu text, conforme boolean);

-- ═══ Fixture ═══

create or replace function pg_temp.poser() returns void language plpgsql as $f$
declare
  vR uuid := '00000000-0000-4000-8000-000000009201';
  vG uuid := '00000000-0000-4000-8000-000000009202';
begin
  delete from public.winners_archive where game_id = vG;
  delete from public.winners  where game_id = vG;
  delete from public.contacts where restaurant_id = vR;
  delete from public.prizes   where game_id = vG;
  delete from public.games    where id = vG;
  delete from public.restaurants where id = vR;

  insert into public.restaurants (id, name, slug) values (vR, 'resto-taches', 'resto-taches');
  insert into public.games (id, restaurant_id, name, active_action, status, validity_days, min_spend)
    values (vG, vR, 'jeu-taches', 'wheel', 'active', 30, '0');

  /*
   * Six tickets, choisis pour tenir les DEUX bords de la fenêtre des 90 jours.
   * Les dates sont posées explicitement : un harnais qui dépend de
   * « aujourd'hui » ment un jour sur deux.
   *
   * Aucun ticket n'est en `consumed` — la table le REFUSE, voir le bloc 5.
   */
  insert into public.winners (id, game_id, first_name, email, status, created_at, redeemed_at, expires_at) values
    ('00000000-0000-4000-8000-000000009211', vG, 'Ancien consomme',  'a1@exemple.invalid', 'redeemed',  now() - interval '200 days', now() - interval '180 days', now() - interval '170 days'),
    ('00000000-0000-4000-8000-000000009212', vG, 'Ancien consomme2', 'a2@exemple.invalid', 'redeemed',  now() - interval '150 days', now() - interval '120 days', now() - interval '110 days'),
    ('00000000-0000-4000-8000-000000009213', vG, 'Juste hors bord',  'a3@exemple.invalid', 'redeemed',  now() - interval '100 days', now() - interval  '91 days', now() - interval  '85 days'),
    ('00000000-0000-4000-8000-000000009214', vG, 'Juste dans bord',  'a4@exemple.invalid', 'redeemed',  now() - interval  '95 days', now() - interval  '89 days', now() - interval  '85 days'),
    ('00000000-0000-4000-8000-000000009215', vG, 'Disponible vieux', 'a5@exemple.invalid', 'available', now() - interval '300 days', null,                        now() - interval '270 days'),
    ('00000000-0000-4000-8000-000000009216', vG, 'Consomme recent',  'a6@exemple.invalid', 'redeemed',  now() - interval  '10 days', now() - interval   '5 days', now() + interval  '20 days');
end $f$;

-- ═══ Bloc 1 : l'archivage déplace exactement ce qui est éligible ═══

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009202';
  v_n int;
begin
  perform pg_temp.poser();

  select public.archive_redeemed_winners(90, 5000) into v_n;

  /* Trois éligibles : consommés ET dont la date dépasse 90 jours. */
  insert into _tp values ('archivage', 'archive exactement les eligibles', '3', v_n::text, v_n = 3);

  insert into _tp values ('archivage', 'le disponible tres vieux RESTE — le statut prime sur l''age',
    'present', case when exists (select 1 from public.winners where id = '00000000-0000-4000-8000-000000009215') then 'present' else 'DISPARU' end,
    exists (select 1 from public.winners where id = '00000000-0000-4000-8000-000000009215'));

  insert into _tp values ('archivage', 'le consomme recent RESTE',
    'present', case when exists (select 1 from public.winners where id = '00000000-0000-4000-8000-000000009216') then 'present' else 'DISPARU' end,
    exists (select 1 from public.winners where id = '00000000-0000-4000-8000-000000009216'));

  /* Le bord : 89 jours reste, 91 jours part. */
  insert into _tp values ('archivage', 'a 89 jours, le ticket reste',
    'present', case when exists (select 1 from public.winners where id = '00000000-0000-4000-8000-000000009214') then 'present' else 'DISPARU' end,
    exists (select 1 from public.winners where id = '00000000-0000-4000-8000-000000009214'));

  insert into _tp values ('archivage', 'a 91 jours, le ticket part',
    'archive', case when exists (select 1 from public.winners_archive where id = '00000000-0000-4000-8000-000000009213') then 'archive' else 'RESTE' end,
    exists (select 1 from public.winners_archive where id = '00000000-0000-4000-8000-000000009213'));

  insert into _tp values ('archivage', 'rien n''est perdu : autant d''archives que de departs',
    '3', (select count(*)::text from public.winners_archive where game_id = vG),
    (select count(*) from public.winners_archive where game_id = vG) = 3);

  /* L'archive resout le restaurant par le jeu — la borne de tenant survit. */
  insert into _tp values ('archivage', 'l''archive porte le restaurant, resolu par le jeu',
    '3', (select count(*)::text from public.winners_archive where game_id = vG and restaurant_id = '00000000-0000-4000-8000-000000009201'),
    (select count(*) from public.winners_archive where game_id = vG and restaurant_id = '00000000-0000-4000-8000-000000009201') = 3);

  /* Rejoue : plus rien a archiver. */
  select public.archive_redeemed_winners(90, 5000) into v_n;
  insert into _tp values ('archivage', 'rejoue, il n''archive plus rien', '0', v_n::text, v_n = 0);
end $$;

-- ═══ Bloc 2 : la taille du lot est une borne, pas une suggestion ═══

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009202';
  v_n int;
begin
  perform pg_temp.poser();

  select public.archive_redeemed_winners(90, 2) into v_n;
  insert into _tp values ('taille du lot', 'un lot de 2 n''en archive que 2', '2', v_n::text, v_n = 2);

  select public.archive_redeemed_winners(90, 2) into v_n;
  insert into _tp values ('taille du lot', 'le passage suivant prend le reste', '1', v_n::text, v_n = 1);

  select public.archive_redeemed_winners(90, 2) into v_n;
  insert into _tp values ('taille du lot', 'puis plus rien', '0', v_n::text, v_n = 0);
end $$;

-- ═══ Bloc 3 : l'anonymisation ne touche que ce qui a dépassé sa fenêtre ═══

do $$
declare
  vR uuid := '00000000-0000-4000-8000-000000009201';
  vG uuid := '00000000-0000-4000-8000-000000009202';
  v_json jsonb;
begin
  perform pg_temp.poser();

  /* Deux tickets : un de 30 mois, un de 12. Seul le premier doit tomber. */
  update public.winners set expires_at = now() - interval '30 months' where id = '00000000-0000-4000-8000-000000009215';
  update public.winners set expires_at = now() - interval '12 months' where id = '00000000-0000-4000-8000-000000009216';

  /* Trois contacts : la fenetre depend du consentement marketing. */
  insert into public.contacts (id, restaurant_id, first_name, email, marketing_optin, last_submitted_at) values
    ('00000000-0000-4000-8000-000000009221', vR, 'Sans optin vieux', 'c1@exemple.invalid', false, now() - interval '30 months'),
    ('00000000-0000-4000-8000-000000009222', vR, 'Avec optin vieux', 'c2@exemple.invalid', true,  now() - interval '30 months'),
    ('00000000-0000-4000-8000-000000009223', vR, 'Avec optin tres vieux', 'c3@exemple.invalid', true, now() - interval '40 months');

  v_json := public.anonymize_expired_data();

  insert into _tp values ('anonymisation', 'le ticket de 30 mois est anonymise',
    'Anonyme', (select first_name from public.winners where id = '00000000-0000-4000-8000-000000009215'),
    (select first_name from public.winners where id = '00000000-0000-4000-8000-000000009215') = 'Anonyme');

  insert into _tp values ('anonymisation', 'son e-mail est efface',
    'NULL', coalesce((select email from public.winners where id = '00000000-0000-4000-8000-000000009215'), 'NULL'),
    (select email from public.winners where id = '00000000-0000-4000-8000-000000009215') is null);

  insert into _tp values ('anonymisation', 'le ticket de 12 mois est INTACT',
    'Consomme recent', (select first_name from public.winners where id = '00000000-0000-4000-8000-000000009216'),
    (select first_name from public.winners where id = '00000000-0000-4000-8000-000000009216') = 'Consomme recent');

  insert into _tp values ('anonymisation', 'contact sans optin a 30 mois : anonymise (fenetre 24)',
    'Anonyme', (select first_name from public.contacts where id = '00000000-0000-4000-8000-000000009221'),
    (select first_name from public.contacts where id = '00000000-0000-4000-8000-000000009221') = 'Anonyme');

  /*
   * LE CAS QUI DISTINGUE LES DEUX FENETRES. Meme age — 30 mois — mais avec
   * consentement marketing la fenetre est de 36 mois : ce contact doit
   * RESTER. Un harnais qui n'aurait que le cas sans optin passerait au vert
   * meme si les deux fenetres etaient confondues.
   */
  insert into _tp values ('anonymisation', 'contact AVEC optin a 30 mois : INTACT (fenetre 36)',
    'Avec optin vieux', (select first_name from public.contacts where id = '00000000-0000-4000-8000-000000009222'),
    (select first_name from public.contacts where id = '00000000-0000-4000-8000-000000009222') = 'Avec optin vieux');

  insert into _tp values ('anonymisation', 'contact avec optin a 40 mois : anonymise',
    'Anonyme', (select first_name from public.contacts where id = '00000000-0000-4000-8000-000000009223'),
    (select first_name from public.contacts where id = '00000000-0000-4000-8000-000000009223') = 'Anonyme');

  insert into _tp values ('anonymisation', 'le compte rendu annonce ce qu''il a fait',
    '1 ticket, 2 contacts',
    coalesce(v_json->>'winners_anonymises','?') || ' ticket, ' || coalesce(v_json->>'contacts_anonymises','?') || ' contacts',
    (v_json->>'winners_anonymises')::int = 1 and (v_json->>'contacts_anonymises')::int = 2);

  /* Rejoue : plus rien a anonymiser. */
  v_json := public.anonymize_expired_data();
  insert into _tp values ('anonymisation', 'rejouee, elle ne touche plus rien', '0 et 0',
    coalesce(v_json->>'winners_anonymises','?') || ' et ' || coalesce(v_json->>'contacts_anonymises','?'),
    (v_json->>'winners_anonymises')::int = 0 and (v_json->>'contacts_anonymises')::int = 0);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Bloc 4 : LE TROU, MESURÉ ET NON DÉDUIT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `anonymize_expired_data` met à jour `winners` et `contacts`. Elle ne
-- regarde JAMAIS `winners_archive`. Or l'archivage sort les tickets consommés
-- au bout de 90 jours — bien avant les 24 mois de l'anonymisation.
--
-- Conséquence : un ticket consommé est archivé à 3 mois, puis n'est plus
-- jamais anonymisé. Son prénom et son e-mail restent dans `winners_archive`
-- indéfiniment.
--
-- Relevé en production le 19/08/2026 : 37 tickets archivés, **les 37 portent
-- encore prénom et e-mail**, le plus ancien a 11 mois. Aucune infraction
-- aujourd'hui — et une certitude dans 13 mois.
--
-- Ce bloc FIGE le comportement actuel. Il passe au vert quand le défaut est
-- présent : c'est un test de caractérisation, pas une approbation. Le jour où
-- la règle changera, il échouera et il faudra le réécrire — c'est voulu.

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009202';
  v_json jsonb;
begin
  perform pg_temp.poser();

  /* Un ticket consommé il y a 30 mois : éligible aux DEUX traitements. */
  update public.winners
     set redeemed_at = now() - interval '30 months',
         created_at  = now() - interval '31 months',
         expires_at  = now() - interval '30 months'
   where id = '00000000-0000-4000-8000-000000009211';

  perform public.archive_redeemed_winners(90, 5000);

  insert into _tp values ('trou mesure', 'le ticket de 30 mois est parti a l''archive',
    'archive', case when exists (select 1 from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') then 'archive' else 'RESTE' end,
    exists (select 1 from public.winners_archive where id = '00000000-0000-4000-8000-000000009211'));

  v_json := public.anonymize_expired_data();

  insert into _tp values ('trou mesure', 'l''anonymisation ne le voit plus : il garde son prenom',
    'Ancien consomme',
    coalesce((select first_name from public.winners_archive where id = '00000000-0000-4000-8000-000000009211'), '(absent)'),
    (select first_name from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') = 'Ancien consomme');

  insert into _tp values ('trou mesure', 'et son e-mail, apres 30 mois',
    'present',
    case when (select email from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') is not null then 'present' else 'efface' end,
    (select email from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') is not null);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Bloc 5 : DEUX CONTRAINTES QUI SE CONTREDISENT, ET UNE BRANCHE MORTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `winners.status` porte DEUX contraintes CHECK, toutes deux validées, en
-- production comme sur le banc :
--
--     check_winner_status    available, redeemed, consumed
--     winners_status_check   available, redeemed
--
-- Elles s'appliquent ensemble : la plus stricte gagne, et `consumed` est
-- impossible. Or `archive_redeemed_winners` teste explicitement
-- `status = 'consumed'` — cette branche ne peut JAMAIS se déclencher.
--
-- Ce n'est pas un défaut aujourd'hui. Ça le devient le jour où quelqu'un
-- « range » en supprimant `winners_status_check`, qu'il croira redondante avec
-- l'autre : `consumed` deviendrait écrivable, et une branche jamais exercée
-- se réveillerait en production. Ce bloc fige les deux faits.

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009202';
  v_refuse boolean := false;
begin
  perform pg_temp.poser();

  begin
    insert into public.winners (id, game_id, first_name, status, created_at)
    values ('00000000-0000-4000-8000-00000000923f', vG, 'Essai consumed', 'consumed', now());
  exception when check_violation then
    v_refuse := true;
  end;

  insert into _tp values ('contraintes', 'la table REFUSE le statut consumed',
    'refuse', case when v_refuse then 'refuse' else 'ACCEPTE' end, v_refuse);

  insert into _tp values ('contraintes', 'les deux contraintes de statut coexistent',
    '2', (select count(*)::text from pg_constraint
          where conrelid = 'public.winners'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%status%'),
    (select count(*) from pg_constraint
     where conrelid = 'public.winners'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%') = 2);

  insert into _tp values ('contraintes', 'la fonction d''archivage garde une branche morte pour consumed',
    'presente', case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='archive_redeemed_winners'
          and position('''consumed''' in p.prosrc) > 0) then 'presente' else 'retiree' end,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='archive_redeemed_winners'
              and position('''consumed''' in p.prosrc) > 0));
end $$;

-- ═══ Nettoyage ═══

do $$
declare
  vR uuid := '00000000-0000-4000-8000-000000009201';
  vG uuid := '00000000-0000-4000-8000-000000009202';
begin
  delete from public.winners_archive where game_id = vG;
  delete from public.winners  where game_id = vG;
  delete from public.contacts where restaurant_id = vR;
  delete from public.prizes   where game_id = vG;
  delete from public.games    where id = vG;
  delete from public.restaurants where id = vR;
end $$;

-- ═══ Verdict, fail-closed ═══

do $$
declare v_c int; v_t int; v_e text;
begin
  select count(*) filter (where conforme), count(*),
         string_agg(bloc || ' / ' || cas || ' : attendu ' || attendu || ', obtenu ' || obtenu, E'\n')
           filter (where not conforme)
    into v_c, v_t, v_e from _tp;

  if v_t < 23 then
    raise exception using errcode = 'P9812',
      message = format('HARNAIS TACHES : seulement %s controles executes, 23 attendus au minimum.', v_t);
  end if;
  if v_c <> v_t then
    raise exception using errcode = 'P9813',
      message = format(E'HARNAIS TACHES : %s/%s conformes.\n%s', v_c, v_t, v_e);
  end if;

  raise notice 'HARNAIS TACHES PLANIFIEES : %/% conformes.', v_c, v_t;
end $$;

select bloc, cas, attendu, obtenu, conforme from _tp order by bloc, cas;
