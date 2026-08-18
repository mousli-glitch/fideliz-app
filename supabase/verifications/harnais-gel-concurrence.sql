/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS DE CONCURRENCE — fonctions témoins pour le gel source Fideliz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Signalé le 19/08/2026 : la matrice de concurrence précédente n'existait
 *  qu'en documentation — ses fonctions et son script d'orchestration avaient
 *  été supprimés après usage. Elle n'était donc pas réellement rejouable.
 *  Ce fichier verse les fonctions témoins ; `scripts/harnais-gel-concurrence.mjs`
 *  verse l'orchestration Node (fetch natif, aucune dépendance ajoutée).
 *
 *  ─── PORTÉE : SYNTHÉTIQUE UNIQUEMENT ───
 *
 *  À appliquer SEULEMENT sur une branche Supabase de test (ex.
 *  `fusion-tests-2`), jamais sur la production. Rien ici ne le vérifie au
 *  niveau SQL — la garde d'identité par nonce vit côté script Node
 *  (`scripts/harnais-gel-concurrence.mjs`), qui refuse de continuer si le
 *  nonce renvoyé par `zz_harnais_gel_identite()` ne correspond pas à celui
 *  que l'opérateur a capturé au moment de l'application de CE fichier.
 *
 *  ─── NOMMAGE ───
 *
 *  Préfixe `zz_harnais_gel_` : jamais un nom qui pourrait exister dans une
 *  vraie migration métier, facilement identifiable, facilement supprimable
 *  (`harnais-gel-concurrence-nettoyage.sql`, à exécuter après usage — un
 *  script Node authentifié en `anon` ne peut pas faire de DDL, le nettoyage
 *  des FONCTIONS reste un geste SQL explicite et volontaire).
 *
 *  ─── CHAQUE APPLICATION RÉGÉNÈRE LE NONCE ───
 *
 *  `zz_harnais_gel_identite()` encode un UUID généré au moment où CE
 *  fichier est appliqué (pas une valeur figée dans le dépôt) — rejouer ce
 *  fichier change le nonce attendu. L'opérateur capture la valeur retournée
 *  par le `select` final et la passe au script Node via la variable
 *  d'environnement `HARNAIS_NONCE_ATTENDU`.
 */

do $$
declare
  v_nonce uuid := gen_random_uuid();
begin
  execute format($fmt$
    create or replace function public.zz_harnais_gel_identite()
    returns text
    language sql
    stable
    security definer
    set search_path to 'public'
    as $body$ select %L::text $body$
  $fmt$, v_nonce::text);
end $$;

revoke all on function public.zz_harnais_gel_identite() from public;
grant execute on function public.zz_harnais_gel_identite() to anon;

-- ─────────────────────────────────────────── état courant, lecture seule

create or replace function public.zz_harnais_gel_etat()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object('actif', actif, 'depuis', depuis, 'message', message)
  from public.maintenance where id
$$;
revoke all on function public.zz_harnais_gel_etat() from public;
grant execute on function public.zz_harnais_gel_etat() to anon;

-- ─────────────────────────────────────── activation / levée, propriétaire

/*
 * SECURITY DEFINER : exécute avec les droits du propriétaire (postgres),
 * malgré l'appel authentifié `anon` — c'est la seule raison pour laquelle
 * un appel REST anonyme peut activer un drapeau qu'`anon` n'a plus le
 * droit de toucher directement depuis le 19/08 (P0 service_role). Réservé
 * au harnais de test : jamais accordé à `anon` sur autre chose que ces
 * fonctions étroites, jamais utilisé pour le vrai runbook de bascule
 * (voir `activer-gel-source-fideliz.sql` / `lever-gel-source-fideliz.sql`).
 *
 * `attente_avant_retour` : maintient la transaction ouverte (donc le
 * verrou NO KEY UPDATE tenu) pendant N secondes AVANT que la fonction ne
 * rende la main — PostgREST ne committe qu'à ce moment-là. Sert à
 * construire le scénario « B non committé pendant que A bloque ».
 */
create or replace function public.zz_harnais_gel_activer(attente_avant_retour float default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pid  int := pg_backend_pid();
  v_xid  bigint;
  v_h1   timestamptz;
  v_h2   timestamptz;
begin
  update public.maintenance
    set actif = true, depuis = now(), message = 'harnais de concurrence — activation'
    where id;
  v_xid := pg_current_xact_id()::text::bigint;
  v_h1 := clock_timestamp();
  if attente_avant_retour > 0 then
    perform pg_sleep(attente_avant_retour);
  end if;
  v_h2 := clock_timestamp();
  return jsonb_build_object(
    'pid_backend', v_pid, 'xid_transaction', v_xid,
    'horodatage_update', v_h1, 'horodatage_retour', v_h2
  );
end;
$$;
revoke all on function public.zz_harnais_gel_activer(float) from public;
grant execute on function public.zz_harnais_gel_activer(float) to anon;

create or replace function public.zz_harnais_gel_desactiver(attente_avant_retour float default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_h1 timestamptz;
  v_h2 timestamptz;
begin
  update public.maintenance
    set actif = false, depuis = null, message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.'
    where id;
  v_h1 := clock_timestamp();
  if attente_avant_retour > 0 then
    perform pg_sleep(attente_avant_retour);
  end if;
  v_h2 := clock_timestamp();
  return jsonb_build_object('ok', true, 'horodatage_update', v_h1, 'horodatage_retour', v_h2);
end;
$$;
revoke all on function public.zz_harnais_gel_desactiver(float) from public;
grant execute on function public.zz_harnais_gel_desactiver(float) to anon;

/*
 * Force la ligne unique à disparaître puis réapparaître, pour le scénario
 * « ligne maintenance absente ». Recrée avec actif=false à chaque fois —
 * jamais un état activé oublié entre deux essais.
 */
create or replace function public.zz_harnais_gel_supprimer_ligne()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.maintenance where id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.zz_harnais_gel_supprimer_ligne() from public;
grant execute on function public.zz_harnais_gel_supprimer_ligne() to anon;

create or replace function public.zz_harnais_gel_restaurer_ligne()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.maintenance (id, actif) values (true, false)
    on conflict (id) do update set actif = false, depuis = null;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.zz_harnais_gel_restaurer_ligne() from public;
grant execute on function public.zz_harnais_gel_restaurer_ligne() to anon;

-- ────────────────────────────────────────────────── témoin d'écriture (A)

/*
 * `anon`, jamais `service_role` — exactement le rôle qu'un appel PostgREST
 * anonyme utiliserait. L'isolation REPEATABLE READ, quand le scénario en a
 * besoin, est obtenue par `alter role anon set default_transaction_isolation`
 * appliqué par le script Node juste avant l'appel (voir
 * scripts/harnais-gel-concurrence.mjs — `SET default_transaction_isolation`
 * DEPUIS l'intérieur de cette fonction n'a AUCUN effet sur la transaction en
 * cours, vérifié empiriquement le 19/08 : PostgREST a déjà exécuté sa propre
 * préparation de requête avant d'appeler la fonction, donc "avant toute
 * requête" est déjà faux au moment où le corps de la fonction s'exécute).
 *
 * `attente_avant_lecture` borne un délai avant la première tentative —
 * sert à synchroniser grossièrement avec l'orchestrateur. `attente_apres_ecriture`
 * (uniquement si l'écriture a réussi) maintient la transaction ouverte —
 * donc le verrou `for share` pris par le trigger tenu — AVANT que la
 * fonction ne rende la main, pour construire le scénario « écriture déjà
 * en vol au moment de l'activation ». Ni l'un ni l'autre ne prouve un
 * ordre à eux seuls : la preuve vient des champs retournés (xid, pid,
 * horodatages, niveau d'isolation), comparés après coup.
 */
create or replace function public.zz_harnais_gel_ecriture(attente_avant_lecture float default 0, attente_apres_ecriture float default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_niveau  text := current_setting('transaction_isolation');
  v_pid     int  := pg_backend_pid();
  v_rid     uuid := gen_random_uuid();
  v_ok      boolean := false;
  v_code    text;
  v_msg     text;
  v_h_avant timestamptz;
  v_h_apres timestamptz;
begin
  if attente_avant_lecture > 0 then
    perform pg_sleep(attente_avant_lecture);
  end if;
  v_h_avant := clock_timestamp();
  begin
    insert into public.restaurants (id, name, slug)
      values (v_rid, 'zz-harnais-gel', 'zz-harnais-gel-' || substr(v_rid::text, 1, 12));
    v_ok := true;
  exception when others then
    v_ok := false;
    v_code := sqlstate;
    v_msg := sqlerrm;
  end;
  if v_ok and attente_apres_ecriture > 0 then
    perform pg_sleep(attente_apres_ecriture);
  end if;
  v_h_apres := clock_timestamp();
  return jsonb_build_object(
    'niveau_isolation', v_niveau, 'pid_backend', v_pid,
    'ecriture_ok', v_ok, 'code_erreur', v_code, 'message_erreur', v_msg,
    'horodatage_avant', v_h_avant, 'horodatage_apres', v_h_apres,
    'ligne_id', v_rid
  );
end;
$$;
revoke all on function public.zz_harnais_gel_ecriture(float, float) from public;
grant execute on function public.zz_harnais_gel_ecriture(float, float) to anon;

-- ──────────────────────────────────────────────── nettoyage de données

/*
 * Nettoyage DE DONNÉES seulement (ce qu'un rôle anon peut faire via ces
 * fonctions SECURITY DEFINER) — pas de DDL. Le script Node l'appelle dans
 * un `finally`, quel que soit le résultat des scénarios. Le nettoyage des
 * FONCTIONS elles-mêmes est un geste SQL séparé et volontaire
 * (`harnais-gel-concurrence-nettoyage.sql`).
 */
create or replace function public.zz_harnais_gel_nettoyage()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_supprimees int;
begin
  delete from public.restaurants where name = 'zz-harnais-gel';
  get diagnostics v_supprimees = row_count;
  insert into public.maintenance (id, actif) values (true, false)
    on conflict (id) do update set actif = false, depuis = null,
      message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.';
  return jsonb_build_object('lignes_restaurants_supprimees', v_supprimees, 'etat_final', public.zz_harnais_gel_etat());
end;
$$;
revoke all on function public.zz_harnais_gel_nettoyage() from public;
grant execute on function public.zz_harnais_gel_nettoyage() to anon;

-- Retourne le nonce pour que l'opérateur le capture avant de lancer le script Node.
select public.zz_harnais_gel_identite() as nonce_a_transmettre_au_script;
