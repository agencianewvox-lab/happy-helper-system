-- Internal jobs execute as postgres (a login role), not as the API-only service_role.
do $$ declare j record; n bigint; begin
  for j in select * from cron.job where username='service_role' and jobname in
    ('panel-audio-onboarding','calculate-nps-predictions-6h','daily-feedback-18h-brt','executive-briefing-7am')
  loop
    n:=cron.schedule(j.jobname,j.schedule,j.command);
    perform cron.alter_job(n,active:=false);
  end loop;
end $$;
set local role service_role;
select cron.unschedule(jobid) from cron.job where username='service_role' and jobname in
  ('panel-audio-onboarding','calculate-nps-predictions-6h','daily-feedback-18h-brt','executive-briefing-7am');
reset role;
drop function if exists public.install_panel_schedules(text);
revoke execute on function cron.alter_job(bigint,text,text,text,text,boolean) from service_role;
revoke select on vault.secrets,vault.decrypted_secrets from service_role;
revoke execute on function vault.create_secret(text,text,text,uuid),vault.update_secret(uuid,text,text,text,uuid) from service_role;
revoke usage on schema vault,cron,net from service_role;
