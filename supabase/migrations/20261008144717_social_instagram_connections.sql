-- Panel-only Instagram authorization. No CRM objects are changed.
-- Version matches the migration applied through the Management API.
create table public.social_instagram_accounts (
 client_id uuid primary key references public.whatsapp_grupos(id) on delete cascade,
 instagram_id text not null unique check (instagram_id ~ '^[0-9]+$'),
 username text not null, account_type text not null,
 can_publish boolean not null default false,
 expires_at timestamptz not null,
 connected_by uuid references auth.users(id) on delete set null,
 connected_at timestamptz not null default now()
);
alter table public.social_instagram_accounts enable row level security;
revoke all on public.social_instagram_accounts from anon, authenticated;
grant select on public.social_instagram_accounts to authenticated;
grant all on public.social_instagram_accounts to service_role;
create policy social_instagram_read on public.social_instagram_accounts for select to authenticated
 using (app_private.social_access(client_id));
create table public.social_instagram_oauth (
 state_hash text primary key check(length(state_hash)=64),
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 claimed_at timestamptz,
 secret_id uuid,
 instagram_id text,
 username text,
 account_type text,
 can_publish boolean not null default false,
 token_expires_at timestamptz
);
alter table public.social_instagram_oauth enable row level security;
revoke all on public.social_instagram_oauth from anon, authenticated;
grant all on public.social_instagram_oauth to service_role;
create index social_instagram_oauth_expiry on public.social_instagram_oauth(expires_at);
create table app_private.social_instagram_tokens (
 client_id uuid primary key references public.whatsapp_grupos(id) on delete cascade,
 secret_id uuid not null
);
alter table app_private.social_instagram_tokens enable row level security;
revoke all on app_private.social_instagram_tokens from public, anon, authenticated;
-- Narrow privileged Vault operations; exposed wrappers are service-only.
create function app_private.social_instagram_stage(h text,u uuid,t text,ig text,n text,k text,p boolean,e timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 perform 1 from public.social_instagram_oauth where state_hash=h and user_id=u
 and claimed_at is not null and secret_id is null and expires_at>now() for update;
 if not found then raise exception 'Authorization expired'; end if;
 sid := vault.create_secret(t, null, 'Panel Instagram authorization');
 update public.social_instagram_oauth set secret_id=sid,instagram_id=ig,username=n,
 account_type=k,can_publish=p,token_expires_at=e where state_hash=h;
end $$;
create function public.social_instagram_stage(h text,u uuid,t text,ig text,n text,k text,p boolean,e timestamptz)
returns void language sql security invoker set search_path='' as $$
 select app_private.social_instagram_stage(h,u,t,ig,n,k,p,e)
$$;
create function app_private.social_instagram_confirm(h text,u uuid,c uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.social_instagram_oauth%rowtype; old_id uuid;
begin
 select * into s from public.social_instagram_oauth where state_hash=h and user_id=u and client_id=c
 and secret_id is not null and expires_at>now() for update;
 if not found then raise exception 'Authorization expired'; end if;
 -- Serialize confirmations for one client, including reconnections.
 perform 1 from public.whatsapp_grupos where id=c for update;
 select secret_id into old_id from app_private.social_instagram_tokens where client_id=c;
 insert into public.social_instagram_accounts(client_id,instagram_id,username,account_type,can_publish,expires_at,connected_by)
 values(c,s.instagram_id,s.username,s.account_type,s.can_publish,s.token_expires_at,u)
 on conflict(client_id) do update set instagram_id=excluded.instagram_id,username=excluded.username,
 account_type=excluded.account_type,can_publish=excluded.can_publish,expires_at=excluded.expires_at,
 connected_by=excluded.connected_by,connected_at=now();
 insert into app_private.social_instagram_tokens values(c,s.secret_id)
 on conflict(client_id) do update set secret_id=excluded.secret_id;
 delete from public.social_instagram_oauth where state_hash=h;
 if old_id is not null then delete from vault.secrets where id=old_id; end if;
end $$;
create function public.social_instagram_confirm(h text,u uuid,c uuid)
returns void language sql security invoker set search_path='' as $$
 select app_private.social_instagram_confirm(h,u,c)
$$;
revoke all on function app_private.social_instagram_stage(text,uuid,text,text,text,text,boolean,timestamptz),
 app_private.social_instagram_confirm(text,uuid,uuid),
 public.social_instagram_stage(text,uuid,text,text,text,text,boolean,timestamptz),
 public.social_instagram_confirm(text,uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.social_instagram_stage(text,uuid,text,text,text,text,boolean,timestamptz),
 app_private.social_instagram_confirm(text,uuid,uuid),
 public.social_instagram_stage(text,uuid,text,text,text,text,boolean,timestamptz),
 public.social_instagram_confirm(text,uuid,uuid) to service_role;
-- Remove only expired, unconfirmed Panel tokens (never a live account credential).
create function app_private.social_instagram_expire()
returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 with expired as (
  delete from public.social_instagram_oauth where expires_at < now() returning secret_id
 ) select array_agg(secret_id) into ids from expired where secret_id is not null;
 delete from vault.secrets v where v.id=any(ids)
 and not exists(select 1 from app_private.social_instagram_tokens t where t.secret_id=v.id);
end $$;
create function public.social_instagram_expire()
returns void language sql security invoker set search_path='' as $$
 select app_private.social_instagram_expire()
$$;
revoke all on function app_private.social_instagram_expire(),public.social_instagram_expire() from public,anon,authenticated;
grant execute on function app_private.social_instagram_expire(),public.social_instagram_expire() to service_role;
