/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  UNE FENÊTRE DE SUPPRESSION APPARTIENT À UNE OPÉRATION, PAS À UN COMPTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Signalé le 19/08/2026, et c'est juste. La barrière de la migration
 * 20260819020000 ferme la course ÉCRIVAIN ↔ SUPPRESSION. Elle ne ferme pas la
 * course SUPPRESSION ↔ SUPPRESSION :
 *
 *   1. deux appels de suppression du même compte passent le préflight avant
 *      que le marqueur n'existe ;
 *   2. `on conflict do update` les laisse tous deux « ouvrir » la fenêtre, et
 *      poursuivre en parallèle ;
 *   3. le premier échoue ou termine, et appelle `fermer_fenetre_suppression` ;
 *   4. le marqueur disparaît alors que le SECOND n'a pas encore atteint
 *      l'irréversible ;
 *   5. un rattachement peut passer, et la cascade l'emporte.
 *
 * `on conflict do update` était donc le défaut : il écrasait silencieusement
 * une opération en cours au lieu de la reconnaître.
 *
 * ─── LA FORME RETENUE ───
 *
 * Le marqueur porte un JETON, généré par la base, non forgeable par
 * l'appelant. Trois règles, et aucune n'écrase quoi que ce soit :
 *
 *   — ouvrir sans jeton, aucune fenêtre existante  -> une fenêtre naît, son
 *     jeton est rendu ;
 *   — ouvrir sans jeton, une fenêtre existe déjà   -> REFUS (P0105) : une
 *     autre opération travaille sur ce compte ;
 *   — ouvrir AVEC le jeton d'une fenêtre existante -> reprise explicite de
 *     la MÊME opération, la barrière est reprise.
 *
 * Fermer exige le jeton. Une fenêtre étrangère n'est jamais supprimée
 * (P0106). Fermer une fenêtre déjà absente reste sans erreur : une reprise ne
 * doit pas échouer là-dessus.
 *
 * ─── LA VOIE DE RÉPARATION ───
 *
 * Une fenêtre dont le jeton est perdu — le processus qui la tenait a disparu
 * — bloquerait tout rattachement futur à ce compte, indéfiniment.
 * `forcer_fermeture_fenetre` existe pour ça : elle ne demande pas le jeton,
 * elle rend la ligne qu'elle a retirée (pour que l'appelant la trace), et
 * elle n'est appelable que depuis une action gardée `root`. C'est une voie
 * explicite et traçable, pas un DELETE manuel dans une console.
 *
 * MIGRATION ADDITIVE : une colonne s'ajoute à une table créée deux migrations
 * plus tôt, et deux fonctions sont remplacées. Aucune table métier n'est
 * touchée.
 *
 * ORDRE DE DÉPLOIEMENT : migration AVANT code, comme les précédentes.
 */

alter table public.comptes_en_suppression
  add column if not exists jeton uuid not null default gen_random_uuid();

comment on column public.comptes_en_suppression.jeton is
  'Propriétaire de l''opération. Généré par la base : l''appelant ne peut pas le forger. Exigé pour refermer la fenêtre.';

-- ─────────────────────────────────────────── ouvrir : jamais écraser

create or replace function public.ouvrir_fenetre_suppression(
  p_user_id   uuid,
  p_demandeur uuid default null,
  p_jeton     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_jeton uuid;
begin
  if p_user_id is null then
    raise exception using errcode = 'P0104', message = 'Compte cible manquant : fenêtre non ouverte.';
  end if;

  /*
   * `insert` d'abord, rattrapage sur conflit ensuite. Deux appels concurrents
   * se sérialisent sur la clé primaire : le second attend le commit du
   * premier, puis reçoit `unique_violation` — donc voit forcément la fenêtre
   * de l'autre. Un `select` préalable, lui, ne verrait rien.
   */
  begin
    insert into public.comptes_en_suppression (user_id, demandeur)
    values (p_user_id, p_demandeur)
    returning jeton into v_jeton;
  exception when unique_violation then
    select c.jeton into v_jeton
    from public.comptes_en_suppression c
    where c.user_id = p_user_id
    for update;

    if p_jeton is null or v_jeton is distinct from p_jeton then
      raise exception using
        errcode = 'P0105',
        message = 'Une suppression de ce compte est déjà en cours : ouverture refusée.',
        hint    = 'fenetre_deja_ouverte';
    end if;
    -- Même jeton : reprise explicite de la même opération.
    update public.comptes_en_suppression
       set ouvert_le = now(), demandeur = coalesce(p_demandeur, demandeur)
     where user_id = p_user_id;
  end;

  /*
   * LA BARRIÈRE. Le verrou n'est relâché qu'au commit, c'est-à-dire à
   * l'instant où le marqueur devient visible : aucune écriture ne peut se
   * glisser entre les deux. Voir 20260819020000 pour le raisonnement complet.
   */
  lock table public.restaurants in exclusive mode;

  return v_jeton;
end;
$$;

comment on function public.ouvrir_fenetre_suppression(uuid, uuid, uuid) is
  'Ouvre (ou reprend, sur présentation du jeton) la fenêtre de suppression d''un compte, et attend que toute écriture en cours sur restaurants soit terminée. Rend le jeton de l''opération. Refuse si une AUTRE opération tient déjà la fenêtre.';

/*
 * L'ancienne signature à deux arguments DOIT partir.
 *
 * `create or replace function` avec un paramètre de plus ne remplace rien :
 * il crée une SURCHARGE. Les deux versions coexistent alors, et un appel à
 * deux arguments continue de résoudre vers l'ancienne — celle qui écrase la
 * fenêtre d'autrui, c'est-à-dire exactement le défaut corrigé ici. Pire, un
 * appel ambigu échoue en `42725 function is not unique`.
 *
 * Le harnais l'a attrapé en jouant la migration ; le fichier seul ne le
 * disait pas.
 */
drop function if exists public.ouvrir_fenetre_suppression(uuid, uuid);

-- ─────────────────────────────────── fermer : seulement la sienne

create or replace function public.fermer_fenetre_suppression(
  p_user_id uuid,
  p_jeton   uuid default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_jeton uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  select c.jeton into v_jeton
  from public.comptes_en_suppression c
  where c.user_id = p_user_id
  for update;

  if not found then
    return false;                    -- déjà fermée : une reprise ne doit pas échouer là-dessus
  end if;

  if p_jeton is null or v_jeton is distinct from p_jeton then
    raise exception using
      errcode = 'P0106',
      message = 'Cette fenêtre de suppression appartient à une autre opération : fermeture refusée.',
      hint    = 'fenetre_etrangere';
  end if;

  delete from public.comptes_en_suppression where user_id = p_user_id;
  return true;
end;
$$;

comment on function public.fermer_fenetre_suppression(uuid, uuid) is
  'Referme la fenêtre SI le jeton présenté est celui de l''opération qui l''a ouverte. Une fenêtre étrangère n''est jamais retirée. Fermer une fenêtre absente rend false, sans erreur.';

-- L'ancienne signature à un seul argument disparaît : elle permettait de
-- fermer la fenêtre d'autrui, ce qui est exactement le défaut corrigé ici.
drop function if exists public.fermer_fenetre_suppression(uuid);

-- ────────────────────────────── réparer : explicite, tracée, gardée root

create or replace function public.forcer_fermeture_fenetre(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ligne record;
begin
  if p_user_id is null then
    raise exception using errcode = 'P0104', message = 'Compte cible manquant.';
  end if;

  delete from public.comptes_en_suppression
  where user_id = p_user_id
  returning jeton, ouvert_le, demandeur into v_ligne;

  if not found then
    return jsonb_build_object('retiree', false);
  end if;

  /*
   * On rend ce qu'on a retiré : l'appelant DOIT pouvoir le journaliser. Une
   * réparation qui ne laisse aucune trace de ce qu'elle a défait n'est pas
   * meilleure qu'un DELETE dans une console.
   */
  return jsonb_build_object(
    'retiree',   true,
    'jeton',     v_ligne.jeton,
    'ouvert_le', v_ligne.ouvert_le,
    'demandeur', v_ligne.demandeur
  );
end;
$$;

comment on function public.forcer_fermeture_fenetre(uuid) is
  'Réparation : retire une fenêtre dont le jeton est perdu, et rend la ligne retirée pour que l''appelant la trace. À n''appeler que depuis une action gardée root.';

revoke all on function public.ouvrir_fenetre_suppression(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fermer_fenetre_suppression(uuid, uuid) from public, anon, authenticated;
revoke all on function public.forcer_fermeture_fenetre(uuid) from public, anon, authenticated;
grant execute on function public.ouvrir_fenetre_suppression(uuid, uuid, uuid) to service_role;
grant execute on function public.fermer_fenetre_suppression(uuid, uuid) to service_role;
grant execute on function public.forcer_fermeture_fenetre(uuid) to service_role;

notify pgrst, 'reload schema';
