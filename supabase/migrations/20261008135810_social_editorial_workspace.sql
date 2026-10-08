-- Version aligned with the migration applied to the Panel project.
begin;
create table public.social_members (
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 can_approve boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(client_id,user_id)
);
create index social_members_user on public.social_members(user_id);
alter table public.social_members enable row level security;

-- Narrow private lookup: editorial membership never grants access to CRM/WhatsApp.
create function app_private.social_access(target uuid, approval boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and app_private.is_staff() and exists (
 select 1 from public.whatsapp_grupos g where g.id=target and (
 app_private.is_master() or app_private.is_self_name(g.gestor_responsavel)
 or exists(select 1 from public.social_members m where m.client_id=g.id and m.user_id=auth.uid()
 and (not approval or m.can_approve))))
$$;
revoke all on function app_private.social_access(uuid,boolean) from public,anon;
grant execute on function app_private.social_access(uuid,boolean) to authenticated,service_role;

create function app_private.social_portfolio() returns table(id uuid,nome text,can_approve boolean)
language sql stable security definer set search_path='' as $$
 select g.id,g.nome,app_private.social_access(g.id,true) from public.whatsapp_grupos g
 where app_private.social_access(g.id,false) order by g.nome
$$;
revoke all on function app_private.social_portfolio() from public,anon;
grant execute on function app_private.social_portfolio() to authenticated;
create function public.social_portfolio() returns table(id uuid,nome text,can_approve boolean)
language sql stable security invoker set search_path='' as $$select * from app_private.social_portfolio()$$;
revoke all on function public.social_portfolio() from public,anon;
grant execute on function public.social_portfolio() to authenticated;

create table public.social_posts (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),
 format text not null check(format in ('image','carousel','reel','story')),
 briefing text not null default '', caption text not null default '',
 assets jsonb not null default '[]'::jsonb check(jsonb_typeof(assets)='array'),
 scheduled_at timestamptz,
 status text not null default 'draft' check(status in ('draft','production','review','changes','approved','published_manual','cancelled')),
 version integer not null default 1 check(version>0),
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 publication_url text,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index social_posts_client_date on public.social_posts(client_id,scheduled_at);
create index social_posts_updated on public.social_posts(updated_at desc);
create table public.social_history (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.social_posts(id) on delete cascade,
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 version integer not null,
 status text not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index social_history_post on public.social_history(post_id,created_at desc);
create index social_history_client on public.social_history(client_id);
create table public.social_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.social_posts(id) on delete cascade,
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 body text not null check(length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index social_comments_post on public.social_comments(post_id,created_at);
create index social_comments_client on public.social_comments(client_id);
create function app_private.social_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if new.client_id<>old.client_id or new.created_by is distinct from old.created_by then
     raise exception 'O cliente e o autor original não podem ser alterados.';
   end if;
   new.version:=old.version+1; new.updated_at:=now();
   if row(new.title,new.format,new.briefing,new.caption,new.assets,new.scheduled_at)
      is distinct from row(old.title,old.format,old.briefing,old.caption,old.assets,old.scheduled_at) then
     new.approved_by:=null;new.approved_at:=null;new.publication_url:=null;
     if new.status in ('approved','published_manual') then new.status:='review';end if;
   end if;
 end if;
 return new;
end $$;
create function app_private.social_audit_after() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.social_history(post_id,client_id,actor_id,version,status,snapshot)
 values(new.id,new.client_id,new.updated_by,new.version,new.status,to_jsonb(new));return new;
end $$;
revoke all on function app_private.social_audit(),app_private.social_audit_after() from public,anon,authenticated;
create trigger social_version before update on public.social_posts for each row execute function app_private.social_audit();
create trigger social_history after insert or update on public.social_posts for each row execute function app_private.social_audit_after();
alter table public.social_posts enable row level security;
alter table public.social_history enable row level security;
alter table public.social_comments enable row level security;
create policy social_member_read on public.social_members for select to authenticated using(app_private.is_staff() and (user_id=(select auth.uid()) or app_private.is_master()));
create policy social_posts_read on public.social_posts for select to authenticated using(app_private.social_access(client_id,false));
create policy social_history_read on public.social_history for select to authenticated using(app_private.social_access(client_id,false));
create policy social_comments_read on public.social_comments for select to authenticated using(app_private.social_access(client_id,false));
revoke all on public.social_members,public.social_posts,public.social_history,public.social_comments from anon,authenticated;
grant select on public.social_members,public.social_posts,public.social_history,public.social_comments to authenticated;
grant all on public.social_members,public.social_posts,public.social_history,public.social_comments to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('social-assets','social-assets',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
 on conflict(id) do nothing;
create function app_private.social_asset_access(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.whatsapp_grupos g
 where g.id::text=split_part(path,'/',1) and app_private.social_access(g.id,false))
$$;
revoke all on function app_private.social_asset_access(text) from public,anon;
grant execute on function app_private.social_asset_access(text) to authenticated;
create policy social_asset_read on storage.objects for select to authenticated
 using(bucket_id='social-assets' and app_private.social_asset_access(name));
create policy social_asset_upload on storage.objects for insert to authenticated
 with check(bucket_id='social-assets' and app_private.social_asset_access(name));
-- Files are immutable: replacements get a fresh path, preserving approved versions.
commit;
