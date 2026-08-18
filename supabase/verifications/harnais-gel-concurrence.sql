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
 *  ─── PORTÉE : SYNTHÉTIQUE UNIQUEMENT — VÉRIFIÉ EN SQL, PAS SEULEMENT PROCÉDURAL ───
 *
 *  Signalé une seconde fois le 19/08/2026 : la version précédente ne
 *  vérifiait la cible qu'après coup, côté script Node — les fonctions
 *  `security definer` capables d'activer/désactiver/supprimer la ligne du
 *  gel étaient déjà créées et accordées à `anon` AVANT toute garde
 *  d'identité. Corrigé : ce fichier entier est UNE SEULE transaction dont
 *  la toute première action est une garde SQL qui lève une exception —
 *  sans créer ni accorder aucune fonction — si la cible ne ressemble pas à
 *  une branche synthétique vide (voir plus bas). Aucune valeur de projet
 *  codée en dur : la garde s'appuie sur des FAITS observables (compte de
 *  lignes), pas sur un identifiant de branche.
 *
 *  La garde d'identité par nonce (`zz_harnais_gel_identite()`) reste en
 *  plus, côté script Node, comme deuxième ligne de défense — mais elle
 *  n'est plus la SEULE.
 *
 *  ─── NOMMAGE ───
 *
 *  Préfixe `zz_harnais_gel_` : jamais un nom qui pourrait exister dans une
 *  vraie migration métier, facilement identifiable, facilement supprimable
 *  (`harnais-gel-concurrence-nettoyage.sql`, à exécuter après usage — un
 *  script Node authentifié en `anon` ne peut pas faire de DDL, le nettoyage
 *  des FONCTIONS elles-mêmes reste un geste SQL explicite et volontaire,
 *  lui aussi gardé — voir ce fichier).
 *
 *  ─── CHAQUE APPLICATION RÉGÉNÈRE LE NONCE ───
 *
 *  `zz_harnais_gel_identite()` encode un UUID généré au moment où CE
 *  fichier est appliqué (pas une valeur figée dans le dépôt) — rejouer ce
 *  fichier change le nonce attendu. L'opérateur capture la valeur retournée
 *  par le `select` final et la passe au script Node via la variable
 *  d'environnement `HARNAIS_NONCE_ATTENDU`.
 *
 *  ─── ISOLATION REPEATABLE READ — LA BONNE FORME ───
 *
 *  Signalé le 19/08/2026 : `SET default_transaction_isolation` exécuté À
 *  L'INTÉRIEUR du corps d'une fonction n'a aucun effet (déjà trop tard —
 *  vérifié empiriquement). La forme correcte, documentée par PostgREST,
 *  est un ATTRIBUT DE FONCTION — `set default_transaction_isolation to
 *  'repeatable read'` dans l'en-tête de la fonction, stocké dans
 *  `pg_proc.proconfig`, appliqué par le mécanisme d'appel de fonction
 *  (fmgr) avant que le corps ne s'exécute. **Vérifié en direct le
 *  19/08/2026** : `pg_proc.proconfig` contient bien la valeur, un
 *  rechargement du cache PostgREST (`notify pgrst, 'reload schema'`) puis
 *  un appel REST réel renvoient `current_setting('transaction_isolation')
 *  = 'repeatable read'` — sans toucher `anon` ni `authenticator`, sans
 *  terminer aucune connexion de plateforme. `zz_harnais_gel_ecriture_rr()`
 *  ci-dessous porte cet attribut ; `zz_harnais_gel_ecriture()` (sans
 *  suffixe) reste volontairement en isolation par défaut (READ COMMITTED)
 *  pour les scénarios qui l'exigent spécifiquement.
 */

begin;

/*
 * ─── GARDE : CIBLE SYNTHÉTIQUE, VÉRIFIÉE AVANT TOUTE CRÉATION ───
 *
 * Aucune fonction, aucun grant, tant que cette garde n'a pas explicitement
 * réussi. Un seul utilisateur Auth réel, ou un volume de données métier
 * dépassant une branche de test, fait échouer TOUTE la transaction — rien
 * n'est créé, rien n'est accordé à `anon`.
 */
do $$
declare
  v_utilisateurs_auth int;
  v_profiles          int;
  v_restaurants       int;
  v_contacts          int;
  v_winners           int;
begin
  select count(*) into v_utilisateurs_auth from auth.users;
  select count(*) into v_profiles          from public.profiles;
  select count(*) into v_restaurants       from public.restaurants;
  select count(*) into v_contacts          from public.contacts;
  select count(*) into v_winners           from public.winners;

  if v_utilisateurs_auth > 0 then
    raise exception 'HARNAIS REFUSÉ : % utilisateur(s) Auth réel(s) présent(s) sur cette base — cible non confirmée synthétique. Aucune fonction témoin créée.', v_utilisateurs_auth;
  end if;

  if v_profiles > 0 then
    raise exception 'HARNAIS REFUSÉ : % profil(s) présent(s) alors qu''aucun utilisateur Auth n''existe — état incohérent, cible suspecte. Aucune fonction témoin créée.', v_profiles;
  end if;

  if v_restaurants > 500 or v_contacts > 5000 or v_winners > 5000 then
    raise exception 'HARNAIS REFUSÉ : volume de données métier (% restaurants, % contacts, % gains) dépasse le seuil raisonnable pour une branche synthétique de test. Aucune fonction témoin créée.',
      v_restaurants, v_contacts, v_winners;
  end if;

  raise notice 'GARDE CIBLE SYNTHÉTIQUE : OK (0 utilisateur Auth, 0 profil, volumes de données dans les bornes attendues).';
end $$;

-- ─────────────────────────────────────────────────── identité par nonce

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
 * Transition stricte, signalée le 19/08 (2e tour) : refuse si déjà actif,
 * plutôt que de committer un `update` silencieux qui réinitialiserait
 * `depuis` sur une activation déjà en cours.
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
  v_actif_avant boolean;
  v_lignes      int;
  v_h1          timestamptz;
  v_h2          timestamptz;
begin
  select actif into v_actif_avant from public.maintenance where id;
  if not found then
    raise exception 'ACTIVATION REFUSÉE : ligne maintenance absente.';
  end if;
  if v_actif_avant then
    raise exception 'ACTIVATION REFUSÉE : déjà actif — une deuxième activation ne réinitialise pas depuis.';
  end if;

  update public.maintenance
    set actif = true, depuis = now(), message = 'harnais de concurrence — activation'
    where id and actif = false;
  get diagnostics v_lignes = row_count;
  if v_lignes <> 1 then
    raise exception 'ACTIVATION REFUSÉE : % ligne(s) affectée(s), 1 attendue.', v_lignes;
  end if;

  v_h1 := clock_timestamp();
  if attente_avant_retour > 0 then
    perform pg_sleep(attente_avant_retour);
  end if;
  v_h2 := clock_timestamp();
  return jsonb_build_object('horodatage_update', v_h1, 'horodatage_retour', v_h2);
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
  v_actif_avant boolean;
  v_lignes      int;
  v_h1          timestamptz;
  v_h2          timestamptz;
begin
  select actif into v_actif_avant from public.maintenance where id;
  if not found then
    raise exception 'LEVÉE REFUSÉE : ligne maintenance absente.';
  end if;
  if not v_actif_avant then
    raise exception 'LEVÉE REFUSÉE : déjà inactif.';
  end if;

  update public.maintenance
    set actif = false, depuis = null, message = 'Service momentanément suspendu. Merci de réessayer dans quelques minutes.'
    where id and actif = true;
  get diagnostics v_lignes = row_count;
  if v_lignes <> 1 then
    raise exception 'LEVÉE REFUSÉE : % ligne(s) affectée(s), 1 attendue.', v_lignes;
  end if;

  v_h1 := clock_timestamp();
  if attente_avant_retour > 0 then
    perform pg_sleep(attente_avant_retour);
  end if;
  v_h2 := clock_timestamp();
  return jsonb_build_object('horodatage_update', v_h1, 'horodatage_retour', v_h2);
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
 * anonyme utiliserait. Isolation par défaut de la session (READ COMMITTED
 * sur ce projet) — voir `zz_harnais_gel_ecriture_rr` ci-dessous pour la
 * variante REPEATABLE READ.
 *
 * `attente_avant_lecture` borne un délai avant la première tentative —
 * sert à synchroniser grossièrement avec l'orchestrateur. `attente_apres_ecriture`
 * (uniquement si l'écriture a réussi) maintient la transaction ouverte —
 * donc le verrou `for share` pris par le trigger tenu — AVANT que la
 * fonction ne rende la main, pour construire le scénario « écriture déjà
 * en vol au moment de l'activation ». Ni l'un ni l'autre ne prouve un
 * ordre à eux seuls : la preuve vient des champs retournés (niveau
 * d'isolation, code d'erreur, horodatages), comparés après coup.
 */
create or replace function public.zz_harnais_gel_ecriture(attente_avant_lecture float default 0, attente_apres_ecriture float default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_niveau  text := current_setting('transaction_isolation');
  v_rid     uuid := gen_random_uuid();
  v_ok      boolean := false;
  v_code    text;
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
  end;
  if v_ok and attente_apres_ecriture > 0 then
    perform pg_sleep(attente_apres_ecriture);
  end if;
  v_h_apres := clock_timestamp();
  return jsonb_build_object(
    'niveau_isolation', v_niveau,
    'ecriture_ok', v_ok, 'code_erreur', v_code,
    'horodatage_avant', v_h_avant, 'horodatage_apres', v_h_apres
  );
end;
$$;
revoke all on function public.zz_harnais_gel_ecriture(float, float) from public;
grant execute on function public.zz_harnais_gel_ecriture(float, float) to anon;

/*
 * Variante REPEATABLE READ — identique à `zz_harnais_gel_ecriture()` sauf
 * l'attribut `set default_transaction_isolation to 'repeatable read'`
 * dans l'en-tête, qui force le niveau de LA TRANSACTION APPELANTE (pas
 * seulement une valeur par défaut pour de futures transactions) — vérifié
 * le 19/08/2026 par appel REST réel, `pg_proc.proconfig` à l'appui.
 *
 * `attente_snapshot_puis_ecriture` — AJOUTÉ après un premier essai bâclé
 * (19/08, 4e tour) : sans lecture séparée AVANT la tentative d'écriture,
 * le premier vrai statement de cette fonction ÉTAIT l'insert lui-même —
 * l'instantané se fixait donc AU MOMENT de la tentative, jamais avant.
 * Une fenêtre de 50 ms entre le lancement de A et l'activation de B s'est
 * révélée être une course pure (parfois A committait déjà avant même que
 * B ne démarre) plutôt qu'une preuve — détecté par un résultat incohérent
 * (`ecriture_ok` vrai avec un instantané censé être périmé), pas ignoré.
 * Corrigé : une lecture ORDINAIRE (non verrouillante) fixe l'instantané
 * en premier, PUIS ce délai retient la transaction ouverte pendant que
 * l'activation a lieu ailleurs, PUIS seulement la tentative d'écriture —
 * qui rencontre alors le verrou `for share` sur une ligne déjà modifiée
 * par une transaction validée après l'instantané.
 */
create or replace function public.zz_harnais_gel_ecriture_rr(attente_avant_lecture float default 0, attente_snapshot_puis_ecriture float default 0, attente_apres_ecriture float default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set default_transaction_isolation to 'repeatable read'
as $$
declare
  v_niveau     text := current_setting('transaction_isolation');
  v_actif_vu   boolean;
  v_rid        uuid := gen_random_uuid();
  v_ok         boolean := false;
  v_code       text;
  v_h_snapshot timestamptz;
  v_h_avant    timestamptz;
  v_h_apres    timestamptz;
begin
  if attente_avant_lecture > 0 then
    perform pg_sleep(attente_avant_lecture);
  end if;

  -- Lecture ORDINAIRE (pas de for share) : fixe l'instantané REPEATABLE
  -- READ de cette transaction, sans encore tenter d'écrire.
  select actif into v_actif_vu from public.maintenance where id;
  v_h_snapshot := clock_timestamp();

  if attente_snapshot_puis_ecriture > 0 then
    perform pg_sleep(attente_snapshot_puis_ecriture);
  end if;

  v_h_avant := clock_timestamp();
  begin
    insert into public.restaurants (id, name, slug)
      values (v_rid, 'zz-harnais-gel', 'zz-harnais-gel-' || substr(v_rid::text, 1, 12));
    v_ok := true;
  exception when others then
    v_ok := false;
    v_code := sqlstate;
  end;
  if v_ok and attente_apres_ecriture > 0 then
    perform pg_sleep(attente_apres_ecriture);
  end if;
  v_h_apres := clock_timestamp();
  return jsonb_build_object(
    'niveau_isolation', v_niveau, 'actif_au_snapshot', v_actif_vu,
    'ecriture_ok', v_ok, 'code_erreur', v_code,
    'horodatage_snapshot', v_h_snapshot, 'horodatage_avant', v_h_avant, 'horodatage_apres', v_h_apres
  );
end;
$$;
revoke all on function public.zz_harnais_gel_ecriture_rr(float, float, float) from public;
grant execute on function public.zz_harnais_gel_ecriture_rr(float, float, float) to anon;

-- ──────────────────────────────────────────────── nettoyage de données

/*
 * Nettoyage DE DONNÉES seulement (ce qu'un rôle anon peut faire via ces
 * fonctions SECURITY DEFINER) — pas de DDL. Le script Node l'appelle après
 * CHAQUE scénario, dans un `finally` — c'est le bouton de réinitialisation
 * interne du harnais pendant qu'il tourne, pas le nettoyage final : celui-
 * là est un geste SQL séparé, volontaire et lui-même gardé (voir
 * `harnais-gel-concurrence-nettoyage.sql`).
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

-- Recharger le cache de schéma PostgREST : sans ça, les fonctions
-- nouvelles/modifiées (dont les attributs proconfig de la variante RR)
-- peuvent ne pas être prises en compte immédiatement par les appels REST.
notify pgrst, 'reload schema';

commit;

-- Retourne le nonce pour que l'opérateur le capture avant de lancer le script Node.
select public.zz_harnais_gel_identite() as nonce_a_transmettre_au_script;
