-- PostgREST verifies the JWT and execution grant. Decoding claims in Edge is not authorization.
create or replace function public.verify_panel_service() returns boolean
language sql stable security invoker set search_path='' as $$ select auth.role()='service_role'; $$;
revoke all on function public.verify_panel_service() from public,anon,authenticated;
grant execute on function public.verify_panel_service() to service_role;
