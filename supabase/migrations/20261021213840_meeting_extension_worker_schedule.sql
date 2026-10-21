begin;
create index meeting_devices_approver_idx on public.meeting_devices(approved_by);
create index meeting_sessions_user_idx on public.meeting_device_sessions(user_id);
create index client_meetings_device_idx on public.client_meetings(device_id);
create index client_meetings_reviewer_idx on public.client_meetings(reviewed_by);
create index meeting_tasks_task_idx on public.meeting_tasks(task_id);
do $$ begin
 if not exists(select 1 from vault.secrets where name='panel_schedule_service_key') then
  raise exception 'Configure the existing Panel scheduler service credential in Vault first.';
 end if;
end $$;
select cron.schedule('panel-meeting-transcription','* * * * *', $job$
 select net.http_post(
  url:='https://gorqyovidpdvuockzndm.supabase.co/functions/v1/meeting-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='panel_schedule_service_key' limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=150000
 );
$job$);
commit;
