/*
 * ═══════════════════════════════════════════════════════════════════════
 *  RATTACHEMENT DU COMMERCIAL AUX TROIS CLIENTS RÉELS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Décision de Samy, 18/08/2026 : le commercial suit La Ruche, Best Pizza et
 * Soukara. `test78` est exclu — c'est un compte de test.
 *
 * ─── Ce que ce script n'est PAS ───
 *
 * Ce n'est pas une compensation du hotfix RLS. Vérifié dans le code :
 * `app/api/sales/dashboard/route.ts` lit `sales_restaurants` et `restaurants`
 * avec la CLÉ DE SERVICE, qui contourne la RLS par construction. Le hotfix ne
 * touche donc pas ce parcours.
 *
 * Aujourd'hui, avec zéro rattachement et zéro restaurant créé par lui, le
 * dashboard du commercial est DÉJÀ vide — il n'existe aucun repli « voir
 * tout ». Ce script l'améliore ; il ne répare pas une régression.
 *
 * ─── Idempotent et rejouable ───
 *
 * `on conflict do nothing` sur la clé primaire (`sales_user_id`,
 * `restaurant_id`). Deux exécutions donnent le même état.
 *
 * ─── Aucune adresse dans Git ───
 *
 * Le commercial est résolu par son RÔLE, pas par son adresse. Le dépôt est
 * public : y écrire un courriel réel serait le publier.
 */

do $$
declare
  v_sales     uuid;
  v_nb_sales  int;
  v_attendus  constant text[] := array['la-ruche','best-pizza','soukara'];
  v_trouves   int;
  v_avant     int;
  v_apres     int;
begin
  -- ─── Le commercial, résolu sans ambiguïté ───
  select count(*) into v_nb_sales from public.profiles where role = 'sales';
  if v_nb_sales = 0 then
    raise exception 'Aucun compte de rôle « sales ». Rien à rattacher.';
  end if;
  if v_nb_sales > 1 then
    raise exception 'ARRÊT : % comptes de rôle « sales ». Ce script refuse de '
      'choisir à votre place — désignez explicitement lequel.', v_nb_sales;
  end if;
  select id into v_sales from public.profiles where role = 'sales';

  -- ─── Les trois restaurants doivent exister, tous les trois ───
  select count(*) into v_trouves
  from public.restaurants where slug = any(v_attendus);
  if v_trouves <> 3 then
    raise exception 'ARRÊT : % restaurant(s) trouvé(s) sur les 3 attendus (%). '
      'Les faits ne correspondent pas à la décision.', v_trouves, array_to_string(v_attendus, ', ');
  end if;

  /*
   * `test78` est exclu EXPLICITEMENT, et pas seulement par omission de la
   * liste. Une exclusion nommée se relit ; une omission se rattrape par
   * distraction au premier copier-coller.
   */
  if 'test78' = any(v_attendus) then
    raise exception 'ARRÊT : test78 figure dans la liste. C''est un compte de test.';
  end if;

  select count(*) into v_avant from public.sales_restaurants where sales_user_id = v_sales;

  insert into public.sales_restaurants (sales_user_id, restaurant_id)
  select v_sales, r.id from public.restaurants r where r.slug = any(v_attendus)
  on conflict do nothing;

  select count(*) into v_apres from public.sales_restaurants where sales_user_id = v_sales;

  -- ─── Vérification AVANT de laisser la transaction se valider ───
  if v_apres <> 3 then
    raise exception 'ARRÊT : % rattachement(s) après insertion, 3 attendus. '
      'Rien n''est validé.', v_apres;
  end if;
  if exists (
    select 1 from public.sales_restaurants sr
    join public.restaurants r on r.id = sr.restaurant_id
    where sr.sales_user_id = v_sales and r.slug = 'test78'
  ) then
    raise exception 'ARRÊT : test78 rattaché. Rien n''est validé.';
  end if;

  raise notice 'Rattachements : % avant, % après. Les trois clients réels, test78 exclu.', v_avant, v_apres;
end $$;

-- Contrôle final, à relire de ses yeux.
select r.slug, (sr.sales_user_id is not null) as rattache
from public.restaurants r
left join public.sales_restaurants sr on sr.restaurant_id = r.id
order by r.slug;

/*
 * ─────────────────────────────────────────────────────────────────────
 *  RETOUR ARRIÈRE — ne supprime QUE les lignes créées ici
 * ─────────────────────────────────────────────────────────────────────
 *
 * delete from public.sales_restaurants sr
 *  using public.restaurants r
 *  where r.id = sr.restaurant_id
 *    and r.slug in ('la-ruche','best-pizza','soukara')
 *    and sr.sales_user_id = (select id from public.profiles where role = 'sales');
 *
 * Aucune autre ligne n'est touchée : le filtre porte à la fois sur les trois
 * slugs et sur le compte commercial.
 */
