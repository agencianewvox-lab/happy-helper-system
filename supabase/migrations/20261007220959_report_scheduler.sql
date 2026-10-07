create index report_sources_confirmed_by on public.report_sources(confirmed_by);
create index report_runs_owner on public.report_runs(owner_user_id);
-- Runs under the existing encrypted internal service credential. Configs default OFF.
select cron.schedule('panel-report-scheduler','* * * * *',$cmd$
 select net.http_post(
  url:='https://gorqyovidpdvuockzndm.supabase.co/functions/v1/report-scheduler',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='panel_schedule_service_key')),
  body:='{}'::jsonb,timeout_milliseconds:=120000
 );
$cmd$);
