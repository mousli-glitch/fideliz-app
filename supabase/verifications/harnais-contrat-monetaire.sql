/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARNAIS — le contrat monétaire, et la règle des tickets décidée par Samy
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Compagnon de `20260819060000_contrat_monetaire_centimes.sql`.
 *
 *  ─── POURQUOI CE FICHIER EXISTE ───
 *
 *  Signalé le 19/08/2026 : la grammaire monétaire, les formes invalides et la
 *  fixture des tickets avaient été JOUÉES et rapportées, mais jamais versées.
 *  C'est exactement le reproche que j'avais fait au harnais de cascade
 *  quelques tours plus tôt — une vérification qu'on ne peut pas rejouer n'est
 *  pas une vérification, c'est un souvenir. Le reproche vaut pour moi.
 *
 *  ─── LE DÉFAUT REPRODUIT ───
 *
 *  `games.min_spend` est du texte. L'écriture produit `"5.9"` pour « 5,90 »,
 *  mais `play_game` et `register_win` n'acceptent que `^[0-9]+$` et retombent
 *  à ZÉRO, pendant que la page publique affiche « 5.9 » au client. Mesuré en
 *  production : 1 jeu actif dans ce cas, 127 tickets rattachés.
 *
 *  Le cœur du correctif tient en une phrase : **une valeur illisible ne
 *  devient jamais zéro**. `centimes_depuis_saisie` LÈVE, et
 *  `minimum_effectif_centimes` rend NULL — « indéterminé » — qui ne se
 *  confond pas avec 0 — « aucun minimum ». Le cas 3 du bloc « lecture »
 *  éprouve précisément cette distinction.
 *
 *  ─── LA RÈGLE DES TICKETS, DÉCIDÉE PAR SAMY ───
 *
 *      consommé ................ INCHANGÉ
 *      encore valide ........... minimum AFFICHÉ au client
 *      expiré ou supprimé ...... INCHANGÉ
 *
 *  ─── SÉCURITÉ ───
 *
 *  Une transaction, annulée à la fin. Garde de cible synthétique avant toute
 *  mutation. Aucune donnée réelle, aucun identifiant : uniquement des UUID
 *  synthétiques et des montants inventés.
 *
 *  ATTENDU : le verdict final ne lève pas, et affiche le décompte des cas.
 *  `harnais-contrat-monetaire-negatif.sql`, à côté, prouve que ce fichier
 *  vire au rouge quand on lui injecte une faute bornée.
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

-- Garde anti-dérive : sans le contrat, ce harnais n'éprouverait rien.
do $$
declare v_manquant text := '';
begin
  if to_regprocedure('public.centimes_depuis_saisie(text)') is null then
    v_manquant := v_manquant || ' centimes_depuis_saisie';
  end if;
  if to_regprocedure('public.minimum_effectif_centimes(integer,integer,text)') is null then
    v_manquant := v_manquant || ' minimum_effectif_centimes';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='games' and column_name='min_spend_cents') then
    v_manquant := v_manquant || ' games.min_spend_cents';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='winners' and column_name='min_spend_cents_snapshot') then
    v_manquant := v_manquant || ' winners.min_spend_cents_snapshot';
  end if;
  if v_manquant <> '' then
    raise exception 'HARNAIS INAPPLICABLE — manquant :%. La migration 20260819060000 n''est pas appliquée.', v_manquant;
  end if;
end $$;

create temp table _m (bloc text, cas text, attendu text, obtenu text, conforme boolean) on commit drop;

-- ═══════════════════ BLOC 1 — la grammaire : formes VALIDES

do $$
declare
  cas_valides text[][] := array[
    ['0','0'], ['','NULL'], ['   ','NULL'],
    ['5','500'], ['5.9','590'], ['5,90','590'], ['5.90','590'],
    ['12.00','1200'], ['0.05','5'], ['999999','99999900']
  ];
  i int; v_saisie text; v_attendu text; v_obtenu text;
begin
  for i in 1 .. array_length(cas_valides, 1) loop
    v_saisie  := cas_valides[i][1];
    v_attendu := cas_valides[i][2];
    begin
      v_obtenu := coalesce(public.centimes_depuis_saisie(v_saisie)::text, 'NULL');
    exception when others then
      v_obtenu := 'A LEVE ' || sqlstate;
    end;
    insert into _m values ('grammaire valide', format('« %s »', v_saisie), v_attendu, v_obtenu, v_obtenu = v_attendu);
  end loop;

  -- `null` littéral, hors du tableau texte.
  insert into _m values ('grammaire valide', 'NULL SQL', 'NULL',
    coalesce(public.centimes_depuis_saisie(null)::text, 'NULL'),
    public.centimes_depuis_saisie(null) is null);
end $$;

-- ═══════════════════ BLOC 2 — la grammaire : formes INVALIDES

do $$
declare
  invalides text[] := array['5.999','-3','abc','5abc','1e3','1000000','5..9','.5','5.','0x10','NaN','Infinity','５','+5',' 5 e','5%'];
  s text; v int; v_code text;
begin
  foreach s in array invalides loop
    begin
      v := public.centimes_depuis_saisie(s);
      /*
       * Accepté : c'est le défaut. Ce qu'il a rendu importe autant — un zéro
       * ici, et une saisie fautive devient « aucun minimum ».
       */
      insert into _m values ('grammaire invalide', format('« %s »', s), 'lève P0120',
        format('ACCEPTE -> %s', coalesce(v::text, 'NULL')), false);
    exception when others then
      v_code := sqlstate;
      insert into _m values ('grammaire invalide', format('« %s »', s), 'lève P0120',
        'lève ' || v_code, v_code = 'P0120');
    end;
  end loop;
end $$;

-- ═══════════════════ BLOC 3 — l'ordre de lecture, identique pour tous

do $$
begin
  insert into _m values ('lecture', 'le snapshot prime sur tout', '590',
    coalesce(public.minimum_effectif_centimes(590, 1200, '99')::text,'NULL'),
    public.minimum_effectif_centimes(590, 1200, '99') = 590);

  insert into _m values ('lecture', 'sans snapshot : le champ canonique', '1200',
    coalesce(public.minimum_effectif_centimes(null, 1200, '99')::text,'NULL'),
    public.minimum_effectif_centimes(null, 1200, '99') = 1200);

  insert into _m values ('lecture', 'sans canonique : le texte historique, lu strictement', '590',
    coalesce(public.minimum_effectif_centimes(null, null, '5,90')::text,'NULL'),
    public.minimum_effectif_centimes(null, null, '5,90') = 590);

  /*
   * LE CAS QUI PORTE TOUT LE CORRECTIF. Un `else 0` transformait « je ne sais
   * pas lire » en « aucun minimum ». Les deux doivent rester distincts.
   */
  insert into _m values ('lecture', 'ILLISIBLE -> NULL, jamais zéro', 'NULL',
    coalesce(public.minimum_effectif_centimes(null, null, 'abc')::text,'NULL'),
    public.minimum_effectif_centimes(null, null, 'abc') is null);

  insert into _m values ('lecture', 'vide -> NULL (aucun minimum saisi)', 'NULL',
    coalesce(public.minimum_effectif_centimes(null, null, '')::text,'NULL'),
    public.minimum_effectif_centimes(null, null, '') is null);

  -- Un snapshot à zéro est une VALEUR, pas une absence : il doit primer.
  insert into _m values ('lecture', 'snapshot à 0 reste 0, il ne retombe pas sur le jeu', '0',
    coalesce(public.minimum_effectif_centimes(0, 1200, '99')::text,'NULL'),
    public.minimum_effectif_centimes(0, 1200, '99') = 0);
end $$;

-- ═══════════════════ BLOC 4 — la règle des tickets, sur fixture

do $$
declare
  vR uuid := '00000000-0000-4000-8000-00000000e0a1';
  vG uuid := '00000000-0000-4000-8000-00000000e0a2';
  t_valide   uuid := '00000000-0000-4000-8000-00000000e0b1';
  t_consomme uuid := '00000000-0000-4000-8000-00000000e0b2';
  t_expire   uuid := '00000000-0000-4000-8000-00000000e0b3';
  t_supprime uuid := '00000000-0000-4000-8000-00000000e0b4';
  t_deja     uuid := '00000000-0000-4000-8000-00000000e0b5';
begin
  -- Un jeu qui reproduit EXACTEMENT le défaut de production.
  insert into public.restaurants (id,name,slug) values (vR,'resto-mon','resto-mon');
  insert into public.games (id,restaurant_id,name,active_action,status,min_spend)
    values (vG,vR,'jeu-mon','wheel','active','5,90');

  insert into public.winners (id,game_id,first_name,qr_code,status,expires_at,redeemed_at,deleted_at,min_spend_cents_snapshot) values
    (t_valide,   vG,'valide',   t_valide::text,   'available', now() + interval '30 days', null,  null, null),
    (t_consomme, vG,'consomme', t_consomme::text, 'redeemed',  now() + interval '30 days', now(), null, null),
    (t_expire,   vG,'expire',   t_expire::text,   'available', now() - interval '1 day',   null,  null, null),
    (t_supprime, vG,'supprime', t_supprime::text, 'available', now() + interval '30 days', null,  now(), null),
    (t_deja,     vG,'deja',     t_deja::text,     'available', now() + interval '30 days', null,  null, 1234);

  -- La séquence du migrateur, à l'identique.
  update public.games g
     set min_spend_cents = public.minimum_effectif_centimes(null, null, g.min_spend)
   where g.min_spend_cents is null
     and public.minimum_effectif_centimes(null, null, g.min_spend) is not null;

  update public.winners w
     set min_spend_cents_snapshot = public.minimum_effectif_centimes(null, null, g.min_spend)
    from public.games g
   where g.id = w.game_id
     and w.min_spend_cents_snapshot is null
     and w.status = 'available'
     and w.redeemed_at is null
     and w.consumed_at is null
     and w.deleted_at is null
     and (w.expires_at is null or w.expires_at > now())
     and public.minimum_effectif_centimes(null, null, g.min_spend) is not null;

  insert into _m values ('règle tickets', 'ENCORE VALIDE -> minimum affiché (5,90 = 590 c)', '590',
    coalesce((select min_spend_cents_snapshot::text from public.winners where id=t_valide),'NULL'),
    (select min_spend_cents_snapshot from public.winners where id=t_valide) = 590);

  insert into _m values ('règle tickets', 'CONSOMMÉ -> inchangé', 'NULL',
    coalesce((select min_spend_cents_snapshot::text from public.winners where id=t_consomme),'NULL'),
    (select min_spend_cents_snapshot from public.winners where id=t_consomme) is null);

  insert into _m values ('règle tickets', 'EXPIRÉ -> inchangé', 'NULL',
    coalesce((select min_spend_cents_snapshot::text from public.winners where id=t_expire),'NULL'),
    (select min_spend_cents_snapshot from public.winners where id=t_expire) is null);

  insert into _m values ('règle tickets', 'SUPPRIMÉ -> inchangé', 'NULL',
    coalesce((select min_spend_cents_snapshot::text from public.winners where id=t_supprime),'NULL'),
    (select min_spend_cents_snapshot from public.winners where id=t_supprime) is null);

  insert into _m values ('règle tickets', 'snapshot déjà figé -> jamais écrasé', '1234',
    coalesce((select min_spend_cents_snapshot::text from public.winners where id=t_deja),'NULL'),
    (select min_spend_cents_snapshot from public.winners where id=t_deja) = 1234);

  insert into _m values ('règle tickets', 'le jeu porte désormais 590 centimes', '590',
    coalesce((select min_spend_cents::text from public.games where id=vG),'NULL'),
    (select min_spend_cents from public.games where id=vG) = 590);

  insert into _m values ('règle tickets', 'le texte historique n''est PAS réécrit', '5,90',
    coalesce((select min_spend from public.games where id=vG),'NULL'),
    (select min_spend from public.games where id=vG) = '5,90');

  insert into _m values ('règle tickets', 'lecture du ticket valide via le contrat', '590',
    coalesce(public.minimum_effectif_du_ticket(t_valide)::text,'NULL'),
    public.minimum_effectif_du_ticket(t_valide) = 590);

  -- Un ticket consommé n'a pas de snapshot : il retombe sur le jeu, qui porte
  -- désormais la bonne valeur. Surtout pas sur zéro.
  insert into _m values ('règle tickets', 'ticket consommé : retombe sur le jeu, pas sur 0', '590',
    coalesce(public.minimum_effectif_du_ticket(t_consomme)::text,'NULL'),
    public.minimum_effectif_du_ticket(t_consomme) = 590);
end $$;

-- ═══════════════════ VERDICT — fail-closed, jamais un tableau à lire

do $$
declare
  v_total int; v_echecs int; v_liste text;
begin
  select count(*) into v_total from _m;
  /*
   * Un cas non joué n'est pas un cas réussi : si un bloc a été supprimé ou
   * n'a rien inséré, le compte le dit.
   */
  if v_total < 40 then
    raise exception 'HARNAIS MONNAIE : % cas enregistré(s), au moins 40 attendus. Un bloc n''a pas été joué.', v_total;
  end if;

  select count(*), string_agg(bloc || ' / ' || cas || ' : attendu ' || attendu || ', obtenu ' || obtenu, E'\n' order by bloc, cas)
    into v_echecs, v_liste
  from _m where conforme is distinct from true;

  if v_echecs > 0 then
    raise exception E'HARNAIS MONNAIE : % cas NON CONFORME(S) sur %.\n%', v_echecs, v_total, v_liste;
  end if;
  raise notice 'HARNAIS MONNAIE : les % cas sont conformes.', v_total;
end $$;

select bloc, count(*) as cas, count(*) filter (where conforme) as conformes
from _m group by bloc order by bloc;

rollback;
