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
 * Relevé le 19/08/2026 au matin : l'empreinte BRUTE de
 * `archive_redeemed_winners` divergeait entre le banc et la production, alors
 * que les empreintes NORMALISÉES coïncidaient — l'écart était typographique,
 * la production mettant une colonne par ligne là où le banc les groupait.
 *
 * C'est le même piège que les « 9 fonctions cosmétiques » du diff sémantique :
 * une empreinte brute qui diverge ne prouve pas un comportement différent.
 *
 * ⚠️ Cette divergence est CLOSE depuis la migration 20260819130000, qui a posé
 * le même corps exact des deux côtés (brute ff8c11cf…). La garde ci-dessous
 * reste sur l'empreinte normalisée : c'est elle qui dit « même comportement »,
 * et c'est la seule chose que ce harnais a besoin de savoir.
 *
 *     archive_redeemed_winners  normalisée  7f78c8f3…  des deux côtés
 *     anonymize_expired_data    normalisée  b89f0d08…  des deux côtés
 *
 * Le harnais commence donc par revérifier cette égalité, et refuse si elle
 * tombe.
 *
 * ⚠️ LEÇON DU 19/08 : ces deux constantes sont des RÉFÉRENCES, pas des
 * vérités éternelles. La migration 20260819110000 a légitimement changé
 * `anonymize_expired_data` sans que la constante suive — le harnais aurait
 * refusé de tourner à sa prochaine exécution, sur une fausse alerte.
 * Toute migration qui touche l'une de ces deux fonctions doit mettre à jour
 * sa constante DANS LE MÊME COMMIT.
 *
 * ⚠️ RÉSERVÉ À UNE CIBLE SYNTHÉTIQUE : il écrit et supprime des tickets.
 */

-- ═══ GARDE : cible synthétique, et banc fidèle ═══

do $$
declare
  v_u int; v_p int; v_r int; v_h text;
  c_prefixe constant text := '00000000-0000-4000-8000-0000000092';
  c_archive constant text := '7f78c8f32d6bba8536b89100b17c95dec0973e0dcb0ef4ab838d645a59b3eee2';
  c_anonym  constant text := 'b89f0d089bd9f6f791c17a29a3d53bdec7ab02fc44dd1d364c6d5b153fb84a11';
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
--  Bloc 4 : L'ARCHIVE NE S'ÉCHAPPE PLUS À LA RÉTENTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── CE QUE CE BLOC MESURAIT AVANT LE 19/08/2026 ───
--
-- `anonymize_expired_data` mettait à jour `winners` et `contacts`, et ne
-- regardait JAMAIS `winners_archive`. Or l'archivage sort les tickets
-- consommés au bout de 90 jours — bien avant les 24 mois de l'anonymisation.
-- Un ticket consommé partait donc à l'archive à trois mois et n'était plus
-- jamais anonymisé.
--
-- Ce bloc était un test de CARACTÉRISATION : il passait au vert quand le
-- défaut était présent, et son en-tête annonçait qu'il échouerait le jour où
-- la règle changerait. C'est ce qui est arrivé.
--
-- ─── CE QU'IL MESURE DEPUIS ───
--
-- La migration 20260819110000 a étendu la règle des 24 mois à l'archive, en
-- comptant depuis `coalesce(redeemed_at, created_at)` — l'archive ne porte pas
-- `expires_at`, et `redeemed_at` précède toujours `expires_at`, donc la
-- fenêtre est plus stricte, jamais plus laxe.
--
-- ⚠️ CE BLOC A ÉTÉ ÉCRIT EN RETARD. La migration a été appliquée en production
-- le 19/08 au matin ; les six contrôles ci-dessous avaient été joués à la
-- volée sur le banc pour la prouver, mais n'avaient pas été versés dans ce
-- fichier. Le harnais du dépôt a donc affirmé le contraire de la production
-- pendant quelques heures. Une preuve qui ne finit pas dans le dépôt n'est
-- pas une preuve : c'est un souvenir.

do $$
declare
  vG uuid := '00000000-0000-4000-8000-000000009202';
  v_json jsonb;
begin
  perform pg_temp.poser();

  /* Un ticket consommé il y a 30 mois : au-delà de la fenêtre de rétention. */
  update public.winners
     set redeemed_at = now() - interval '30 months',
         created_at  = now() - interval '31 months',
         expires_at  = now() - interval '30 months'
   where id = '00000000-0000-4000-8000-000000009211';

  perform public.archive_redeemed_winners(90, 5000);

  insert into _tp values ('archive et retention', 'le ticket de 30 mois est parti a l''archive',
    'archive', case when exists (select 1 from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') then 'archive' else 'RESTE' end,
    exists (select 1 from public.winners_archive where id = '00000000-0000-4000-8000-000000009211'));

  v_json := public.anonymize_expired_data();

  insert into _tp values ('archive et retention', 'l''anonymisation le rattrape DANS l''archive',
    'Anonyme',
    coalesce((select first_name from public.winners_archive where id = '00000000-0000-4000-8000-000000009211'), '(absent)'),
    (select first_name from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') = 'Anonyme');

  insert into _tp values ('archive et retention', 'son e-mail est efface dans l''archive',
    'NULL',
    coalesce((select email from public.winners_archive where id = '00000000-0000-4000-8000-000000009211'), 'NULL'),
    (select email from public.winners_archive where id = '00000000-0000-4000-8000-000000009211') is null);

  /*
   * LE CAS QUI EMPECHE DE TOUT DETRUIRE. Le ticket 9212 est archive lui aussi
   * — 120 jours, donc au-dela des 90 de l'archivage — mais il n'a que quatre
   * mois : la fenetre de retention est de 24. Il doit rester nominatif.
   *
   * Sans ce controle, une regle qui anonymiserait TOUTE l'archive passerait au
   * vert. C'est exactement la decision qui a ete ecartee le 19/08 : etendre la
   * regle, pas detruire en avance.
   */
  insert into _tp values ('archive et retention', 'l''archive de 4 mois est INTACTE — rien n''est detruit en avance',
    'Ancien consomme2',
    coalesce((select first_name from public.winners_archive where id = '00000000-0000-4000-8000-000000009212'), '(absent)'),
    (select first_name from public.winners_archive where id = '00000000-0000-4000-8000-000000009212') = 'Ancien consomme2');

  insert into _tp values ('archive et retention', 'le compte rendu annonce l''archive traitee',
    '1 archive, 0 ticket vif',
    coalesce(v_json->>'archives_anonymises','ABSENT') || ' archive, ' || coalesce(v_json->>'winners_anonymises','?') || ' ticket vif',
    (v_json->>'archives_anonymises')::int = 1 and (v_json->>'winners_anonymises')::int = 0);

  /* Rejouee : elle ne retouche rien. */
  v_json := public.anonymize_expired_data();
  insert into _tp values ('archive et retention', 'rejouee, elle ne retouche aucune archive',
    '0', coalesce(v_json->>'archives_anonymises','ABSENT'),
    (v_json->>'archives_anonymises')::int = 0);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Bloc 5 : UN SEUL CONTRAT DE STATUT, ET PLUS DE BRANCHE MORTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── CE QUE CE BLOC MESURAIT AVANT LE 19/08/2026 ───
--
-- `winners.status` portait DEUX contraintes CHECK, toutes deux validées :
--
--     check_winner_status    available, redeemed, consumed
--     winners_status_check   available, redeemed
--
-- Elles s'appliquaient ensemble : la plus stricte gagnait, `consumed` était
-- impossible, et `archive_redeemed_winners` gardait une branche
-- `status = 'consumed'` qui ne pouvait JAMAIS se déclencher.
--
-- ─── CE QU'IL MESURE DEPUIS ───
--
-- Décision de Samy (option P-a) : `consumed` n'existe pas. La migration
-- 20260819130000 a supprimé la contrainte permissive et la branche morte.
--
-- Le contrat est désormais dit à UN SEUL endroit — et c'est précisément ce que
-- ce bloc surveille. Le danger n'a pas disparu, il a changé de forme : avant,
-- il fallait craindre qu'on supprime la stricte en la croyant redondante ;
-- maintenant, il n'y a plus de filet du tout si elle disparaît. Une seule
-- contrainte tient `consumed` fermé.
--
-- Vérifié sur le banc le 19/08 : sans `winners_status_check`, `consumed`
-- redevient écrivable. Ce bloc est donc une sentinelle, pas une formalité.

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

  insert into _tp values ('contraintes', 'une seule contrainte porte le contrat de statut',
    '1', (select count(*)::text from pg_constraint
          where conrelid = 'public.winners'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%status%'),
    (select count(*) from pg_constraint
     where conrelid = 'public.winners'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%') = 1);

  /* C'est elle, et elle seule, qui tient `consumed` ferme. Si ce controle
     rougit, l'etat fantome est de retour. */
  insert into _tp values ('contraintes', 'winners_status_check est presente et validee',
    'oui', case when exists (
        select 1 from pg_constraint
        where conrelid = 'public.winners'::regclass and conname = 'winners_status_check'
          and convalidated) then 'oui' else 'NON' end,
    exists (select 1 from pg_constraint
            where conrelid = 'public.winners'::regclass and conname = 'winners_status_check'
              and convalidated));

  insert into _tp values ('contraintes', 'la branche morte a quitte la fonction d''archivage',
    'retiree', case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='archive_redeemed_winners'
          and position('consumed' in p.prosrc) > 0) then 'ENCORE LA' else 'retiree' end,
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname='public' and p.proname='archive_redeemed_winners'
                  and position('consumed' in p.prosrc) > 0));

  /* La borne monetaire du lot 3 n'etait que prospective : NOT VALID, donc les
     lignes anterieures n'avaient jamais ete controlees. Validee le 19/08. */
  insert into _tp values ('contraintes', 'la borne monetaire est validee, pas seulement declaree',
    'validee', case when exists (
        select 1 from pg_constraint
        where conrelid = 'public.winners'::regclass
          and conname = 'winners_min_spend_cents_borne' and convalidated) then 'validee' else 'NOT VALID' end,
    exists (select 1 from pg_constraint
            where conrelid = 'public.winners'::regclass
              and conname = 'winners_min_spend_cents_borne' and convalidated));
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
