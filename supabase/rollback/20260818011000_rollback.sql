/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROLLBACK EXACT de 20260818011000_rls_isolation_inter_tenant
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ CE FICHIER RESTAURE VOLONTAIREMENT LES FAILLES.
 *
 *  Il ramène les policies et les deux fonctions à l'état HISTORIQUE de la
 *  production — celui dont l'empreinte est
 *  `5b6dd5bc9df9ce6068c148a3f5288c05`, 43 policies sur le schéma `public`.
 *
 *  C'est un rollback de CONTINUITÉ, pas un état de sécurité acceptable :
 *  il rouvre la lecture inter-tenant. À n'employer qu'en urgence, et pour
 *  deux heures au plus — au-delà, la fuite redevient le risque dominant.
 *
 *  ─── Pourquoi ce fichier existe ───
 *
 *  Le runbook annonçait que « le rollback SQL complet vit ici » et renvoyait à
 *  `docs/rollback-rls-joue.md`, qui ne contenait que des extraits de
 *  diagnostic. Le SQL exact n'était stocké nulle part : un runbook qui manque
 *  précisément à l'instant où on en a besoin.
 *
 *  Le contenu ci-dessous n'est pas réécrit de mémoire — il est transcrit des
 *  définitions VIVANTES de la production, relevées en lecture seule le
 *  18/08/2026 (`pg_policies`, `pg_get_functiondef`). La preuve de fidélité est
 *  l'empreinte : après exécution, elle doit valoir `5b6dd5bc…` au caractère
 *  près.
 *
 *  ─── Ordre ───
 *
 *  L'inverse de l'aller : les policies AVANT les fonctions. À l'aller,
 *  `current_role()` doit être SECURITY DEFINER avant que les policies qui
 *  l'appellent n'existent, sinon récursion `54001`. Au retour, les policies
 *  doivent lâcher la fonction avant qu'elle ne redevienne INVOKER.
 *
 *  Ce fichier n'est PAS une migration : il vit hors de `supabase/migrations/`
 *  pour que le CLI ne l'applique jamais tout seul.
 */

begin;

-- ═══════════════════════ 1. Policies posées par la migration ═══════════════
drop policy if exists profiles_root_select_all           on public.profiles;
drop policy if exists profiles_self                      on public.profiles;
drop policy if exists profiles_self_select               on public.profiles;
drop policy if exists "Super Admin Restaurants Read"     on public.restaurants;
drop policy if exists "Super Admin Restaurants Update"   on public.restaurants;
drop policy if exists "Super Admin Restaurants Delete"   on public.restaurants;
drop policy if exists crm_notes_root                     on public.crm_notes;
drop policy if exists crm_notes_commercial_rattache      on public.crm_notes;

-- ═══════════════════════ 2. État historique : profiles ═════════════════════
create policy final_profile_access_v3 on public.profiles
  as permissive for select to authenticated using (true);
create policy global_nav_profiles on public.profiles
  as permissive for select to authenticated using (true);
create policy temp_open_profiles on public.profiles
  as permissive for select to authenticated using (true);
create policy root_read_all_profiles on public.profiles
  as permissive for select to authenticated using (role = 'root'::text);
create policy profiles_self on public.profiles
  as permissive for select to public using (id = auth.uid());
create policy profiles_self_select on public.profiles
  as permissive for select to authenticated using (id = auth.uid());
create policy profiles_root_select_all on public.profiles
  as permissive for select to authenticated using (public."current_role"() = 'root'::text);

-- ═══════════════════════ 3. État historique : restaurants ══════════════════
create policy "Super Admin Restaurants Access" on public.restaurants
  as permissive for all to authenticated
  using ((auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid) or (owner_id = auth.uid()));
create policy "Sales can create restaurants" on public.restaurants
  as permissive for insert to authenticated with check (true);

-- ═══════════════════════ 4. État historique : crm_notes ════════════════════
-- `with check` EXPLICITE : un `for all` sans lui recopie le `using`, et
-- l'empreinte diverge. C'est la onzième table qui avait échoué au premier essai.
create policy sales_manage_notes on public.crm_notes
  as permissive for all to public
  using (is_sales() or is_root())
  with check (is_sales() or is_root());

-- ═══════════════════════ 5. État historique : LOT 2 ════════════════════════
/*
 * Ces deux-là manquaient à la première version de ce rollback, et le compte
 * de policies ne le montrait pas : 43 des deux côtés, mais deux textes
 * différents. Seule la comparaison policy par policy avec la production l'a
 * révélé. Un rollback incomplet aurait laissé `games` et `system_logs` dans
 * l'état migré en croyant avoir tout rendu.
 *
 * Noter l'asymétrie, qui est celle de la production : `ADMIN_GAMES_FULL_ACCESS`
 * porte un `with check`, `Root Full Access` n'en a pas.
 */
drop policy if exists "ADMIN_GAMES_FULL_ACCESS" on public.games;
create policy "ADMIN_GAMES_FULL_ACCESS" on public.games
  as permissive for all to authenticated
  using (auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid)
  with check (auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid);

drop policy if exists "Root Full Access" on public.system_logs;
create policy "Root Full Access" on public.system_logs
  as permissive for all to authenticated
  using (auth.uid() = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid);

-- ═══════════════════════ 6. Fonctions : retour à INVOKER ═══════════════════
create or replace function public."current_role"()
 returns text language sql stable set search_path to 'public'
as $function$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'anon'
  );
$function$;

create or replace function public.handle_deleted_commercial()
 returns trigger language plpgsql security definer
as $function$
BEGIN
    UPDATE public.restaurants
    SET created_by = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid,
        owner_id = '04eb7091-6876-41e0-84c6-5891658a5768'::uuid
    WHERE created_by = OLD.id OR owner_id = OLD.id;
    RETURN OLD;
END;
$function$;

-- Recréer une fonction efface ses droits : les rétablir explicitement.
grant execute on function public."current_role"()              to anon, authenticated, service_role;
grant execute on function public.handle_deleted_commercial()   to anon, authenticated, service_role;

commit;
