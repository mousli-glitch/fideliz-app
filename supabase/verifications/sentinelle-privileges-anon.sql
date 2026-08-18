/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SENTINELLE — aucun droit excessif pour anon / authenticated
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  À jouer après toute reconstruction, et avant de déclarer un environnement
 *  conforme. Elle échoue bruyamment plutôt que de rendre une ligne verte.
 *
 *  ─── Ce qu'elle attrape, et pourquoi ça compte ───
 *
 *  Un `alter default privileges ... grant` n'enlève rien : il s'AJOUTE à ce
 *  qui préexiste. Une base vierge peut déjà accorder les huit privilèges sur
 *  les tables. La baseline accordait donc cinq droits en croyant les définir,
 *  pendant que REFERENCES, TRIGGER et TRUNCATE restaient acquis — 114
 *  privilèges de trop, mesurés sur une reconstruction réelle.
 *
 *  TRUNCATE mérite l'attention : **la RLS ne le filtre pas**. Une policy ne
 *  s'applique qu'aux lignes lues, insérées, modifiées ou supprimées par
 *  DELETE. TRUNCATE vide la table entière sans passer par elle.
 *
 *  ─── Deux contrôles, pas un ───
 *
 *  Les privilèges DÉJÀ posés sur les relations existantes, et les privilèges
 *  PAR DÉFAUT qui décideront des objets futurs. Corriger les premiers sans les
 *  seconds laisse le défaut revenir à la prochaine table créée.
 */

do $$
declare
  v_relations int;
  v_defauts   int;
  v_detail    text;
begin
  -- 1. Relations existantes
  select count(*), string_agg(distinct c.relname||':'||a.privilege_type, ', ')
    into v_relations, v_detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'public'
    and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
    and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');

  if v_relations > 0 then
    raise exception 'SENTINELLE : % privilege(s) excessif(s) sur des relations existantes. %',
      v_relations, left(v_detail, 400);
  end if;

  -- 2. Privilèges par défaut — ce qui décidera des objets FUTURS
  select count(*) into v_defauts
  from pg_default_acl d
  join pg_namespace ns on ns.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where ns.nspname = 'public'
    and d.defaclobjtype = 'r'
    and pg_get_userbyid(d.defaclrole) = 'postgres'
    and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
    and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');

  if v_defauts > 0 then
    raise exception 'SENTINELLE : % privilege(s) excessif(s) dans les DEFAUTS. '
      'Les relations actuelles sont saines, mais la prochaine table creee ne le sera pas.', v_defauts;
  end if;

  raise notice 'SENTINELLE OK : aucun TRUNCATE/TRIGGER/REFERENCES pour anon ou authenticated, '
    'ni sur les relations existantes ni dans les defauts.';
end $$;
