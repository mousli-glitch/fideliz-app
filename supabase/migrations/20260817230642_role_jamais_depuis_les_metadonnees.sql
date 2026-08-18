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
  'Cree le profil d''un nouvel utilisateur Auth. Le role est TOUJOURS restaurant et le rattachement TOUJOURS nul : ni l''un ni l''autre ne peut venir de raw_user_meta_data, que le client controle. Les roles privilegies sont poses par une action serveur gardee. Migration du 18/08/2026.';
