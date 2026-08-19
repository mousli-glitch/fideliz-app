/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  RETOUR ARRIÈRE — 20260819110000_anonymiser_les_archives
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remet `anonymize_expired_data()` dans son état d'avant le 19/08/2026,
 * c'est-à-dire **sans** la clause qui anonymise `winners_archive`.
 *
 * ⚠️ CE RETOUR ARRIÈRE RÉOUVRE UN MANQUEMENT À LA RÉTENTION. Sans cette
 * clause, tout ticket consommé part à l'archive au bout de 90 jours et n'est
 * plus JAMAIS anonymisé : prénom et e-mail y restent indéfiniment. Ce n'est
 * pas un retour arrière de confort — c'est un choix à assumer.
 *
 * Il n'y a par ailleurs rien à « défaire » côté données : la migration du
 * 19/08 a changé 0 ligne, aucun ticket archivé n'ayant alors 24 mois. Si des
 * lignes ont été anonymisées depuis, **ce fichier ne les restaure pas** — une
 * anonymisation est irréversible par construction.
 *
 * ─── LE CORPS RESTAURÉ N'EST PAS UNE RECONSTRUCTION ───
 *
 * Repris octet pour octet de `00000000000000_baseline_fideliz.sql`, empreinte
 * vérifiée avant écriture :
 *
 *     485677ce…  919 caractères  — identique à la préimage relevée en production
 *
 * ─── BORNÉ PAR EMPREINTE, DANS LES DEUX SENS ───
 */

do $garde$
declare
  v_h text; v_n int;
  c_corrige constant text := '3b6d8f888bc77bfdc5ab79bb057e36e416059e3ed330371d764aa0c522960526';
  c_origine constant text := '485677ce1b35c780e354c95abbf752f602f97ea932ca4e433a768bb58b1b0009';
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='anonymize_expired_data';
  if v_n <> 1 then
    raise exception using errcode='P0141',
      message = format('RETOUR ARRIERE ANONYMISATION : %s fonction(s), 1 attendue.', v_n);
  end if;

  select encode(digest(p.prosrc,'sha256'),'hex') into v_h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='anonymize_expired_data';
  if v_h not in (c_corrige, c_origine) then
    raise exception using errcode='P0141',
      message = format('RETOUR ARRIERE ANONYMISATION : corps inconnu (empreinte %s). Ce fichier n''ecrase pas un travail inconnu.', v_h);
  end if;
end $garde$;

create or replace function public.anonymize_expired_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_winners int; v_contacts int;
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

  return jsonb_build_object('winners_anonymises', v_winners, 'contacts_anonymises', v_contacts, 'execute_le', now());
end;
$fn$;

comment on function public.anonymize_expired_data() is null;

revoke all on function public.anonymize_expired_data() from public, anon, authenticated;
grant execute on function public.anonymize_expired_data() to service_role;

notify pgrst, 'reload schema';

do $verif$
declare
  v_h text; v_oid oid; v_manif text;
  c_origine constant text := '485677ce1b35c780e354c95abbf752f602f97ea932ca4e433a768bb58b1b0009';
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

  if v_h is distinct from c_origine then
    raise exception using errcode='P0141',
      message = format('RETOUR ARRIERE ANONYMISATION : le corps restaure n''est pas l''original (%s). Transaction annulee.', v_h);
  end if;
  if v_manif is distinct from ' | owner=postgres | secdef=true | config=search_path=public | vol=v | acl=' || c_acl then
    raise exception using errcode='P0141',
      message = format('RETOUR ARRIERE ANONYMISATION : manifeste non conforme (%s). Transaction annulee.', v_manif);
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception using errcode='P0141',
      message = 'RETOUR ARRIERE ANONYMISATION : service_role a PERDU EXECUTE. Transaction annulee.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception using errcode='P0141',
      message = 'RETOUR ARRIERE ANONYMISATION : anon ou authenticated a acquis EXECUTE. Transaction annulee.';
  end if;
  if position('winners_archive' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.proname='anonymize_expired_data')) > 0 then
    raise exception using errcode='P0141',
      message = 'RETOUR ARRIERE ANONYMISATION : winners_archive est encore traite. Transaction annulee.';
  end if;

  raise notice 'RETOUR ARRIERE ANONYMISATION : corps d''origine restaure, l''archive echappe de nouveau a la regle.';
end $verif$;
