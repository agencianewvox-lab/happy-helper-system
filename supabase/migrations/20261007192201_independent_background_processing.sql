-- Service-owned durable work, inaccessible to anonymous users and managers.
create table if not exists public.panel_jobs (
  job_key text primary key, kind text not null check (kind in ('audio','onboarding','notification')),
  source_id uuid not null, status text not null default 'pending'
    check (status in ('pending','processing','done','failed','uncertain')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz, last_error text,
  payload jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.panel_jobs enable row level security;
revoke all on public.panel_jobs from public, anon, authenticated;
grant all on public.panel_jobs to service_role;
grant select on public.panel_jobs to authenticated;
create policy "Master reads processing status" on public.panel_jobs for select to authenticated using ((select app_private.is_master()));
create index panel_jobs_pending_idx on public.panel_jobs(available_at) where status='pending';
create or replace function public.claim_panel_jobs() returns setof public.panel_jobs
language sql security invoker set search_path='' as $$
  update public.panel_jobs set status='processing', started_at=now(), attempts=attempts+1
  where job_key in (select job_key from public.panel_jobs where status='pending' and available_at<=now()
    order by available_at for update skip locked limit 5)
  returning *;
$$;
revoke all on function public.claim_panel_jobs() from public,anon,authenticated;
grant execute on function public.claim_panel_jobs() to service_role;
create or replace function app_private.enqueue_panel_work() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Bulk migration uses postgres; it must not replay historical notifications.
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
     and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','')
         not in ('service_role','anon','authenticated') then return new; end if;
  if TG_TABLE_NAME='onboarding_responses' then
    insert into public.panel_jobs(job_key,kind,source_id) values ('onboarding:'||new.id,'onboarding',new.id) on conflict do nothing;
  elsif coalesce((new.dados_extras->'_retention'->>'transcription_pending')::boolean,false) then
    insert into public.panel_jobs(job_key,kind,source_id) values ('audio:'||new.id,'audio',new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enqueue_panel_work() from public,anon,authenticated;
create trigger enqueue_onboarding after insert on public.onboarding_responses for each row execute function app_private.enqueue_panel_work();
create trigger enqueue_audio after insert on public.whatsapp_conversas for each row execute function app_private.enqueue_panel_work();
