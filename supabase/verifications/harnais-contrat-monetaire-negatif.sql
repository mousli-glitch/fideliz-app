/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS NÉGATIF — prouver que le harnais monétaire n'est pas vide
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `harnais-contrat-monetaire.sql` et de
 *  `migrateur-minimum-achat.sql`.
 *
 *  Un harnais dont toutes les assertions passeraient même sur du code fautif
 *  est pire qu'absent : il rassure. Ce fichier injecte TROIS fautes bornées et
 *  exige, pour chacune, que la vérification correspondante vire au rouge.
 *
 *      1. LE PARSEUR PERMISSIF — `centimes_depuis_saisie` remplacée par une
 *         variante qui rend 0 sur une saisie invalide. C'est EXACTEMENT le
 *         défaut d'origine (`else 0`), reproduit à l'identique. Le bloc
 *         « grammaire invalide » et le cas « illisible -> NULL » doivent
 *         échouer.
 *
 *      2. LE FILTRE « CONSOMMÉ » NEUTRALISÉ — le migrateur écrit alors sur des
 *         tickets déjà consommés, ce que la règle de Samy interdit. Son
 *         verdict doit lever.
 *
 *      3. LA GARDE D'IDEMPOTENCE RETIRÉE — le migrateur réécrit à chaque
 *         passage. L'assertion de rejeu doit lever.
 *
 *  ─── CE QUI DISTINGUE UNE DÉTECTION D'UNE PANNE ───
 *
 *  Un runner négatif qui se contente d'exiger « une erreur » est faux : une
 *  faute de frappe ou une table absente produit aussi une erreur, et il
 *  passerait au vert sans rien avoir prouvé. Chaque épreuve attend donc un
 *  SQLSTATE privé précis (`P9301` pour une détection attendue), et toute
 *  autre erreur se propage telle quelle.
 *
 *  ─── SÉCURITÉ ───
 *
 *  Une transaction annulée à la fin. Le remplacement de fonction des épreuves
 *  se joue dans des sous-transactions elles-mêmes annulées : la vraie
 *  `centimes_depuis_saisie` est intacte en sortie, ce que l'épreuve 4 vérifie
 *  explicitement. Garde de cible synthétique avant toute mutation.
 *
 *  ATTENDU : « HARNAIS NÉGATIF MONNAIE : les 4 épreuves sont conformes. »
 *
 *  USAGE : script manuel. Ne jamais appliquer via `supabase db push`.
 */

begin;

/*
 * ─── GARDE DE CIBLE : IDENTIFICATION, PAS PLAFOND ───
 *
 * La version précédente acceptait « moins de 500 restaurants ». Ça ne prouve
 * rien : une base RÉELLE mais jeune passe ce test sans difficulté, et ce
 * harnais insère des fixtures et injecte des fautes. Un plafond n'identifie
 * pas une cible, il exprime un espoir.
 *
 * On exige donc une base VIERGE — aucun utilisateur Auth, aucun profil, aucun
 * restaurant — et l'absence préalable des identifiants synthétiques, pour
 * qu'une exécution concurrente ou un résidu ne passe pas inaperçu.
 */
do $$
declare v_u int; v_p int; v_r int; v_collision int;
begin
  select count(*) into v_u from auth.users;
  select count(*) into v_p from public.profiles;
  select count(*) into v_r from public.restaurants;
  if v_u <> 0 or v_p <> 0 or v_r <> 0 then
    raise exception 'HARNAIS REFUSÉ : cible non vierge (% utilisateurs Auth, % profils, % restaurants). Ce fichier insère des fixtures : il ne doit jamais s''exécuter sur une base porteuse de données.', v_u, v_p, v_r;
  end if;
  select count(*) into v_collision from public.restaurants
   where slug in ('resto-mon','dw','neg-resto','neg2-resto','attaquant','victime');
  if v_collision <> 0 then
    raise exception 'HARNAIS REFUSÉ : des objets synthétiques existent déjà — résidu ou exécution concurrente.';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.centimes_depuis_saisie(text)') is null then
    raise exception 'HARNAIS NÉGATIF INAPPLICABLE : le contrat n''est pas en place. Ce n''est pas une épreuve qui échoue, c''est le point de départ qui manque.';
  end if;
end $$;

create temp table _neg (ordre int, epreuve text, conforme boolean, detail text) on commit drop;

-- ═══ ÉPREUVE 1 — le parseur permissif doit faire échouer la grammaire

do $$
declare
  v_invalides text[] := array['abc','-3','5abc','1e3','5.999'];
  s text; v int; v_detectes int := 0; v_zeros int := 0;
begin
  begin
    -- LA FAUTE : le défaut d'origine, reproduit tel quel.
    execute $f$
      create or replace function public.centimes_depuis_saisie(p_saisie text)
      returns integer language plpgsql immutable as $c$
      begin
        if btrim(coalesce(p_saisie,'')) = '' then return null; end if;
        if btrim(p_saisie) ~ '^[0-9]{1,6}$' then return btrim(p_saisie)::int * 100; end if;
        return 0;   -- « je ne sais pas lire » devient « aucun minimum »
      end $c$;
    $f$;

    foreach s in array v_invalides loop
      begin
        v := public.centimes_depuis_saisie(s);
        if v = 0 then v_zeros := v_zeros + 1; end if;
      exception when others then
        v_detectes := v_detectes + 1;
      end;
    end loop;

    /*
     * Conformité : le harnais positif DOIT voir la différence. Sous cette
     * faute, aucune invalide ne lève et toutes rendent zéro — donc le bloc
     * « grammaire invalide » serait rouge sur ses 5 cas, et le cas
     * « illisible -> NULL » aussi.
     */
    if v_detectes = 0 and v_zeros = array_length(v_invalides, 1)
       and public.minimum_effectif_centimes(null, null, 'abc') = 0 then
      raise exception using errcode = 'P9301',
        message = format('parseur permissif : %s/%s saisies invalides rendues a ZERO, aucune levee', v_zeros, array_length(v_invalides,1));
    end if;

    raise exception using errcode = 'P9302', message = 'la faute n''a pas produit l''effet attendu';
  exception
    when sqlstate 'P9301' then
      insert into _neg values (1, 'parseur permissif -> la grammaire vire au rouge', true, sqlerrm);
    when sqlstate 'P9302' then
      insert into _neg values (1, 'parseur permissif -> la grammaire vire au rouge', false, sqlerrm);
    when others then raise;
  end;
end $$;

-- ═══ ÉPREUVE 2 — filtre « consommé » neutralisé : le verdict doit lever

do $$
declare
  vR uuid := '00000000-0000-4000-8000-00000000f0a1';
  vG uuid := '00000000-0000-4000-8000-00000000f0a2';
  tC uuid := '00000000-0000-4000-8000-00000000f0b1';
  v_touches int;
begin
  begin
    insert into public.restaurants (id,name,slug) values (vR,'neg-resto','neg-resto');
    insert into public.games (id,restaurant_id,name,active_action,status,min_spend)
      values (vG,vR,'neg-jeu','wheel','active','5,90');
    insert into public.winners (id,game_id,first_name,qr_code,status,expires_at,redeemed_at)
      values (tC,vG,'consomme',tC::text,'redeemed', now() + interval '30 days', now());

    create temp table _touches_neg (id uuid, consomme boolean) on commit drop;

    -- LA FAUTE : les filtres qui protègent un ticket consommé sont retirés.
    with maj as (
      update public.winners w
         set min_spend_cents_snapshot = public.minimum_effectif_centimes(null, null, g.min_spend)
        from public.games g
       where g.id = w.game_id
         and w.min_spend_cents_snapshot is null
      returning w.id, (w.status = 'redeemed' or w.redeemed_at is not null)
    )
    insert into _touches_neg select * from maj;

    -- L'assertion du migrateur, appliquée telle quelle aux lignes écrites.
    select count(*) into v_touches from _touches_neg where consomme;
    if v_touches > 0 then
      raise exception using errcode = 'P9301',
        message = format('%s ticket(s) consomme(s) ecrit(s) — le verdict du migrateur leve bien', v_touches);
    end if;
    raise exception using errcode = 'P9302', message = 'aucun ticket consomme ecrit : la faute n''a rien produit';
  exception
    when sqlstate 'P9301' then
      insert into _neg values (2, 'filtre « consomme » neutralise -> le verdict leve', true, sqlerrm);
    when sqlstate 'P9302' then
      insert into _neg values (2, 'filtre « consomme » neutralise -> le verdict leve', false, sqlerrm);
    when others then raise;
  end;
end $$;

-- ═══ ÉPREUVE 3 — garde d'idempotence retirée : le second passage écrit

do $$
declare
  vR uuid := '00000000-0000-4000-8000-00000000f1a1';
  vG uuid := '00000000-0000-4000-8000-00000000f1a2';
  tV uuid := '00000000-0000-4000-8000-00000000f1b1';
  v_second int;
begin
  begin
    insert into public.restaurants (id,name,slug) values (vR,'neg2-resto','neg2-resto');
    insert into public.games (id,restaurant_id,name,active_action,status,min_spend,min_spend_cents)
      values (vG,vR,'neg2-jeu','wheel','active','5,90',590);
    insert into public.winners (id,game_id,first_name,qr_code,status,expires_at)
      values (tV,vG,'valide',tV::text,'available', now() + interval '30 days');

    -- Premier passage, conforme.
    update public.winners w set min_spend_cents_snapshot = 590
     where w.id = tV and w.min_spend_cents_snapshot is null;

    create temp table _second_neg (id uuid) on commit drop;

    -- LA FAUTE : la garde `snapshot is null` est retirée du second passage.
    with maj as (
      update public.winners w
         set min_spend_cents_snapshot = public.minimum_effectif_centimes(null, null, g.min_spend)
        from public.games g
       where g.id = w.game_id and w.id = tV
      returning w.id
    )
    insert into _second_neg select id from maj;

    select count(*) into v_second from _second_neg;
    if v_second > 0 then
      raise exception using errcode = 'P9301',
        message = format('%s ligne(s) reecrite(s) au second passage — l''assertion d''idempotence leve bien', v_second);
    end if;
    raise exception using errcode = 'P9302', message = 'rien reecrit : la faute n''a rien produit';
  exception
    when sqlstate 'P9301' then
      insert into _neg values (3, 'garde d''idempotence retiree -> l''assertion leve', true, sqlerrm);
    when sqlstate 'P9302' then
      insert into _neg values (3, 'garde d''idempotence retiree -> l''assertion leve', false, sqlerrm);
    when others then raise;
  end;
end $$;

-- ═══ ÉPREUVE 4 — le fichier n'a rien laissé derrière lui

do $$
declare v_intact boolean;
begin
  /*
   * Les sous-transactions ont été annulées : la VRAIE fonction doit être
   * revenue. Sans ce contrôle, un runner négatif pourrait laisser un parseur
   * permissif en place et rendre tous les harnais suivants complaisants.
   */
  begin
    perform public.centimes_depuis_saisie('abc');
    v_intact := false;          -- elle a accepté : c'est la variante fautive
  exception
    when sqlstate 'P0120' then v_intact := true;
    when others then v_intact := false;
  end;

  insert into _neg values (4, 'la vraie fonction est restauree apres les epreuves',
    v_intact, case when v_intact then 'centimes_depuis_saisie(''abc'') leve bien P0120'
                   else 'ANOMALIE : la variante permissive a survecu' end);
end $$;

-- ═══ VERDICT — fail-closed

do $$
declare v_n int; v_echecs int; v_liste text;
begin
  select count(*) into v_n from _neg;
  if v_n <> 4 then
    raise exception 'HARNAIS NÉGATIF MONNAIE : % epreuve(s) enregistree(s), 4 attendues. Une epreuve non jouee n''est pas une epreuve reussie.', v_n;
  end if;
  select count(*), string_agg(ordre || '. ' || epreuve || ' — ' || detail, E'\n' order by ordre)
    into v_echecs, v_liste from _neg where conforme is distinct from true;
  if v_echecs > 0 then
    raise exception E'HARNAIS NÉGATIF MONNAIE : % epreuve(s) NON CONFORME(S).\n%\nLe harnais positif ne prouve donc pas ce qu''il pretend prouver.', v_echecs, v_liste;
  end if;
  raise notice 'HARNAIS NÉGATIF MONNAIE : les 4 epreuves sont conformes.';
end $$;

select ordre, epreuve, conforme, detail from _neg order by ordre;

rollback;
