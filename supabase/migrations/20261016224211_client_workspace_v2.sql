-- Client workspace v2: explicit ownership, recoverable archive and encrypted credentials.
begin;
alter table public.whatsapp_grupos add column manager_user_id uuid references auth.users(id) on delete set null;
alter table public.whatsapp_grupos add column archived_at timestamptz;
alter table public.whatsapp_grupos add column archived_by uuid references auth.users(id) on delete set null;
create index whatsapp_grupos_manager_id_idx on public.whatsapp_grupos(manager_user_id) where archived_at is null;

-- Resolve the old display aliases only during the compatibility migration.
create function app_private.resolve_manager(candidate text) returns uuid
language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then (array_agg(p.user_id))[1] end
 from public.profiles p join auth.users u on u.id=p.user_id
 where p.role in ('admin','gestor') and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and lower(trim(candidate)) in (lower(trim(p.full_name)),case lower(trim(p.full_name))
 when 'murillo' then 'murilo araújo' when 'murilo' then 'murilo araújo'
 when 'netto' then 'netto monge' when 'neto' then 'netto monge'
 when 'priscilla' then 'priscilla borges' when 'priscila' then 'priscilla borges' else lower(trim(p.full_name)) end)
$$;
revoke all on function app_private.resolve_manager(text) from public,anon,authenticated;
update public.whatsapp_grupos set manager_user_id=app_private.resolve_manager(gestor_responsavel);

create or replace function app_private.can_access_group(candidate text) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.is_staff() and (app_private.is_master() or exists(
 select 1 from public.whatsapp_grupos g join public.profiles p on p.user_id=auth.uid()
 where g.group_id=candidate and g.archived_at is null and g.manager_user_id=auth.uid() and p.role='gestor'))
$$;
create or replace function app_private.social_access(target uuid, approval boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.is_staff() and exists(select 1 from public.whatsapp_grupos g where g.id=target and g.archived_at is null
 and (app_private.is_master() or (g.manager_user_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='gestor'))
 or exists(select 1 from public.social_members m where m.client_id=g.id and m.user_id=auth.uid() and (not approval or m.can_approve))))
$$;
create or replace function app_private.social_actor_allowed(c uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users a on a.id=p.user_id join public.whatsapp_grupos g on g.id=c
 where p.user_id=u and a.deleted_at is null and (a.banned_until is null or a.banned_until<now()) and g.archived_at is null
 and (p.is_master or p.role='admin' or (p.role='gestor' and g.manager_user_id=u)
 or exists(select 1 from public.social_members m where m.client_id=c and m.user_id=u and m.can_approve)))
$$;
create or replace function public.panel_report_sender_allowed(target_client uuid,target_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.whatsapp_grupos g join public.profiles p on p.user_id=target_user join auth.users u on u.id=p.user_id
 where g.id=target_client and g.archived_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
 and (p.is_master or p.role='admin' or (p.role='gestor' and g.manager_user_id=target_user)))
$$;

create table app_private.client_workspace (
 client_id uuid primary key references public.whatsapp_grupos(id),
 contract jsonb not null default '{}', contacts jsonb not null default '[]',
 version integer not null default 1, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
 check(jsonb_typeof(contract)='object'), check(jsonb_typeof(contacts)='array')
);
create table app_private.client_workspace_history (
 id bigint generated always as identity primary key, client_id uuid not null references public.whatsapp_grupos(id),
 version integer not null, contract jsonb not null, contacts jsonb not null,
 actor_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create index client_workspace_history_client_idx on app_private.client_workspace_history(client_id,created_at desc);
create table app_private.client_credentials (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.whatsapp_grupos(id),
 platform text not null, label text not null, url text not null default '',
 secret_id uuid not null references vault.secrets(id), version integer not null default 1,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create index client_credentials_client_idx on app_private.client_credentials(client_id);
create table app_private.client_access_audit (
 id bigint generated always as identity primary key, client_id uuid not null references public.whatsapp_grupos(id),
 credential_id uuid, actor_id uuid references auth.users(id), action text not null, created_at timestamptz not null default now()
);
create index client_access_audit_client_idx on app_private.client_access_audit(client_id,created_at desc);
alter table app_private.client_workspace enable row level security;
alter table app_private.client_workspace_history enable row level security;
alter table app_private.client_credentials enable row level security;
alter table app_private.client_access_audit enable row level security;
revoke all on app_private.client_workspace, app_private.client_workspace_history, app_private.client_credentials, app_private.client_access_audit from public,anon,authenticated;

insert into app_private.client_workspace(client_id,contract,contacts)
 select id,jsonb_build_object('title',coalesce(plano,''),'description','','deliverables','[]'::jsonb,'startDate',coalesce(data_entrada::text,''),'limits','','notes',''),
 (case when nullif(trim(responsavel_master),'') is not null then jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team','client','name',responsavel_master,'role','Responsável principal','responsibility','','phone','','primary',true)) else '[]'::jsonb end)
 || (case when nullif(trim(responsavel_socio),'') is not null then jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team','client','name',responsavel_socio,'role','Sócio / supervisor','responsibility','','phone','','primary',false)) else '[]'::jsonb end)
 from public.whatsapp_grupos;
insert into app_private.client_workspace_history(client_id,version,contract,contacts)
 select client_id,version,contract,contacts from app_private.client_workspace;

-- Transactional migration: never clear plaintext unless the encrypted round trip matches.
do $$ declare g record; sid uuid; payload text; begin
 for g in select id,acessos_cliente from public.whatsapp_grupos where nullif(trim(acessos_cliente),'') is not null loop
   payload:=jsonb_build_object('login','','password','','notes',g.acessos_cliente)::text;
   sid:=vault.create_secret(payload,'client_access_legacy_'||g.id::text,'Protected legacy client access');
   if (select decrypted_secret from vault.decrypted_secrets where id=sid) is distinct from payload then raise exception 'Credential migration verification failed'; end if;
   insert into app_private.client_credentials(client_id,platform,label,secret_id) values(g.id,'other','Acesso legado — revisar',sid);
   insert into app_private.client_access_audit(client_id,action) values(g.id,'legacy_migrated_verified');
 end loop;
 update public.whatsapp_grupos set acessos_cliente=null;
end $$;
alter table public.whatsapp_grupos add constraint client_access_no_plaintext check(acessos_cliente is null);
revoke delete on public.whatsapp_grupos from authenticated;

create or replace function app_private.guard_group_assignment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if new.acessos_cliente is not null then raise exception 'Use o cofre de acessos.' using errcode='42501';end if;
 if not app_private.is_master() then
   if TG_OP='INSERT' then
     new.manager_user_id:=auth.uid(); new.gestor_responsavel:=app_private.staff_name();
     if new.ad_account_id is not null or new.archived_at is not null then raise exception 'Operação exclusiva do Master.' using errcode='42501';end if;
   elsif new.id is distinct from old.id or new.group_id is distinct from old.group_id or new.manager_user_id is distinct from old.manager_user_id
   or new.gestor_responsavel is distinct from old.gestor_responsavel or new.ad_account_id is distinct from old.ad_account_id
   or new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by or new.plano is distinct from old.plano then
     raise exception 'Use a ficha protegida. Atribuições e contratado são exclusivos do Master.' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
drop policy create_assigned_clients on public.whatsapp_grupos;
create policy create_assigned_clients on public.whatsapp_grupos for insert to authenticated with check (
 (select app_private.is_staff()) and manager_user_id=(select auth.uid()) and exists(select 1 from public.profiles where user_id=(select auth.uid()) and role='gestor'));

create function app_private.client_workspace_api(action text, client uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.whatsapp_grupos; w app_private.client_workspace; cred app_private.client_credentials;
 master boolean:=app_private.is_master(); editor boolean; sid uuid; response jsonb; item jsonb; new_contract jsonb; new_contacts jsonb; uid uuid;
begin
 if not app_private.is_staff() then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>65536 then raise exception 'Dados inválidos ou muito extensos.';end if;
 if action='archives' then
   if not master then raise exception 'Área exclusiva do Master.' using errcode='42501';end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',nome,'archivedAt',archived_at) order by nome) from public.whatsapp_grupos where archived_at is not null),'[]');
 end if;
 select * into g from public.whatsapp_grupos where id=client;
 if g.id is null or not (master or app_private.social_access(client,false)) then raise exception 'Cliente não autorizado.' using errcode='42501';end if;
 editor:=master or (g.manager_user_id=auth.uid() and exists(select 1 from public.profiles where user_id=auth.uid() and role='gestor'));
 if action in ('archive','restore','assign') then
   if not master then raise exception 'Área exclusiva do Master.' using errcode='42501';end if;
   if action='assign' then
     uid:=nullif(payload->>'userId','')::uuid;
     if uid is not null and not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id where p.user_id=uid and p.role in ('admin','gestor') and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())) then raise exception 'Gestor indisponível.';end if;
     update public.whatsapp_grupos set manager_user_id=uid,gestor_responsavel=(select full_name from public.profiles where user_id=uid) where id=client;
   else
     update public.whatsapp_grupos set archived_at=case when action='archive' then now() end, archived_by=case when action='archive' then auth.uid() end where id=client;
     update public.report_runs set status='skipped',error='Cliente arquivado. Nenhum envio iniciado.',finished_at=now() where client_id=client and status='queued' and action='archive';
   end if;
   insert into app_private.client_access_audit(client_id,actor_id,action) values(client,auth.uid(),action);
   return jsonb_build_object('ok',true);
 end if;
 if g.archived_at is not null and action<>'read' then raise exception 'Restaure o cliente antes de editar.';end if;
 insert into app_private.client_workspace(client_id,contract) values(client,jsonb_build_object('title',coalesce(g.plano,''),'deliverables','[]'::jsonb)) on conflict do nothing;
 select * into w from app_private.client_workspace where client_id=client for update;
 if action='read' then
   return jsonb_build_object('clientId',client,'name',g.nome,'managerId',g.manager_user_id,'legacyManager',g.gestor_responsavel,
   'contract',w.contract,'contacts',w.contacts,'version',w.version,'updatedAt',w.updated_at,'updatedBy',(select full_name from public.profiles where user_id=w.updated_by),
   'canEditContract',master,'canEdit',editor,'archivedAt',g.archived_at,
   'credentials',coalesce((select jsonb_agg(jsonb_build_object('id',id,'platform',platform,'label',label,'url',url,'version',version,'updatedAt',updated_at) order by label) from app_private.client_credentials where client_id=client),'[]'),
   'history',coalesce((select jsonb_agg(to_jsonb(h)) from (select v.version,v.contract,v.contacts,v.created_at as "createdAt",p.full_name as "author" from app_private.client_workspace_history v left join public.profiles p on p.user_id=v.actor_id where v.client_id=client order by v.version desc limit 20) h),'[]'),
   'audit',case when master then coalesce((select jsonb_agg(to_jsonb(a)) from (select v.action,v.created_at as "createdAt",p.full_name as "author" from app_private.client_access_audit v left join public.profiles p on p.user_id=v.actor_id where v.client_id=client order by v.created_at desc limit 30) a),'[]') else '[]'::jsonb end);
 elsif action in ('contract','contacts') then
   if (action='contract' and not master) or not editor then raise exception 'Sem permissão para editar.' using errcode='42501';end if;
   if coalesce((payload->>'version')::integer,0)<>w.version then raise exception 'Outra pessoa atualizou esta ficha. Recarregue antes de salvar.' using errcode='40001';end if;
   new_contract:=w.contract; new_contacts:=w.contacts;
   if action='contract' then
     new_contract:=payload->'contract';
     if jsonb_typeof(new_contract) is distinct from 'object' or length(coalesce(new_contract->>'title',''))>200 or jsonb_typeof(new_contract->'deliverables') is distinct from 'array' or jsonb_array_length(new_contract->'deliverables')>100 then raise exception 'Contrato inválido.';end if;
     for item in select value from jsonb_array_elements(new_contract->'deliverables') loop
       if jsonb_typeof(item) is distinct from 'object' or nullif(trim(item->>'name'),'') is null then raise exception 'Informe o nome de cada entregável.';end if;
     end loop;
     update public.whatsapp_grupos set plano=nullif(new_contract->>'title','') where id=client;
   else
     new_contacts:=payload->'contacts';
     if jsonb_typeof(new_contacts) is distinct from 'array' or jsonb_array_length(new_contacts)>100 then raise exception 'Contatos inválidos.';end if;
     for item in select value from jsonb_array_elements(new_contacts) loop
       if jsonb_typeof(item) is distinct from 'object' or nullif(trim(item->>'name'),'') is null or coalesce(item->>'team','') not in ('agency','client') then raise exception 'Informe nome e equipe de cada responsável.';end if;
     end loop;
   end if;
   update app_private.client_workspace set contract=new_contract,contacts=new_contacts,version=version+1,updated_by=auth.uid(),updated_at=now() where client_id=client returning * into w;
   insert into app_private.client_workspace_history(client_id,version,contract,contacts,actor_id) values(client,w.version,w.contract,w.contacts,auth.uid());
   return jsonb_build_object('ok',true,'version',w.version);
 elsif action in ('credential_save','credential_delete','reveal','copy') then
   if action in ('credential_save','credential_delete') and not editor then raise exception 'Sem permissão para editar acessos.' using errcode='42501';end if;
   if nullif(payload->>'id','') is not null then
     select * into cred from app_private.client_credentials where id=(payload->>'id')::uuid and client_id=client for update;
     if cred.id is null then raise exception 'Acesso não encontrado.';end if;
   end if;
   if action in ('reveal','copy') then
     if cred.id is null then raise exception 'Selecione o acesso.';end if;
     select decrypted_secret::jsonb into response from vault.decrypted_secrets where id=cred.secret_id;
     if response is null then raise exception 'Não foi possível recuperar o acesso.';end if;
     insert into app_private.client_access_audit(client_id,credential_id,actor_id,action) values(client,cred.id,auth.uid(),action);
     return response;
   end if;
   if cred.id is not null and coalesce((payload->>'version')::integer,0)<>cred.version then raise exception 'Acesso alterado por outra pessoa. Recarregue.' using errcode='40001';end if;
   if action='credential_delete' then
     if cred.id is null then raise exception 'Selecione o acesso.';end if;
     delete from app_private.client_credentials where id=cred.id;
     delete from vault.secrets where id=cred.secret_id;
   else
     if length(trim(coalesce(payload->>'label',''))) not between 1 and 200 or length(coalesce(payload->>'platform','')) not between 1 and 60 then raise exception 'Informe a plataforma e a identificação.';end if;
     if coalesce(payload->>'url','')<>'' and not (payload->>'url' ~ '^https?://[^[:space:]]+$') then raise exception 'Use um endereço http ou https válido.';end if;
     response:=jsonb_build_object('login',coalesce(payload->>'login',''),'password',coalesce(payload->>'password',''),'notes',coalesce(payload->>'notes',''));
     if cred.id is null then
       sid:=vault.create_secret(response::text);
       insert into app_private.client_credentials(client_id,platform,label,url,secret_id,updated_by) values(client,payload->>'platform',trim(payload->>'label'),coalesce(payload->>'url',''),sid,auth.uid()) returning * into cred;
     else
       perform vault.update_secret(cred.secret_id,response::text);
       update app_private.client_credentials set platform=payload->>'platform',label=trim(payload->>'label'),url=coalesce(payload->>'url',''),version=version+1,updated_at=now(),updated_by=auth.uid() where id=cred.id;
     end if;
   end if;
   insert into app_private.client_access_audit(client_id,credential_id,actor_id,action) values(client,cred.id,auth.uid(),action);
   return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação desconhecida.';
end $$;
revoke all on function app_private.client_workspace_api(text,uuid,jsonb) from public,anon;
grant execute on function app_private.client_workspace_api(text,uuid,jsonb) to authenticated;
create function public.client_workspace_api(action text, client uuid default null, payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select app_private.client_workspace_api(action,client,payload)$$;
revoke all on function public.client_workspace_api(text,uuid,jsonb) from public,anon;
grant execute on function public.client_workspace_api(text,uuid,jsonb) to authenticated;
-- Keep enabled/paused exactly as stored; the semantic revision requires a new reviewed preview.
alter table public.report_configs add column review_required boolean not null default true;
alter table public.report_configs add column last_evaluated_at timestamptz not null default now();
alter table public.report_connections add column last_checked_at timestamptz;
alter table public.report_connections add column last_error text;
alter table public.report_runs drop constraint report_runs_status_check;
alter table public.report_runs add constraint report_runs_status_check check(status in ('queued','processing','sending','accepted','failed','uncertain','skipped','expired'));
alter table public.report_runs add column attempts integer not null default 0;
alter table public.report_runs add column expires_at timestamptz not null default (now()+interval '15 minutes');
alter table public.report_runs add column dispatch_started_at timestamptz;
alter table public.report_runs add column lease_token uuid;
create function public.claim_panel_report_runs_v2(target_run uuid default null,batch_size integer default 2)
returns setof public.report_runs language sql security invoker set search_path='' as $$
 update public.report_runs set status='processing',started_at=now(),attempts=attempts+1,lease_token=gen_random_uuid()
 where id in(select id from public.report_runs where status='queued' and available_at<=now() and expires_at>now()
 and (target_run is null or id=target_run) order by available_at for update skip locked limit least(greatest(batch_size,1),3)) returning *
$$;
revoke all on function public.claim_panel_report_runs_v2(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_panel_report_runs_v2(uuid,integer) to service_role;
create function public.authorize_panel_report_dispatch(target_run uuid, expected_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.report_runs; g public.whatsapp_grupos; c public.report_configs; s public.report_sources;
begin
 select * into r from public.report_runs where id=target_run for update;
 if r.id is null or r.status<>'processing' or r.expires_at<=now() or r.lease_token is distinct from expected_lease then return false;end if;
 select * into g from public.whatsapp_grupos where id=r.client_id for share;
 select * into c from public.report_configs where client_id=r.client_id for share;
 select * into s from public.report_sources where client_id=r.client_id for share;
 if not public.panel_report_sender_allowed(r.client_id,r.owner_user_id) or g.archived_at is not null
 or g.group_id is distinct from r.snapshot->>'groupId' or g.ad_account_id is distinct from r.snapshot->>'account'
 or (coalesce(r.snapshot->'settings'->>'dataMode','crm_meta')<>'meta' and (s.version is null or s.version is distinct from (r.snapshot->'source'->>'version')::integer))
 or (coalesce((r.snapshot->>'manual')::boolean,false)=false and (c.client_id is null or not c.enabled or c.review_required or c.version is distinct from (r.snapshot->>'configVersion')::integer))
 or not exists(select 1 from public.report_connections where user_id=r.owner_user_id and status='open' and last_checked_at>now()-interval '2 minutes')
 then return false;end if;
 update public.report_runs set status='sending',dispatch_started_at=now() where id=r.id and status='processing';
 return found;
end $$;
revoke all on function public.authorize_panel_report_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_panel_report_dispatch(uuid,uuid) to service_role;
-- Archive also invalidates review, so restoring a client cannot resume an old agenda silently.
create function app_private.archive_report_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.archived_at is distinct from old.archived_at then
 update public.report_configs set review_required=true,preview_hash=null where client_id=new.id;
 end if;
 return new;
end $$;
revoke all on function app_private.archive_report_review() from public,anon,authenticated;
create trigger archive_report_review after update of archived_at on public.whatsapp_grupos for each row execute function app_private.archive_report_review();
commit;
