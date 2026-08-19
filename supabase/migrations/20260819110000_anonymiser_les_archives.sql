/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  L'ARCHIVE CESSE D'ÉCHAPPER À L'ANONYMISATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LE DÉFAUT, MESURÉ LE 19/08/2026 ───
 *
 * `anonymize_expired_data()` met à jour `winners` et `contacts`. Elle ne
 * regarde **jamais** `winners_archive`.
 *
 * Or `archive_redeemed_winners(90, …)` sort les tickets consommés de `winners`
 * au bout de **90 jours** — bien avant les 24 mois de l'anonymisation. Un
 * ticket consommé part donc à l'archive à trois mois, et n'est plus jamais
 * anonymisé : son prénom et son e-mail y restent indéfiniment.
 *
 * Relevé en lecture seule sur la production :
 *
 *     tickets archivés .................................... 37
 *     dont prénom encore nominatif ........................ 37
 *     dont e-mail encore présent .......................... 37
 *     plus ancien ticket archivé .......................... 11 mois
 *     archivés ayant dépassé 24 mois sans anonymisation ....  0
 *
 * Aucune infraction aujourd'hui. Une certitude dans treize mois.
 *
 * ─── CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ───
 *
 * Elle **étend la règle existante** à la table qui y échappait. Elle
 * n'anonymise rien de plus tôt, elle n'invente aucune fenêtre, elle ne
 * supprime rien.
 *
 * Conséquence immédiate, et c'est voulu : **0 ligne change aujourd'hui**,
 * puisque aucun ticket archivé n'a encore 24 mois. Le correctif est inerte à
 * l'arrivée et correct pour toujours — c'est exactement ce qu'on veut d'un
 * changement qui touche des données personnelles en production.
 *
 * ⚠️ Anonymiser les 37 lignes MAINTENANT serait une autre décision : elle
 * détruirait des données avant l'échéance de leur propre règle de rétention.
 * Elle n'est pas prise ici.
 *
 * ─── POURQUOI `redeemed_at` ET NON `expires_at` ───
 *
 * Sur `winners`, la fenêtre court depuis `coalesce(expires_at, created_at)`.
 * `winners_archive` ne porte pas `expires_at` — l'archivage ne le recopie pas.
 *
 * On compte donc depuis `coalesce(redeemed_at, created_at)`, exactement comme
 * le fait `archive_redeemed_winners` pour décider qui partir. Deux avantages :
 * la même date gouverne l'archivage et l'anonymisation d'une même ligne, et
 * `redeemed_at` précède toujours `expires_at` — la fenêtre est donc **plus
 * stricte**, jamais plus laxe. Pour de la donnée personnelle, c'est le seul
 * sens d'erreur acceptable.
 *
 * ─── BORNÉE PAR EMPREINTE ───
 *
 * Préimage attendue, relevée le 19/08/2026 sur la production ET sur le banc :
 *
 *     485677ce…  919 caractères
 *
 * Tout autre corps est refusé : un état inconnu ne se recouvre pas.
 *
 * MIGRATION ADDITIVE : aucune table, aucune colonne. Un seul corps de fonction
 * change, et ses droits sont reposés à l'identique.
 */

do $garde$
declare
  v_h text; v_n int;
  c_preimage  constant text := '485677ce1b35c780e354c95abbf752f602f97ea932ca4e433a768bb58b1b0009';
  c_postimage constant text := '3b6d8f888bc77bfdc5ab79bb057e36e416059e3ed330371d764aa0c522960526';
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='anonymize_expired_data';
  if v_n <> 1 then
    raise exception using errcode='P0140',
      message = format('ANONYMISATION DES ARCHIVES : %s fonction(s) anonymize_expired_data, 1 attendue.', v_n);
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='winners_archive'
                   and column_name in ('first_name','email')) then
    raise exception using errcode='P0140',
      message = 'ANONYMISATION DES ARCHIVES : winners_archive ne porte pas les colonnes attendues. Rien n''est modifie.';
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='anonymize_expired_data';

  if v_h not in (c_preimage, c_postimage) then
    raise exception using errcode='P0140',
      message = format('ANONYMISATION DES ARCHIVES : corps inconnu (empreinte %s). Ni la version auditee, ni la corrigee. Un etat inconnu ne se recouvre pas.', v_h);
  end if;
end $garde$;

create or replace function public.anonymize_expired_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_winners int; v_contacts int; v_archives int;
begin
  -- Participations & tickets : anonymiser 24 mois après expiration (ou création)
  update winners
    set first_name = 'Anonyme', email = null, phone = null, marketing_optin = false
  where first_name is distinct from 'Anonyme'
    and coalesce(expires_at, created_at) < now() - interval '24 months';
  get diagnostics v_winners = row_count;

  -- Contacts : 36 mois après dernière activité si consentement marketing, sinon 24 mois
  update contacts
    set first_name = 'Anonyme', email = null, phone = null
  where first_name is distinct from 'Anonyme'
    and coalesce(last_submitted_at, created_at) <
        now() - (case when marketing_optin then interval '36 months' else interval '24 months' end);
  get diagnostics v_contacts = row_count;

  /*
   * Tickets ARCHIVÉS : même fenêtre de 24 mois.
   *
   * Sans cette clause, un ticket consommé partait à l'archive au bout de
   * 90 jours et n'était plus jamais anonymisé. La date de référence est
   * `redeemed_at` — l'archive ne porte pas `expires_at` — ce qui rend la
   * fenêtre plus stricte, jamais plus laxe.
   */
  update winners_archive
    set first_name = 'Anonyme', email = null
  where first_name is distinct from 'Anonyme'
    and coalesce(redeemed_at, created_at) < now() - interval '24 months';
  get diagnostics v_archives = row_count;

  return jsonb_build_object('winners_anonymises', v_winners,
                            'contacts_anonymises', v_contacts,
                            'archives_anonymises', v_archives,
                            'execute_le', now());
end;
$fn$;

comment on function public.anonymize_expired_data() is
  'Anonymise les données personnelles au-delà de leur fenêtre de rétention : tickets vifs et archivés à 24 mois, contacts à 24 ou 36 mois selon le consentement marketing.';

revoke all on function public.anonymize_expired_data() from public, anon, authenticated;
grant execute on function public.anonymize_expired_data() to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  v_h text; v_oid oid; v_manif text;
  c_postimage constant text := '3b6d8f888bc77bfdc5ab79bb057e36e416059e3ed330371d764aa0c522960526';
  c_acl constant text := 'postgres=X/postgres service_role=X/postgres';
begin
  select p.oid, encode(digest(p.prosrc,'sha256'),'hex'),
         pg_get_function_identity_arguments(p.oid) || ' | owner=' || pg_get_userbyid(p.proowner)
           || ' | secdef=' || p.prosecdef::text
           || ' | config=' || coalesce(array_to_string(p.proconfig,','),'')
           || ' | vol=' || p.provolatile::text
           || ' | acl=' || coalesce((select string_agg(a, ' ' order by a)
                                     from unnest(coalesce(p.proacl, array[]::aclitem[])::text[]) a), '(defaut)')
    into v_oid, v_h, v_manif
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='anonymize_expired_data';

  if v_h is distinct from c_postimage then
    raise exception using errcode='P0140',
      message = format('ANONYMISATION DES ARCHIVES : postimage inattendu (%s au lieu de %s). Transaction annulee.', v_h, c_postimage);
  end if;
  if v_manif is distinct from ' | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode='P0140',
      message = format('ANONYMISATION DES ARCHIVES : manifeste non conforme (%s). Transaction annulee.', v_manif);
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode='P0140',
      message = 'ANONYMISATION DES ARCHIVES : service_role a PERDU EXECUTE. Transaction annulee.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode='P0140',
      message = 'ANONYMISATION DES ARCHIVES : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;

  /* Les deux règles d'origine doivent être INTACTES — on étend, on ne remplace pas. */
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='anonymize_expired_data'
      and position('coalesce(expires_at, created_at) < now() - interval ''24 months''' in p.prosrc) > 0
      and position('interval ''36 months'' else interval ''24 months''' in p.prosrc) > 0
  ) then
    raise exception using errcode='P0140',
      message = 'ANONYMISATION DES ARCHIVES : une des deux regles d''origine a disparu. Transaction annulee — cette migration ETEND, elle ne remplace pas.';
  end if;

  raise notice 'ANONYMISATION DES ARCHIVES : corps, manifeste, droits et regles d''origine verifies dans la transaction.';
end $verif$;
