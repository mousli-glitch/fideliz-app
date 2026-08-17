revoke execute on function public.archive_redeemed_winners(integer, integer)
  from public, anon, authenticated, service_role;

revoke execute on function public._log_event(text, text, text, uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
