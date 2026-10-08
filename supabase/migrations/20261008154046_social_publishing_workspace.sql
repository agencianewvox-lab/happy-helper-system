alter table public.social_posts drop constraint social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check(status in ('draft','production','review','changes','approved','published_manual','published','cancelled'));
alter table public.social_instagram_accounts add column last_checked_at timestamptz, add column connection_error text, add column can_insights boolean not null default false;
create table public.social_publications (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null unique references public.social_posts(id) on delete cascade,
 client_id uuid not null references public.whatsapp_grupos(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 instagram_id text not null, connected_at timestamptz not null,
 post_version integer not null, snapshot jsonb not null,
 due_at timestamptz not null, next_attempt_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','processing','publishing','published','failed','uncertain','cancelled')),
 containers jsonb not null default '[]', root_container text,
 lock_token uuid, locked_until timestamptz, attempts integer not null default 0,
 media_id text, permalink text, error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index social_publication_due on public.social_publications(next_attempt_at,due_at) where status in ('queued','processing','uncertain');
create index social_publication_client on public.social_publications(client_id);
create index social_publication_actor on public.social_publications(actor_id);
alter table public.social_publications enable row level security;
revoke all on public.social_publications from public,anon,authenticated;
grant select on public.social_publications to authenticated;
grant all on public.social_publications to service_role;
create policy social_publication_read on public.social_publications for select to authenticated using(app_private.social_access(client_id));
-- Recheck current employment and assignment before each automatic dispatch.
create function app_private.social_actor_allowed(c uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users a on a.id=p.user_id join public.whatsapp_grupos g on g.id=c
 where p.user_id=u and a.deleted_at is null and (a.banned_until is null or a.banned_until<now())
 and (p.is_master or p.role='admin' or
 g.gestor_responsavel = case lower(trim(p.full_name)) when 'murillo' then 'Murilo Araújo' when 'murilo' then 'Murilo Araújo' when 'netto' then 'Netto Monge' when 'neto' then 'Netto Monge' when 'priscilla' then 'Priscilla Borges' else p.full_name end
 or exists(select 1 from public.social_members m where m.client_id=c and m.user_id=u and m.can_approve)));
$$;
create function public.social_actor_allowed(c uuid,u uuid) returns boolean language sql security invoker set search_path='' as $$select app_private.social_actor_allowed(c,u)$$;
create function app_private.social_credential(c uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(a)||jsonb_build_object('token',v.decrypted_secret)
 from public.social_instagram_accounts a join app_private.social_instagram_tokens t on t.client_id=a.client_id
 join vault.decrypted_secrets v on v.id=t.secret_id where a.client_id=c
$$;
create function public.social_credential(c uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.social_credential(c)$$;
create function app_private.social_refresh_token(c uuid,bound timestamptz,t text,e timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 perform 1 from public.social_instagram_accounts where client_id=c and connected_at=bound for update;
 if not found then return false;end if;
 select secret_id into sid from app_private.social_instagram_tokens where client_id=c;
 if sid is null then return false;end if;
 perform vault.update_secret(sid,t);
 update public.social_instagram_accounts set expires_at=e where client_id=c;
 return true;
end $$;
create function public.social_refresh_token(c uuid,bound timestamptz,t text,e timestamptz) returns boolean language sql security invoker set search_path='' as $$select app_private.social_refresh_token(c,bound,t,e)$$;
create function app_private.social_disconnect(c uuid) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 perform 1 from public.social_instagram_accounts where client_id=c for update;
 if exists(select 1 from public.social_publications where client_id=c and status in ('publishing','uncertain')) then
 raise exception 'Há uma publicação em confirmação. Aguarde a conclusão antes de desconectar.';end if;
 update public.social_publications set status='cancelled',error='Conta desconectada.',lock_token=null,locked_until=null,updated_at=now()
 where client_id=c and status in ('queued','processing');
 delete from app_private.social_instagram_tokens where client_id=c returning secret_id into sid;
 delete from public.social_instagram_accounts where client_id=c;
 if sid is not null then delete from vault.secrets where id=sid;end if;
end $$;
create function public.social_disconnect(c uuid) returns void language sql security invoker set search_path='' as $$select app_private.social_disconnect(c)$$;
create function app_private.social_enqueue(p uuid,u uuid,v integer,d timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare x public.social_posts%rowtype;a public.social_instagram_accounts%rowtype;j uuid;
begin
 select * into x from public.social_posts where id=p for update;
 if not found or x.status<>'approved' or x.version<>v or not app_private.social_actor_allowed(x.client_id,u)
 then raise exception 'A versão precisa estar aprovada e seu acesso deve estar ativo.';end if;
 select * into a from public.social_instagram_accounts where client_id=x.client_id for update;
 if not found or not a.can_publish or a.expires_at<now() then raise exception 'Reconecte uma conta com permissão de publicação.';end if;
 if exists(select 1 from public.social_publications where post_id=p and status not in ('failed','cancelled'))
 then raise exception 'Este conteúdo já está na fila ou foi publicado.';end if;
 insert into public.social_publications(post_id,client_id,actor_id,instagram_id,connected_at,post_version,snapshot,due_at)
 values(p,x.client_id,u,a.instagram_id,a.connected_at,x.version,to_jsonb(x),d)
 on conflict(post_id) do update set actor_id=u,instagram_id=a.instagram_id,connected_at=a.connected_at,
 post_version=x.version,snapshot=to_jsonb(x),due_at=d,next_attempt_at=now(),status='queued',containers='[]',root_container=null,
 lock_token=null,locked_until=null,attempts=0,media_id=null,permalink=null,error=null,updated_at=now()
 returning id into j; return j;
end $$;
create function public.social_enqueue(p uuid,u uuid,v integer,d timestamptz) returns uuid language sql security invoker set search_path='' as $$select app_private.social_enqueue(p,u,v,d)$$;
create function public.social_claim() returns setof public.social_publications language plpgsql security invoker set search_path='' as $$
begin
 update public.social_publications set status='uncertain',error='Aguardando confirmação do Instagram.',locked_until=null,next_attempt_at=now()
 where status='publishing' and locked_until<now();
 return query with picked as (
 select id from public.social_publications where status in ('queued','processing','uncertain') and due_at<=now()
 and next_attempt_at<=now() and (locked_until is null or locked_until<now())
 order by next_attempt_at for update skip locked limit 2
 ) update public.social_publications j set status=case when j.status='uncertain' then 'uncertain' else 'processing' end,
 lock_token=gen_random_uuid(),locked_until=now()+interval '4 minutes',attempts=attempts+1,updated_at=now()
 from picked where j.id=picked.id returning j.*;
end $$;
-- Last transaction before the external publish call. Binds account, approved version and actor.
create function app_private.social_begin_publish(j uuid,l uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare x public.social_publications%rowtype;
begin
 select * into x from public.social_publications where id=j;
 if not found then return false;end if;
 perform 1 from public.social_instagram_accounts where client_id=x.client_id and instagram_id=x.instagram_id and connected_at=x.connected_at and can_publish and expires_at>now() for update;
 if not found or not app_private.social_actor_allowed(x.client_id,x.actor_id) then return false;end if;
 if not exists(select 1 from public.social_posts where id=x.post_id and status='approved' and version=x.post_version) then return false;end if;
 update public.social_publications set status='publishing',updated_at=now()
 where id=j and lock_token=l and locked_until>now() and status='processing' and root_container is not null;
 return found;
end $$;
create function public.social_begin_publish(j uuid,l uuid) returns boolean language sql security invoker set search_path='' as $$select app_private.social_begin_publish(j,l)$$;
create function app_private.social_post_lock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status='published' then raise exception 'Conteúdo publicado é imutável. Duplique para criar outro.';end if;
 if exists(select 1 from public.social_publications where post_id=old.id and status in ('queued','processing','publishing','uncertain','published'))
 and not (new.status='published' and row(new.title,new.format,new.briefing,new.caption,new.assets,new.scheduled_at)
 is not distinct from row(old.title,old.format,old.briefing,old.caption,old.assets,old.scheduled_at))
 then raise exception 'Cancele o agendamento antes de editar.';end if;
 return new;
end $$;
create trigger social_publication_lock before update on public.social_posts for each row execute function app_private.social_post_lock();
revoke all on function app_private.social_post_lock() from public,anon,authenticated;
do $$declare f record;begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','app_private') and p.proname in ('social_actor_allowed','social_credential','social_refresh_token','social_disconnect','social_enqueue','social_claim','social_begin_publish')
 loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
update storage.buckets set file_size_limit=1073741824 where id='social-assets';
-- Finish the queue item and editorial record in one transaction.
create function app_private.social_finish_publication(j uuid,l uuid,m text,p text) returns boolean language plpgsql security definer set search_path='' as $$
declare x public.social_publications%rowtype;
begin
 select * into x from public.social_publications where id=j and lock_token=l and status in ('processing','publishing','uncertain') for update;
 if not found then return false;end if;
 update public.social_publications set status='published',media_id=m,permalink=p,error=null,locked_until=null,updated_at=now() where id=j;
 update public.social_posts set status='published',publication_url=p where id=x.post_id and version=x.post_version;
 if not found then raise exception 'Versão editorial divergente.';end if;
 return true;
end $$;
create function public.social_finish_publication(j uuid,l uuid,m text,p text) returns boolean language sql security invoker set search_path='' as $$select app_private.social_finish_publication(j,l,m,p)$$;
revoke all on function app_private.social_finish_publication(uuid,uuid,text,text),public.social_finish_publication(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function app_private.social_finish_publication(uuid,uuid,text,text),public.social_finish_publication(uuid,uuid,text,text) to service_role;
-- Reauthorization cannot switch identities during the external publish boundary.
create function app_private.social_connection_lock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.instagram_id,new.connected_at) is distinct from row(old.instagram_id,old.connected_at)
 and exists(select 1 from public.social_publications where client_id=old.client_id and status in ('publishing','uncertain'))
 then raise exception 'Aguarde a confirmação da publicação antes de reconectar.';end if;
 return new;
end $$;
revoke all on function app_private.social_connection_lock() from public,anon,authenticated;
create trigger social_connection_lock before update on public.social_instagram_accounts for each row execute function app_private.social_connection_lock();
create index social_oauth_user_expiry on public.social_instagram_oauth(user_id,expires_at);
-- No existing drafts/approvals are scheduled. Only explicit enqueue creates work.
select cron.schedule('panel-social-publisher','* * * * *',$cmd$
 select net.http_post(url:='https://gorqyovidpdvuockzndm.supabase.co/functions/v1/social-publisher',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='panel_schedule_service_key')),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
$cmd$);
