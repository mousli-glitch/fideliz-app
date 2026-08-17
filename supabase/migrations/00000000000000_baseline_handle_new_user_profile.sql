-- ═══════════════════════════════════════════════════════════════════════
--  BASELINE — état historique, tel que déployé au 18/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
--  ⚠ CE FICHIER N'EST PAS À REJOUER SUR UNE BASE SAINE.
--
--  Il conserve la définition EXACTE de `handle_new_user_profile()` telle
--  qu'elle tournait en production, avec son défaut, parce que la baseline
--  doit expliquer l'état historique et non le corriger en douce. La
--  correction vit dans une migration séparée et datée :
--
--    20260818_0100_role_jamais_depuis_les_metadonnees.sql
--
--  Le défaut : le rôle du profil était lu dans `raw_user_meta_data`,
--  c'est-à-dire dans ce que le client envoie lui-même au moment de
--  l'inscription (`options.data` du SDK). Combiné à une inscription publique
--  ouverte et à la confirmation d'e-mail désactivée, une inscription portant
--  `{"role":"root"}` produisait un compte root immédiatement utilisable.
--
--  Constaté le 18/08/2026. Audit des neuf comptes existants : aucune
--  élévation n'avait été réalisée.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, role, restaurant_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'restaurant'),  -- défaut VALIDE
    (new.raw_user_meta_data->>'restaurant_id')::uuid
  );
  return new;
end;
$function$;
