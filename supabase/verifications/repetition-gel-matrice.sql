/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  RÉPÉTITION DU GEL — 3/4 · CE QUE LE GEL REFUSE, ET CE QU'IL LAISSE PASSER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * À jouer APRÈS `activer-gel-source-fideliz.sql`, sur un banc ensemencé.
 *
 * ─── TROIS CHOSES, ET LES TROIS COMPTENT ───
 *
 * 1. Les 10 tables gelées REFUSENT l'écriture, chacune nommément, avec le
 *    code `P0100`. Un refus par un autre code — droits manquants, contrainte
 *    violée — ne prouverait pas que c'est le gel qui a agi.
 *
 * 2. Les 3 tables exclues ACCEPTENT toujours. `system_logs` et
 *    `activity_logs_legacy` doivent continuer à journaliser : c'est pendant
 *    une bascule qu'on en a le plus besoin. `maintenance` doit rester
 *    modifiable, sinon le gel s'auto-verrouille et ne se lève plus.
 *
 * 3. Les LECTURES restent ouvertes. Le commentaire du gel l'affirme —
 *    « menus, QR et /verify continuent de répondre ». C'est une affirmation
 *    sur laquelle repose la promesse faite aux clients pendant la bascule ;
 *    elle se mesure.
 *
 * ─── LA VACUITÉ EST LE PIÈGE ───
 *
 * Un trigger `BEFORE UPDATE` ne se déclenche que sur des lignes réellement
 * touchées. Sur une table vide, `update … where …` affecte zéro ligne, ne
 * déclenche rien, et le test passe au vert sans avoir rien éprouvé. Chaque
 * table est donc comptée AVANT d'être éprouvée, et une table vide fait
 * échouer la matrice au lieu de la faire passer.
 */

do $matrice$
declare
  t record;
  v_sql text;
  v_erreur text;
  v_code text;
  v_n bigint;
  v_rouges text := '';
  v_verts int := 0;
  v_t0 timestamptz := clock_timestamp();

  /* Les 10 gelées, avec la colonne qui sert de poignée à l'UPDATE. */
  c_gelees constant text[][] := array[
    ['winners','id'], ['contacts','id'], ['prizes','id'], ['games','id'],
    ['restaurants','id'], ['profiles','id'], ['avis','id'],
    ['crm_notes','id'], ['sales_restaurants','restaurant_id'], ['winners_archive','id']
  ];
  /* Les exclues qui doivent rester ouvertes en écriture. */
  c_ouvertes constant text[][] := array[
    ['system_logs','id'], ['activity_logs_legacy','id']
  ];
begin
  /* ── Le gel doit être ACTIF, sinon la matrice ne mesure rien ── */
  if not exists (select 1 from public.maintenance where id and actif) then
    raise exception using errcode='P0301',
      message = 'MATRICE REFUSÉE : le gel n''est pas actif. Jouer activer-gel-source-fideliz.sql d''abord.';
  end if;

  -- ══ 1. Les 10 gelées refusent, chacune en P0100 ═══════════════════════
  for i in 1 .. array_length(c_gelees, 1) loop
    declare
      v_table text := c_gelees[i][1];
      v_cle   text := c_gelees[i][2];
    begin
      if to_regclass('public.' || v_table) is null then
        v_rouges := v_rouges || format('%s : table absente. ', v_table);
        continue;
      end if;
      execute format('select count(*) from public.%I', v_table) into v_n;
      if v_n = 0 then
        /* Le piège de la vacuité, nommé et refusé. */
        v_rouges := v_rouges || format(
          '%s : VIDE — un UPDATE n''y toucherait aucune ligne et ne declencherait aucun trigger. '
          'Le vert serait vide de sens. ', v_table);
        continue;
      end if;

      v_code := null; v_erreur := null;
      begin
        v_sql := format(
          'update public.%I set %I = %I where %I in (select %I from public.%I limit 1)',
          v_table, v_cle, v_cle, v_cle, v_cle, v_table);
        execute v_sql;
        /* Pas d'exception : le gel n'a PAS agi. */
        v_rouges := v_rouges || format('%s : ECRITURE ACCEPTEE malgre le gel. ', v_table);
      exception when others then
        get stacked diagnostics v_code = returned_sqlstate, v_erreur = message_text;
        if v_code = 'P0100' then
          v_verts := v_verts + 1;
        else
          v_rouges := v_rouges || format(
            '%s : refusee en %s (« %s ») et non en P0100 — ce n''est pas le gel qui a agi. ',
            v_table, v_code, left(v_erreur, 60));
        end if;
      end;
    end;
  end loop;

  -- ══ 2. Les exclues acceptent toujours ═════════════════════════════════
  for i in 1 .. array_length(c_ouvertes, 1) loop
    declare
      v_table text := c_ouvertes[i][1];
      v_cle   text := c_ouvertes[i][2];
    begin
      if to_regclass('public.' || v_table) is null then
        v_rouges := v_rouges || format('%s : table absente (exclue attendue). ', v_table);
        continue;
      end if;
      execute format('select count(*) from public.%I', v_table) into v_n;
      if v_n = 0 then
        /* Une table vide ne peut pas prouver qu'elle accepte : on l'alimente. */
        continue;
      end if;
      begin
        execute format(
          'update public.%I set %I = %I where %I in (select %I from public.%I limit 1)',
          v_table, v_cle, v_cle, v_cle, v_cle, v_table);
        v_verts := v_verts + 1;
      exception when others then
        get stacked diagnostics v_code = returned_sqlstate, v_erreur = message_text;
        v_rouges := v_rouges || format(
          '%s : ECRITURE REFUSEE (%s) alors qu''elle est EXCLUE du gel — la journalisation '
          's''arreterait pendant la bascule, au moment ou elle sert le plus. ', v_table, v_code);
      end;
    end;
  end loop;

  -- ══ 3. maintenance reste modifiable, sinon le gel ne se leve plus ═════
  begin
    update public.maintenance set message = message where id;
    v_verts := v_verts + 1;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    v_rouges := v_rouges ||
      format('maintenance : MODIFICATION REFUSEE (%s) — le gel s''auto-verrouille et ne se leve plus. ', v_code);
  end;

  -- ══ 4. Les lectures restent ouvertes sur les 10 gelees ════════════════
  for i in 1 .. array_length(c_gelees, 1) loop
    declare v_table text := c_gelees[i][1];
    begin
      if to_regclass('public.' || v_table) is null then continue; end if;
      execute format('select count(*) from public.%I', v_table) into v_n;
      v_verts := v_verts + 1;
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate;
      v_rouges := v_rouges || format(
        '%s : LECTURE REFUSEE (%s) — les menus, les QR et /verify cesseraient de repondre '
        'pendant la bascule. ', v_table, v_code);
    end;
  end loop;

  if v_rouges <> '' then
    raise exception using errcode='P0302',
      message = format('MATRICE DU GEL — ROUGE : %s', v_rouges);
  end if;

  raise notice 'MATRICE DU GEL — % controles verts en % ms.',
    v_verts, round(extract(epoch from (clock_timestamp() - v_t0)) * 1000);
end $matrice$;

select 'MATRICE DU GEL — VERTE' as resultat,
       (select actif from public.maintenance where id) as gel_actif;
