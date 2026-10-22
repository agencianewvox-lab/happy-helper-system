-- ADM uses existing global operational policies; ownership remains a separate flag.
create or replace function app_private.is_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.is_staff() and exists(select 1 from public.profiles where user_id=auth.uid() and is_master=true);
$$;
revoke all on function app_private.is_owner() from public,anon,authenticated;
grant execute on function app_private.is_owner() to authenticated,service_role;

-- Existing is_master() means operational admin. It must not authorize self-promotion.
alter policy master_all on public.profiles
 using ((select app_private.is_owner())) with check ((select app_private.is_owner()));

create table app_private.team_access_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id), target_user_id uuid not null references auth.users(id),
 old_role text, new_role text not null, created_at timestamptz not null default now()
);
alter table app_private.team_access_audit enable row level security;
revoke all on app_private.team_access_audit from public,anon,authenticated;
grant all on app_private.team_access_audit to service_role;
create index team_access_audit_actor_idx on app_private.team_access_audit(actor_id);
create index team_access_audit_target_idx on app_private.team_access_audit(target_user_id,created_at desc);

create or replace function app_private.audit_team_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into app_private.team_access_audit(actor_id,target_user_id,new_role) values(auth.uid(),new.user_id,new.role);
 elsif new.role is distinct from old.role then
  insert into app_private.team_access_audit(actor_id,target_user_id,old_role,new_role) values(auth.uid(),new.user_id,old.role,new.role);
  -- Cached extension authorization must be renewed after any change of role.
  update public.meeting_device_sessions set revoked_at=now() where user_id=new.user_id and revoked_at is null;
 end if;
 return new;
end; $$;
revoke all on function app_private.audit_team_role() from public,anon,authenticated;
create trigger audit_team_role after insert or update of role on public.profiles
 for each row execute function app_private.audit_team_role();

create or replace function public.set_team_role(p_profile_id uuid,p_role text,p_expected_role text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.profiles; sid uuid;
begin
 if not app_private.is_owner() then raise exception 'owner_required' using errcode='42501';end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then raise exception 'session_expired' using errcode='42501';end if;
 if p_role is null or p_role not in('admin','gestor','social_media') then raise exception 'invalid_role';end if;
 select * into target from public.profiles where id=p_profile_id for update;
 if not found or target.is_master then raise exception 'protected_profile' using errcode='42501';end if;
 if target.role is distinct from p_expected_role then raise exception 'profile_changed' using errcode='40001';end if;
 update public.profiles set role=p_role where id=target.id;
end; $$;
revoke all on function public.set_team_role(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_team_role(uuid,text,text) to authenticated;
