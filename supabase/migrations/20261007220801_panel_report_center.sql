-- All report state belongs to the Panel. No changes in the source CRM.
create table public.report_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 instance_name text not null unique,
 status text not null default 'disconnected',
 phone text,
 updated_at timestamptz not null default now()
);
create table public.report_sources (
 client_id uuid primary key references public.whatsapp_grupos(id) on delete cascade,
 crm_account_id uuid not null,
 instance_ids uuid[] not null,
 pipeline_ids uuid[] not null default '{}',
 pipeline_only uuid,
 version integer not null default 1,
 confirmed_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table public.report_configs (
 client_id uuid primary key references public.whatsapp_grupos(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id),
 enabled boolean not null default false,
 version integer not null default 1,
 settings jsonb not null,
 preview_hash text,
 updated_at timestamptz not null default now()
);
create table public.report_runs (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id),
 idempotency_key text not null unique,
 status text not null default 'queued' check(status in ('queued','processing','accepted','failed','uncertain','skipped')),
 snapshot jsonb not null,
 result jsonb,
 message text,
 provider_message_id text,
 error text,
 available_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 finished_at timestamptz
 ,started_at timestamptz
);
create index report_runs_client_created on public.report_runs(client_id,created_at desc);
create index report_runs_queue on public.report_runs(available_at) where status='queued';
create index report_configs_owner on public.report_configs(owner_user_id);
alter table public.report_connections enable row level security;
alter table public.report_sources enable row level security;
alter table public.report_configs enable row level security;
alter table public.report_runs enable row level security;
create policy report_connections_read on public.report_connections for select to authenticated
 using (app_private.is_staff() and (user_id=(select auth.uid()) or app_private.is_master()));
create policy report_sources_read on public.report_sources for select to authenticated
 using (exists(select 1 from public.whatsapp_grupos g where g.id=client_id and app_private.can_access_group(g.group_id)));
create policy report_configs_read on public.report_configs for select to authenticated
 using (exists(select 1 from public.whatsapp_grupos g where g.id=client_id and app_private.can_access_group(g.group_id)));
create policy report_runs_read on public.report_runs for select to authenticated
 using (exists(select 1 from public.whatsapp_grupos g where g.id=client_id and app_private.can_access_group(g.group_id)));
revoke all on public.report_connections,public.report_sources,public.report_configs,public.report_runs from anon,authenticated;
grant select on public.report_connections,public.report_sources,public.report_configs,public.report_runs to authenticated;
grant all on public.report_connections,public.report_sources,public.report_configs,public.report_runs to service_role;
create function public.claim_panel_report_runs(batch_size integer default 2)
 returns setof public.report_runs language sql security invoker set search_path=public as $$
 update public.report_runs set status='processing',started_at=now()
 where id in (select id from public.report_runs where status='queued' and available_at<=now()
 order by available_at for update skip locked limit least(greatest(batch_size,1),3)) returning *;
$$;
revoke all on function public.claim_panel_report_runs(integer) from public,anon,authenticated;
grant execute on function public.claim_panel_report_runs(integer) to service_role;
create function public.panel_report_sender_allowed(target_client uuid,target_user uuid)
 returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.whatsapp_grupos g join public.profiles p on p.user_id=target_user
 join auth.users u on u.id=p.user_id
 where g.id=target_client and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and (p.is_master=true or p.role='admin' or g.gestor_responsavel=case
 when lower(p.full_name) in ('murillo','murilo') then 'Murilo Araújo'
 when lower(p.full_name) in ('netto','neto') then 'Netto Monge'
 when lower(p.full_name) in ('priscilla','priscila') then 'Priscilla Borges'
 else p.full_name end));
$$;
revoke all on function public.panel_report_sender_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.panel_report_sender_allowed(uuid,uuid) to service_role;
