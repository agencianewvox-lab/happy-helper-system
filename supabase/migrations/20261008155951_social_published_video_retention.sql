alter table public.social_publications add column media_removed_at timestamptz, add column cleanup_checked_at timestamptz, add column cleanup_error text;
create table app_private.social_retired_assets(
 path text primary key, client_id uuid not null references public.whatsapp_grupos(id),
 job_id uuid not null references public.social_publications(id), created_at timestamptz not null default now(), removed_at timestamptz
);
create index social_retired_client on app_private.social_retired_assets(client_id);
create index social_retired_job on app_private.social_retired_assets(job_id);
alter table app_private.social_retired_assets enable row level security;
revoke all on app_private.social_retired_assets from public,anon,authenticated;
grant all on app_private.social_retired_assets to service_role;
create function app_private.social_asset_reference_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('social-media:'||new.client_id::text,0));
 if exists(select 1 from jsonb_array_elements(new.assets) a join app_private.social_retired_assets r on r.path=a->>'path')
 then raise exception 'A cópia local deste vídeo foi removida após publicação. Envie um novo arquivo para reutilizá-lo.';end if;
 return new;
end $$;
revoke all on function app_private.social_asset_reference_guard() from public,anon,authenticated;
create trigger social_asset_reference_guard before insert or update of assets on public.social_posts for each row execute function app_private.social_asset_reference_guard();
create function app_private.social_reserve_cleanup(j uuid) returns text[] language plpgsql security definer set search_path='' as $$
declare x public.social_publications%rowtype; paths text[];
begin
 select * into x from public.social_publications where id=j and status='published' and media_id is not null for update;
 if not found then return '{}'::text[];end if;
 perform pg_advisory_xact_lock(hashtextextended('social-media:'||x.client_id::text,0));
 insert into app_private.social_retired_assets(path,client_id,job_id)
 select a->>'path',x.client_id,j from jsonb_array_elements(x.snapshot->'assets') a
 where a->>'type' like 'video/%'
 and left(a->>'path',length(x.client_id::text)+1)=x.client_id::text||'/' and position('..' in a->>'path')=0
 and not exists(select 1 from public.social_posts p where p.id<>x.post_id and exists(select 1 from jsonb_array_elements(p.assets) b where b->>'path'=a->>'path'))
 on conflict(path) do nothing;
 select coalesce(array_agg(path),'{}'::text[]) into paths from app_private.social_retired_assets where job_id=j and removed_at is null;
 return paths;
end $$;
create function public.social_reserve_cleanup(j uuid) returns text[] language sql security invoker set search_path='' as $$select app_private.social_reserve_cleanup(j)$$;
create function app_private.social_complete_cleanup(j uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update app_private.social_retired_assets set removed_at=now() where job_id=j and removed_at is null;
 update public.social_publications set media_removed_at=now(),cleanup_error=null where id=j;
end $$;
create function public.social_complete_cleanup(j uuid) returns void language sql security invoker set search_path='' as $$select app_private.social_complete_cleanup(j)$$;
revoke all on function app_private.social_reserve_cleanup(uuid),public.social_reserve_cleanup(uuid),app_private.social_complete_cleanup(uuid),public.social_complete_cleanup(uuid) from public,anon,authenticated;
grant execute on function app_private.social_reserve_cleanup(uuid),public.social_reserve_cleanup(uuid),app_private.social_complete_cleanup(uuid),public.social_complete_cleanup(uuid) to service_role;
