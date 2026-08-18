/*
 * ═══════════════════════════════════════════════════════════════════════
 *  SENTINELLES — un objet neuf naît-il fermé ?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Le durcissement des privilèges par défaut ne se relit pas : il se
 * constate. On crée donc réellement une table, une vue, une séquence et une
 * fonction, on lit leurs ACL, et on annule tout.
 *
 * ─── L'astuce, parce qu'elle n'est pas évidente ───
 *
 * Une transaction annulée emporte les objets ET les résultats. Le tour de
 * passe-passe tient à une propriété de PL/pgSQL : les affectations de
 * VARIABLES ne sont pas transactionnelles. Seules les modifications de la
 * base le sont.
 *
 * On crée donc les objets dans un sous-bloc, on range les mesures dans une
 * variable, puis on lève volontairement une exception. Le sous-bloc est
 * annulé — les quatre objets disparaissent — mais la variable survit et on
 * la restitue.
 *
 * Aucune trace, aucun nettoyage à faire, et rien à oublier de nettoyer.
 *
 * ─── Ce qui est attendu, après le durcissement ───
 *
 *     anon, authenticated · table, vue, séquence  → AUCUN privilège
 *     service_role · table, vue                   → DELETE, INSERT, SELECT, UPDATE
 *     service_role · séquence                     → SELECT, USAGE
 *     service_role · fonction                     → EXECUTE
 *     postgres                                    → propriétaire, non contraint
 *
 * ─── L'exception, mesurée et assumée ───
 *
 *     PUBLIC · fonction  → EXECUTE, et on ne peut pas l'empêcher ici.
 *
 * `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
 * n'enregistre rien sur cette instance : vérifié le 18/08 sur PostgreSQL
 * 17.6, sur deux transactions séparées, avant grant, après grant, et sur une
 * entrée vierge. Toute fonction neuve naît donc exécutable par PUBLIC.
 *
 * Cette ligne rend `LIMITE CONNUE` et non `ANOMALIE`. Ce n'est pas une
 * indulgence : un test rouge en permanence finit par ne plus être lu, et le
 * jour où une vraie anomalie apparaît, personne ne la voit. La protection
 * réelle est ailleurs — chaque fonction porte son propre revoke, et
 * `durcissement.test.ts` refuse toute migration qui l'oublie.
 *
 * Si cette ligne passait un jour à `absent`, ce serait une bonne nouvelle à
 * vérifier, pas un test cassé.
 *
 * Tout autre écart rend `ANOMALIE`. Un privilège en trop comme un privilège
 * en moins : les deux signalent que les défauts ne sont plus ceux qu'on croit.
 */

create or replace function pg_temp.sentinelles()
returns table(objet text, beneficiaire text, privileges text, attendu text, verdict text)
language plpgsql
as $$
declare
  mesures text[] := '{}';
  r record;
  attendu_service constant jsonb := jsonb_build_object(
    'table',    'DELETE,INSERT,SELECT,UPDATE',
    'vue',      'DELETE,INSERT,SELECT,UPDATE',
    'sequence', 'SELECT,USAGE',
    'fonction', 'EXECUTE');
  vus text[] := '{}';
  k text;
begin
  begin
    execute 'create table public.zz_sentinelle_t (id int primary key)';
    execute 'create view  public.zz_sentinelle_v as select 1 as x';
    execute 'create sequence public.zz_sentinelle_s';
    execute 'create function public.zz_sentinelle_f() returns int language sql immutable as ''select 1''';

    for r in
      with acls as (
        select 'table' as objet, c.relacl as acl from pg_class c where c.oid = 'public.zz_sentinelle_t'::regclass
        union all
        select 'vue', c.relacl from pg_class c where c.oid = 'public.zz_sentinelle_v'::regclass
        union all
        select 'sequence', c.relacl from pg_class c where c.oid = 'public.zz_sentinelle_s'::regclass
        union all
        select 'fonction', p.proacl from pg_proc p where p.oid = 'public.zz_sentinelle_f()'::regprocedure
      )
      select a.objet,
             case when e.grantee = 0 then 'PUBLIC' else e.grantee::regrole::text end as ben,
             string_agg(distinct e.privilege_type, ',' order by e.privilege_type) as privs
      from acls a
      -- LEFT JOIN LATERAL : un ACL NULL ne produit aucune ligne avec
      -- aclexplode. Sans ce left join, un objet parfaitement fermé
      -- disparaîtrait du rapport au lieu d'y figurer comme fermé.
      left join lateral aclexplode(a.acl) e on true
      group by 1, 2
    loop
      mesures := mesures || (r.objet || '|' || coalesce(r.ben, '(aucun)') || '|' || coalesce(r.privs, '(aucun)'));
    end loop;

    -- Annulation volontaire : les quatre objets n'existeront jamais.
    raise exception using message = 'annulation voulue', errcode = 'P0001';
  exception when others then
    -- Le sous-bloc est annulé. `mesures` a survécu, c'est tout l'intérêt.
    null;
  end;

  foreach k in array mesures loop
    objet        := split_part(k, '|', 1);
    beneficiaire := split_part(k, '|', 2);
    privileges   := split_part(k, '|', 3);
    vus          := vus || (objet || '/' || beneficiaire);

    if beneficiaire = 'PUBLIC' and objet = 'fonction' then
      attendu := 'EXECUTE — non refermable par les défauts (mesuré 18/08)';
      verdict := 'LIMITE CONNUE';
    elsif beneficiaire in ('anon', 'authenticated', 'PUBLIC') then
      attendu := 'aucun privilège';
      verdict := 'ANOMALIE';
    elsif beneficiaire = 'service_role' then
      attendu := attendu_service ->> objet;
      verdict := case when privileges = attendu_service ->> objet then 'conforme' else 'ANOMALIE' end;
    else
      attendu := 'propriétaire, non contraint';
      verdict := 'conforme';
    end if;
    return next;
  end loop;

  -- Un privilège ABSENT est aussi une anomalie : le serveur cesserait de
  -- fonctionner sur les objets de la fusion, et un test qui ne regarde que
  -- les excès ne le verrait jamais.
  foreach k in array array['table','vue','sequence','fonction'] loop
    if not (k || '/service_role') = any(vus) then
      objet := k; beneficiaire := 'service_role'; privileges := '(aucun)';
      attendu := attendu_service ->> k; verdict := 'ANOMALIE';
      return next;
    end if;
  end loop;
end $$;

select * from pg_temp.sentinelles() order by objet, beneficiaire;

-- Verdict d'ensemble : une seule ligne, lisible sans interprétation.
select count(*) filter (where verdict = 'ANOMALIE') as anomalies,
       count(*) filter (where verdict = 'LIMITE CONNUE') as limites_connues,
       count(*) as lignes,
       case when count(*) filter (where verdict = 'ANOMALIE') = 0
            then 'CONFORME — table, vue et séquence naissent fermées ; '
                 'les fonctions restent ouvertes à PUBLIC, fermées une par une'
            else 'ANOMALIE — voir le détail ci-dessus' end as verdict
from pg_temp.sentinelles();
