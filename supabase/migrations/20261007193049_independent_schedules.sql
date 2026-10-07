create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- The server credential stays encrypted in Vault, never in the cron command or Git.
create or replace function public.install_panel_schedules(server_key text) returns void
language plpgsql security invoker set search_path='' as $$
declare secret_id uuid; spec record; job_id bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if length(server_key)<100 then raise exception 'invalid_server_credential'; end if;
  select id into secret_id from vault.secrets where name='panel_schedule_service_key';
  if secret_id is null then
    perform vault.create_secret(server_key,'panel_schedule_service_key','Panel internal scheduled functions');
  else
    perform vault.update_secret(secret_id,server_key,'panel_schedule_service_key','Panel internal scheduled functions');
  end if;
  for spec in select * from (values
    ('panel-audio-onboarding','* * * * *','process-panel-jobs'),
    ('calculate-nps-predictions-6h','0 5,11,17,23 * * *','calculate-nps-predictions'),
    ('daily-feedback-18h-brt','0 21 * * 1-5','daily-feedback'),
    ('executive-briefing-7am','0 10 * * 1-5','executive-briefing')
  ) v(name,schedule,slug)
  loop
    select cron.schedule(spec.name,spec.schedule,format($cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='panel_schedule_service_key')),
        body := '{}'::jsonb, timeout_milliseconds := 120000
      );
    $cmd$, 'https://gorqyovidpdvuockzndm.supabase.co/functions/v1/'||spec.slug)) into job_id;
    -- Enable only after final source delta and production cutover.
    perform cron.alter_job(job_id,active:=false);
  end loop;
end;
$$;
revoke all on function public.install_panel_schedules(text) from public,anon,authenticated;
grant execute on function public.install_panel_schedules(text) to service_role;
grant usage on schema vault,cron to service_role;
grant select on vault.secrets to service_role;
grant execute on function vault.create_secret(text,text,text,uuid),vault.update_secret(uuid,text,text,text,uuid) to service_role;
