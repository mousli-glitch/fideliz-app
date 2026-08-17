-- ═══════════════════════════════════════════════════════════════════════
--  P0 — un rôle d'autorisation ne vient jamais des métadonnées du client
-- ═══════════════════════════════════════════════════════════════════════
--
--  `handle_new_user_profile()` est branchée sur la création de tout
--  utilisateur Auth. Elle lisait le rôle du nouveau profil ainsi :
--
--      coalesce(new.raw_user_meta_data->>'role', 'restaurant')
--
--  `raw_user_meta_data`, c'est `options.data` du SDK : une valeur écrite par
--  le client au moment de l'inscription. Relevé le 18/08/2026 sur ce projet :
--
--      disable_signup     = false   → inscription publique OUVERTE
--      mailer_autoconfirm = true    → aucun e-mail à confirmer
--
--  Une inscription portant `{"role":"root"}` produisait donc un compte root
--  immédiatement utilisable, par n'importe qui, sans validation d'adresse.
--
--  `restaurant_id` posait le même problème en plus discret : un inscrit
--  pouvait se rattacher au restaurant d'un vrai client, et les gardes
--  applicatives — qui comparent le restaurant de la session à celui de
--  l'objet visé — l'auraient laissé passer. Il est ignoré lui aussi.
--
--  ─── CE QUI N'EST PAS CASSÉ ───
--
--  Les trois parcours légitimes créent le compte avec la clé de service,
--  puis posent le rôle par un UPDATE explicite :
--
--    · masterCreateSalesAction   → profiles.update({role:'sales'})
--    · masterCreateRestaurant    → profiles.update({role, restaurant_id})
--    · createRestaurantAction    → profiles.update({role, restaurant_id})
--
--  Aucun ne dépend de ce que le trigger lit dans les métadonnées. Le seul
--  qui en dépendait, `POST /api/admin/create-user`, n'a aucun appelant et
--  pose désormais le profil explicitement lui aussi.
--
--  Les connexions existantes, la récupération de mot de passe et les
--  sessions en cours ne sont pas touchées : cette fonction ne s'exécute qu'à
--  la CRÉATION d'un utilisateur.
--
--  Rollback : rejouer 00000000000000_baseline_handle_new_user_profile.sql.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  /*
   * Le rôle est écrit en dur, et le rattachement laissé vide.
   *
   * Un compte fraîchement créé ne peut donc rien : `restaurant` sans
   * `restaurant_id`, c'est un profil que toutes les gardes applicatives
   * refusent, parce qu'elles exigent que le restaurant visé soit le sien.
   *
   * Élever ce compte est une décision, prise ailleurs, par une action
   * serveur gardée qui vérifie l'identité de l'appelant et journalise.
   */
  insert into public.profiles (id, email, role, restaurant_id)
  values (new.id, new.email, 'restaurant', null);

  return new;
end;
$function$;

comment on function public.handle_new_user_profile() is
  'Crée le profil d''un nouvel utilisateur Auth. Le rôle est TOUJOURS restaurant '
  'et le rattachement TOUJOURS nul : ni l''un ni l''autre ne peut venir de '
  'raw_user_meta_data, que le client contrôle. Les rôles privilégiés sont posés '
  'par une action serveur gardée. Voir la migration du 18/08/2026.';
