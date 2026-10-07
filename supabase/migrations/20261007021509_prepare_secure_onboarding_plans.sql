-- PREPARATION ONLY: not applied to either database. Never run blindly with db push.
-- The live source currently FAILS the authorization precondition below.
-- First review/repair legacy group ownership writes and verify role isolation.
begin;
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.whatsapp_grupos') is null
     or to_regclass('public.onboarding_responses') is null then
    raise exception 'Restore and verify application identities and clients before enabling onboarding sync';
  end if;
  -- Fail closed on effective privileges, not a textual guess about policy expressions.
  -- Protected identity/ownership writes must use separately audited privileged operations.
  if has_table_privilege('anon','public.whatsapp_grupos','INSERT,UPDATE')
    or has_table_privilege('anon','public.profiles','INSERT,UPDATE')
    or has_table_privilege('authenticated','public.profiles','INSERT')
    or has_column_privilege('authenticated','public.profiles','full_name','UPDATE')
    or has_column_privilege('authenticated','public.profiles','role','UPDATE')
    or has_column_privilege('authenticated','public.profiles','is_master','UPDATE')
    or has_column_privilege('authenticated','public.whatsapp_grupos','gestor_responsavel','UPDATE') then
    raise exception 'Unsafe legacy identity/ownership writes: review permissions before enabling onboarding sync';
  end if;
  -- This gate is necessary, not sufficient: audit every definer/RPC/Edge Function
  -- that can change identities or assignments and test the real Master/manager matrix.
end $$;

create table public.onboarding_meeting_plans (
  response_id uuid primary key references public.onboarding_responses(id) on delete restrict,
  group_id text not null references public.whatsapp_grupos(group_id) on delete restrict,
  plan jsonb not null check (jsonb_typeof(plan)='object' and octet_length(plan::text)<=32768),
  version integer not null default 1 check (version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict
);
create index onboarding_meeting_plans_group_idx on public.onboarding_meeting_plans(group_id);
create index onboarding_meeting_plans_editor_idx on public.onboarding_meeting_plans(updated_by);
alter table public.onboarding_meeting_plans enable row level security;
revoke all on public.onboarding_meeting_plans from public,anon,authenticated;
grant select on public.onboarding_meeting_plans to authenticated;
grant insert (response_id,group_id,plan) on public.onboarding_meeting_plans to authenticated;
grant update (plan) on public.onboarding_meeting_plans to authenticated;

-- Session identity and audit fields cannot be supplied by a browser.
create function public.stamp_onboarding_meeting_plan() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists (select 1 from public.onboarding_responses r where r.id=new.response_id and r.group_id=new.group_id) then
    raise exception 'Response does not belong to this client' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if new.response_id<>old.response_id or new.group_id<>old.group_id then
      raise exception 'Plan identity is immutable' using errcode='23514';
    end if;
    new.version:=old.version+1;
  else new.version:=1;
  end if;
  new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp(); return new;
end $$;
revoke all on function public.stamp_onboarding_meeting_plan() from public,anon,authenticated;
create trigger stamp_onboarding_meeting_plan before insert or update on public.onboarding_meeting_plans
for each row execute function public.stamp_onboarding_meeting_plan();

-- Reuse the verified operator-to-portfolio mapping; not user_metadata or browser filters.
-- This is safe ONLY after ownership writes in whatsapp_grupos are protected.
create policy "Read assigned onboarding plans" on public.onboarding_meeting_plans for select to authenticated
using (exists (
  select 1 from public.profiles p join public.whatsapp_grupos g on g.group_id=onboarding_meeting_plans.group_id
  where p.user_id=(select auth.uid()) and (p.is_master or (p.role='gestor' and g.gestor_responsavel=case
    when p.full_name in ('Murillo','Murilo') then 'Murilo Araújo'
    when p.full_name in ('Netto','Neto') then 'Netto Monge' else null end))
));
create policy "Insert assigned onboarding plans" on public.onboarding_meeting_plans for insert to authenticated
with check (exists (
  select 1 from public.profiles p join public.whatsapp_grupos g on g.group_id=onboarding_meeting_plans.group_id
  where p.user_id=(select auth.uid()) and (p.is_master or (p.role='gestor' and g.gestor_responsavel=case
    when p.full_name in ('Murillo','Murilo') then 'Murilo Araújo'
    when p.full_name in ('Netto','Neto') then 'Netto Monge' else null end))
));
create policy "Update assigned onboarding plans" on public.onboarding_meeting_plans for update to authenticated
using (exists (
  select 1 from public.profiles p join public.whatsapp_grupos g on g.group_id=onboarding_meeting_plans.group_id
  where p.user_id=(select auth.uid()) and (p.is_master or (p.role='gestor' and g.gestor_responsavel=case
    when p.full_name in ('Murillo','Murilo') then 'Murilo Araújo'
    when p.full_name in ('Netto','Neto') then 'Netto Monge' else null end))
)) with check (exists (
  select 1 from public.profiles p join public.whatsapp_grupos g on g.group_id=onboarding_meeting_plans.group_id
  where p.user_id=(select auth.uid()) and (p.is_master or (p.role='gestor' and g.gestor_responsavel=case
    when p.full_name in ('Murillo','Murilo') then 'Murilo Araújo'
    when p.full_name in ('Netto','Neto') then 'Netto Monge' else null end))
));
-- No DELETE and no anonymous read/write. Original onboarding answers are untouched.
commit;
