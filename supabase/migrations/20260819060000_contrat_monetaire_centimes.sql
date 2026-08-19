/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE MINIMUM D'ACHAT : UN CONTRAT, ET NON TROIS INTERPRÉTATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── LE DÉFAUT, MESURÉ SUR LA PRODUCTION LE 19/08/2026 ───
 *
 * `games.min_spend` est de type `text`. Trois lecteurs, trois lectures :
 *
 *   `play_game` / `register_win`   `min_spend ~ '^[0-9]+$'` sinon 0
 *   page publique de vérification  `parseFloat`
 *   `getWinnerInfoAction`          entiers seulement
 *
 * Et l'écriture produit `"5.9"` pour une saisie « 5,90 ». Cette valeur ne
 * satisfait pas `^[0-9]+$` : le minimum APPLIQUÉ retombe donc à zéro, pendant
 * que le client voit « 5.9 » sur son ticket. La condition disparaît du côté
 * qui l'applique et survit du côté qui l'affiche.
 *
 * Relevé en lecture seule sur la base de production, par agrégats — aucun
 * identifiant, aucun montant individuel :
 *
 *     jeux total ..................................  9  (4 actifs)
 *     minimum a zero ..............................  5
 *     minimum ENTIER (seule categorie appliquee) ..  3
 *     minimum DECIMAL (affiche, applique comme 0) .  1  — ACTIF
 *     autre forme invalide ........................  0
 *     tickets rattaches a un minimum decimal ...... 127
 *
 * Un jeu actif, 127 tickets émis sous une condition jamais appliquée.
 *
 * ─── LA REPRÉSENTATION CANONIQUE ───
 *
 * Des CENTIMES ENTIERS. Pas de flottant, ni en SQL ni en JavaScript : un
 * montant n'est pas une quantité continue, et `0.1 + 0.2` ne vaut pas `0.3`.
 * `integer` suffit largement — la borne à 999999 € tient dans `int4` avec
 * quatre ordres de grandeur de marge.
 *
 * ─── ADDITIF, ET COMPATIBLE DANS LES DEUX SENS ───
 *
 * Rien n'est converti, rien n'est réécrit, `min_spend` reste en place. Le
 * nouveau code écrit les DEUX (texte historique + centimes) et lit dans
 * l'ordre : snapshot du ticket, puis champ canonique du jeu, puis lecture
 * stricte du texte historique. L'ancien code continue donc de fonctionner
 * pendant toute la transition, et les valeurs historiques `5`, `5.9`, `5.90`
 * deviennent correctes dès le nouveau code, sans exiger la moindre mutation.
 *
 * ─── UNE VALEUR ILLISIBLE NE DEVIENT JAMAIS ZÉRO ───
 *
 * C'est le cœur du défaut : `else 0` transformait « je ne sais pas lire » en
 * « aucun minimum ». `centimes_depuis_saisie` REFUSE (`P0120`) au lieu de
 * deviner, et `minimum_effectif_centimes` rend NULL — « indéterminé » — qui
 * ne se confond pas avec 0 — « aucun minimum ». Les deux se lisent
 * différemment, et c'est voulu.
 *
 * ─── LE SNAPSHOT ───
 *
 * `winners.prize_label_snapshot` fige déjà le libellé du lot au moment du
 * gain. Le minimum, lui, était relu sur le jeu COURANT : modifier le jeu
 * changeait donc rétroactivement la condition d'un ticket déjà émis.
 * `min_spend_cents_snapshot` ferme ça, sur le même modèle.
 *
 * Colonne NULLABLE et AUCUN backfill ici : les tickets existants gardent
 * `NULL` et retombent sur la lecture du jeu, exactement comme avant. Le
 * migrateur de reprise est un fichier séparé, en dry-run, et il n'est joué
 * sur aucune donnée réelle.
 *
 * ─── ORDRE DE DÉPLOIEMENT ───
 *
 * Migration AVANT code. Les colonnes étant nullables et les fonctions
 * nouvelles, l'ancien code continue de tourner sans les voir : cette
 * migration est sûre à appliquer seule.
 *
 * ⚠️ ARRÊT DEMANDÉ PAR SAMY : préparer, prouver, puis ATTENDRE sa validation
 * finale avant toute application réelle. Ce fichier n'est pas à jouer en
 * production sans son aval explicite.
 *
 * MIGRATION ADDITIVE : deux colonnes nullables, trois fonctions. Aucune
 * colonne existante n'est modifiée, aucune donnée n'est réécrite.
 */

-- ────────────────────────────── lire une saisie, ou refuser de la lire

create or replace function public.centimes_depuis_saisie(p_saisie text)
returns integer
language plpgsql
immutable
as $$
declare
  v       text;
  v_norm  text;
  v_euros text;
  v_cents text;
begin
  v := btrim(coalesce(p_saisie, ''));

  /*
   * Rien de saisi = « aucun minimum ». C'est la règle existante, et elle est
   * conservée : NULL ici, que l'appelant lit comme « pas de condition ».
   * Distinct d'une valeur ILLISIBLE, qui lève.
   */
  if v = '' then
    return null;
  end if;

  -- Euros entiers.
  if v ~ '^[0-9]{1,6}$' then
    return v::int * 100;
  end if;

  /*
   * Euros et centimes, virgule ou point, une ou deux décimales.
   * `rpad` porte la règle qui manquait : « 5,9 » vaut 5,90 € — donc 590
   * centimes, pas 509 ni 59. Le calcul est entier de bout en bout.
   */
  if v ~ '^[0-9]{1,6}[.,][0-9]{1,2}$' then
    v_norm  := replace(v, ',', '.');
    v_euros := split_part(v_norm, '.', 1);
    v_cents := rpad(split_part(v_norm, '.', 2), 2, '0');
    return v_euros::int * 100 + v_cents::int;
  end if;

  /*
   * Tout le reste refuse : lettres, négatif, exponentiel, suffixe (`5abc`),
   * plus de deux décimales, dépassement. Jamais de repli silencieux sur zéro
   * — c'est précisément le défaut qu'on ferme.
   */
  raise exception using
    errcode = 'P0120',
    message = format('Montant invalide : « %s ». Attendu un nombre d''euros, avec au plus deux décimales (exemples : 0, 5, 5,90).', p_saisie),
    hint    = 'montant_invalide';
end;
$$;

comment on function public.centimes_depuis_saisie(text) is
  'Convertit une saisie monétaire en centimes entiers, sans flottant. Vide = NULL (aucun minimum). Toute valeur illisible LÈVE (P0120) au lieu de devenir zéro.';

-- ───────────────────────────────────── les deux colonnes canoniques

alter table public.games
  add column if not exists min_spend_cents integer;

comment on column public.games.min_spend_cents is
  'Minimum d''achat en centimes entiers — représentation canonique. NULL = pas encore renseigné ; lire alors `min_spend` (texte historique) via centimes_depuis_saisie.';

alter table public.winners
  add column if not exists min_spend_cents_snapshot integer;

comment on column public.winners.min_spend_cents_snapshot is
  'Minimum d''achat FIGÉ à l''émission du ticket, en centimes. Sur le modèle de prize_label_snapshot. NULL pour les tickets antérieurs : la lecture retombe alors sur le jeu, comme avant.';

/*
 * Bornes de cohérence, posées comme NOT VALID : elles s'appliquent aux
 * écritures NOUVELLES sans exiger de valider les lignes existantes, donc sans
 * balayage ni verrou long sur une table en service. La validation viendra
 * après le backfill, dans un lot séparé.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'games_min_spend_cents_borne') then
    alter table public.games
      add constraint games_min_spend_cents_borne
      check (min_spend_cents is null or (min_spend_cents >= 0 and min_spend_cents <= 99999900))
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winners_min_spend_cents_borne') then
    alter table public.winners
      add constraint winners_min_spend_cents_borne
      check (min_spend_cents_snapshot is null or (min_spend_cents_snapshot >= 0 and min_spend_cents_snapshot <= 99999900))
      not valid;
  end if;
end $$;

-- ──────────────────── la lecture, dans un ordre unique pour tout le monde

create or replace function public.minimum_effectif_centimes(
  p_snapshot         integer,
  p_jeu_centimes     integer,
  p_texte_historique text
)
returns integer
language plpgsql
immutable
as $$
begin
  /*
   * L'ordre est le contrat, et il vaut pour TOUS les lecteurs — scanner,
   * page publique, fonctions de jeu. Trois lecteurs qui appliquaient trois
   * règles, c'est ce qui a produit le défaut.
   *
   *   1. le snapshot du ticket   — la condition telle qu'elle était au gain
   *   2. le champ canonique      — pour un ticket antérieur au snapshot
   *   3. le texte historique     — lu STRICTEMENT, jamais deviné
   */
  if p_snapshot is not null then
    return p_snapshot;
  end if;
  if p_jeu_centimes is not null then
    return p_jeu_centimes;
  end if;

  /*
   * Une valeur historique illisible rend NULL — « indéterminé » — et NON
   * zéro. Les deux ne se lisent pas pareil : zéro veut dire « aucun
   * minimum », NULL veut dire « on ne sait pas, ne décide rien ». Confondre
   * les deux est exactement le bug d'origine.
   *
   * On rend NULL plutôt que de lever : une lecture qui échoue casserait la
   * page d'un client pour une donnée qui, mesurée, n'existe pas en production
   * (0 valeur invalide sur 9 jeux). L'anomalie reste visible sans être
   * bloquante.
   */
  begin
    return public.centimes_depuis_saisie(p_texte_historique);
  exception when sqlstate 'P0120' then
    return null;
  end;
end;
$$;

comment on function public.minimum_effectif_centimes(integer, integer, text) is
  'Le minimum applicable d''un ticket, en centimes : snapshot, puis champ canonique du jeu, puis lecture stricte du texte historique. Rend NULL pour « indéterminé », qui ne se confond pas avec 0 « aucun minimum ».';

-- Confort de lecture : la même règle, à partir d'un ticket.
create or replace function public.minimum_effectif_du_ticket(p_winner_id uuid)
returns integer
language sql
stable
as $$
  select public.minimum_effectif_centimes(w.min_spend_cents_snapshot, g.min_spend_cents, g.min_spend)
  from public.winners w
  join public.games g on g.id = w.game_id
  where w.id = p_winner_id;
$$;

comment on function public.minimum_effectif_du_ticket(uuid) is
  'Le minimum applicable d''un ticket donné, en centimes. Applique l''ordre de lecture canonique.';

revoke all on function public.centimes_depuis_saisie(text) from public, anon, authenticated;
revoke all on function public.minimum_effectif_centimes(integer, integer, text) from public, anon, authenticated;
revoke all on function public.minimum_effectif_du_ticket(uuid) from public, anon, authenticated;
grant execute on function public.centimes_depuis_saisie(text) to service_role;
grant execute on function public.minimum_effectif_centimes(integer, integer, text) to service_role;
grant execute on function public.minimum_effectif_du_ticket(uuid) to service_role;

notify pgrst, 'reload schema';
