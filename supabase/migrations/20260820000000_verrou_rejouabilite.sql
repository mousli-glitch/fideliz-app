/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  #68 — ON N'ACTIVE PAS LA REJOUABILITÉ SANS LA LIMITE QUI VA AVEC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LA DÉCISION, ET POURQUOI CE N'EST NI A NI C ───
 *
 * `checkReplayStatusAction` est joignable SANS COMPTE — c'est sa raison
 * d'être, un joueur n'en a pas. Les identifiants de jeu sont publics : ils
 * sont dans la page. Elle répond donc, pour une adresse quelconque, « cette
 * personne a-t-elle joué récemment ici ». Un bit par requête, non borné.
 *
 * Trois options avaient été instruites le 19/08 :
 *
 *   A — table de limitation dédiée : réelle et prouvable, mais une table de
 *       plus en production pour un défaut aujourd'hui INERTE ;
 *   B — compteur en mémoire : Vercel réinstancie, le compteur repart.
 *       Invérifiable, donc indéfendable ;
 *   C — ne rien poser : le défaut s'ouvre en silence le jour où quelqu'un
 *       active la rejouabilité, et personne ne s'en souviendra.
 *
 * **Samy tranche le 20/08/2026 : ni A maintenant, ni C.** On ne pose pas la
 * limite aujourd'hui — elle protégerait contre rien : **0 jeu sur 9** a la
 * rejouabilité activée, et `get_replay_status` court-circuite sur
 * `replay: false` avant toute lecture. On rend en revanche IMPOSSIBLE de
 * l'activer sans elle.
 *
 * Un « penser à le faire plus tard » s'oublie. Un verrou se rappelle tout
 * seul, au seul moment où ça compte — celui où quelqu'un tourne le bouton.
 *
 * ─── CE QUE C'EST, ET CE QUE CE N'EST PAS ───
 *
 * Ce n'est PAS une frontière de sécurité : qui possède les droits DDL peut
 * créer la table et passer outre. C'est un RAPPEL QU'ON NE PEUT PAS RATER —
 * et pour le contourner il faut le faire délibérément, c'est-à-dire au moment
 * précis où l'on lit ce message. C'est toute sa valeur, et il ne prétend pas
 * à davantage.
 *
 * La table attendue n'est pas un jeton vide : ses deux colonnes de travail
 * sont exigées, pour qu'un fichier créé à la va-vite pour débloquer un bouton
 * ne suffise pas.
 *
 * ─── POURQUOI LES DEUX TABLES ───
 *
 * L'écran de réglages écrit `restaurants.replay_enabled`, puis
 * `updateRestaurantSettings` répercute sur TOUS les jeux du restaurant —
 * en DEUX requêtes distinctes, non atomiques. Ne verrouiller que `games`
 * laisserait le drapeau du restaurant passer à `true` pendant que celui des
 * jeux reste à `false` : un état incohérent, inerte mais incompréhensible.
 * On verrouille donc à la première écriture.
 *
 * ─── IL NE BLOQUE QUE LA TRANSITION ───
 *
 * Éteindre reste toujours possible. Modifier un jeu DÉJÀ rejouable reste
 * possible. Seul le passage éteint → allumé est refusé. Mesuré le 20/08 :
 * 0 jeu sur 9 et 0 restaurant sur 4 ont le drapeau — ce verrou ne peut donc
 * casser aucune modification existante.
 *
 * MIGRATION ADDITIVE : une fonction, deux triggers. Aucune donnée touchée.
 */

create or replace function public.refuser_rejouabilite_sans_limite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_avant  boolean;
  v_oid    oid;
  v_prete  boolean := false;
begin
  v_avant := case when tg_op = 'INSERT' then false else coalesce(old.replay_enabled, false) end;

  -- On éteint, ou c'était déjà éteint et ça le reste : rien à dire.
  if not coalesce(new.replay_enabled, false) then
    return new;
  end if;
  -- Déjà allumé : on ne bloque pas les autres modifications de la ligne.
  if v_avant then
    return new;
  end if;

  -- Ici, et ici seulement : quelqu'un ALLUME la rejouabilité.
  /*
   * L'identifiant d'abord, le cast JAMAIS.
   *
   * Première écriture, et défaut trouvé en l'éprouvant le 20/08 :
   * `'public.limites_par_ip'::regclass` LÈVE 42P01 quand la table n'existe
   * pas — au lieu de rendre null. Le verrou bloquait donc bien, mais en
   * annonçant « relation does not exist » : un message de plateforme, sur
   * lequel un restaurateur ne peut rien faire. Or ce verrou n'a qu'un but,
   * DIRE POURQUOI. `to_regclass` rend null sans lever ; on travaille ensuite
   * sur l'oid, qui ne se cast pas.
   */
  v_oid := to_regclass('public.limites_par_ip');
  if v_oid is not null then
    select count(*) = 2 into v_prete
      from pg_attribute a
     where a.attrelid = v_oid
       and a.attname in ('ip_hash', 'vu_le')
       and a.attnum > 0 and not a.attisdropped;
  end if;

  if not v_prete then
    raise exception using
      errcode = 'P0330',
      message = 'Rejouabilite non activable : la limite par IP n''existe pas encore. '
             || 'Tant qu''elle manque, un visiteur peut demander sans compte, pour une adresse '
             || 'quelconque, si cette personne a joue recemment ici — sans aucune borne. '
             || 'Poser d''abord public.limites_par_ip (colonnes ip_hash, vu_le) et la brancher '
             || 'dans checkReplayStatusAction.',
      hint    = 'limite_ip_absente';
  end if;

  return new;
end $fn$;

comment on function public.refuser_rejouabilite_sans_limite() is
  'Verrou #68 : refuse le passage de replay_enabled a true tant que public.limites_par_ip (ip_hash, vu_le) n''existe pas. Rappel impossible a rater, pas frontiere de securite — qui a les droits DDL peut passer outre, mais devra le faire deliberement.';

revoke all on function public.refuser_rejouabilite_sans_limite() from public, anon, authenticated, service_role;

do $poser$
declare t text;
begin
  /*
   * Le nom trie APRÈS `gel_de_bascule` : pendant une bascule, c'est le gel qui
   * doit parler le premier, et de toute façon rien ne s'écrit alors.
   */
  foreach t in array array['games', 'restaurants'] loop
    if to_regclass('public.'||t) is null then
      raise exception using errcode='P0331',
        message = format('VERROU #68 : table public.%s absente.', t);
    end if;
    if not exists (select 1 from pg_attribute a
                    where a.attrelid = ('public.'||t)::regclass
                      and a.attname = 'replay_enabled' and a.attnum > 0 and not a.attisdropped) then
      raise notice 'VERROU #68 : public.% ne porte pas replay_enabled — pas de trigger pose.', t;
      continue;
    end if;
    execute format('drop trigger if exists verrou_rejouabilite on public.%I', t);
    execute format(
      'create trigger verrou_rejouabilite before insert or update on public.%I
         for each row execute function public.refuser_rejouabilite_sans_limite()', t);
  end loop;
end $poser$;

do $verif$
declare v_n int; v_actives int;
begin
  select count(*) into v_n from pg_trigger t
   join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and t.tgname='verrou_rejouabilite' and not t.tgisinternal
     and t.tgenabled = 'O'
     and t.tgfoid = 'public.refuser_rejouabilite_sans_limite()'::regprocedure;
  if v_n = 0 then
    raise exception using errcode='P0332', message='VERROU #68 ANNULE : aucun trigger pose.';
  end if;

  /*
   * Contre-epreuve de vacuite : si la table de limitation existait deja, ce
   * verrou serait inerte et son vert ne prouverait rien.
   */
  if to_regclass('public.limites_par_ip') is not null then
    raise exception using errcode='P0333',
      message = 'VERROU #68 : public.limites_par_ip existe deja — le verrou serait inerte. '
             || 'Si la limite est posee, ce verrou n''a plus lieu d''etre.';
  end if;

  /* Il ne doit casser aucune ligne existante. */
  select coalesce((select count(*) from public.games where replay_enabled), 0) into v_actives;
  if v_actives > 0 then
    raise exception using errcode='P0334',
      message = format('VERROU #68 : %s jeu(x) ont deja la rejouabilite active. Le verrou ne les '
                    || 'bloque pas, mais leur existence contredit la mesure qui a fonde la decision.', v_actives);
  end if;

  raise notice 'VERROU #68 pose sur % table(s), aucun jeu rejouable existant.', v_n;
end $verif$;
