begin;
-- Additive release: old recordings/extension remain compatible. Voxi is not involved.
alter table public.client_meetings add column description text not null default '' check(length(description)<=10000);
alter table public.client_meetings add column deleted_at timestamptz;
alter table public.client_meetings add column deleted_by uuid references auth.users(id);
create index client_meetings_deleted_by_idx on public.client_meetings(deleted_by) where deleted_by is not null;
create table public.meeting_utterances (
 meeting_id uuid not null references public.client_meetings(id), id uuid not null,
 speaker text not null check(length(speaker) between 1 and 160),
 text text not null check(length(text) between 1 and 4000),
 start_ms integer not null check(start_ms between 0 and 14400000),
 end_ms integer not null check(end_ms between start_ms and 14400000),
 revision integer not null check(revision between 1 and 100000),
 source text not null default 'meet_captions' check(source='meet_captions'),
 updated_at timestamptz not null default now(), primary key(meeting_id,id)
);
create index meeting_utterances_timeline_idx on public.meeting_utterances(meeting_id,start_ms,id);
alter table public.meeting_utterances enable row level security;
revoke all on public.meeting_utterances from public,anon,authenticated;
grant all on public.meeting_utterances to service_role;

create function public.meeting_command_v2(p_action text,p_payload jsonb default '{}',p_user uuid default null,p_session uuid default null,p_token_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; u uuid; master boolean; device uuid; m public.client_meetings; g public.whatsapp_grupos;
 result jsonb; row jsonb; previous public.meeting_utterances; mid uuid; cue uuid;
begin
 a:=public.meeting_actor(p_user,p_session,p_token_hash);
 u:=(a->>'userId')::uuid;master:=(a->>'isMaster')::boolean;device:=(a->>'deviceId')::uuid;
 if p_action='bootstrap' then
  result:=public.meeting_command(p_action,p_payload,p_user,p_session,p_token_hash);
  -- Extension receives only its authorized client list, never another user's recordings.
  if device is not null then return jsonb_build_object('actor',a,'clients',result->'clients');end if;
  return result || jsonb_build_object('meetings',(
   select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]') from (
    select r.id,r.client_id,grp.nome client_name,r.title,r.owner_id,p.full_name owner_name,r.status,r.started_at,r.ended_at,r.partial,r.error,r.reviewed_at,r.version,r.deleted_at,
     (select count(*) from public.meeting_chunks z where z.meeting_id=r.id and z.status='done') transcribed_chunks,
     (select count(*) from public.meeting_chunks z where z.meeting_id=r.id) uploaded_chunks,
     (select count(*) from public.meeting_utterances z where z.meeting_id=r.id) utterance_count
    from public.client_meetings r join public.whatsapp_grupos grp on grp.id=r.client_id join public.profiles p on p.user_id=r.owner_id
    where (master or (grp.manager_user_id=u and grp.archived_at is null))
     and (p_payload->>'clientId' is null or r.client_id=(p_payload->>'clientId')::uuid)
     and ((p_payload->>'trash'='true' and r.deleted_at is not null) or (coalesce(p_payload->>'trash','false')<>'true' and r.deleted_at is null))
    order by r.started_at desc limit 100) x));
 end if;
 if p_action in ('pair','device_update','logout','download','start') then
  return public.meeting_command(p_action,p_payload,p_user,p_session,p_token_hash);
 end if;
 mid:=(p_payload->>'meetingId')::uuid;
 select * into m from public.client_meetings where id=mid for update;
 if not found then raise exception 'wrong_client' using errcode='42501';end if;
 select * into g from public.whatsapp_grupos where id=m.client_id and (master or (manager_user_id=u and archived_at is null));
 if not found or (device is not null and (m.owner_id<>u or m.device_id<>device or g.archived_at is not null)) then raise exception 'wrong_client' using errcode='42501';end if;
 if m.deleted_at is not null and p_action not in ('restore','detail','live_detail') then raise exception 'meeting_deleted';end if;
 if p_action in ('detail','live_detail') then
  if p_action='detail' then
   insert into public.meeting_audit(actor_id,device_id,meeting_id,action) values(u,device,mid,'meeting_viewed');
  end if;
  return to_jsonb(m)||jsonb_build_object('client_name',g.nome,
   'utterances',(select coalesce(jsonb_agg(to_jsonb(t) order by t.start_ms,t.id),'[]') from public.meeting_utterances t where t.meeting_id=mid),
   'chunks',(select coalesce(jsonb_agg(jsonb_build_object('seq',seq,'offset_ms',offset_ms,'duration_ms',duration_ms,'status',status,'transcript',transcript,'error',error) order by seq),'[]') from public.meeting_chunks where meeting_id=mid),
   'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.meeting_tasks t where meeting_id=mid));
 elsif p_action='captions' then
  if device is null or m.partial_finalized or m.status not in ('recording','paused','interrupted','finalizing') or m.started_at<now()-interval '24 hours' then raise exception 'recording_closed';end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 10 then raise exception 'invalid_captions';end if;
  for row in select value from jsonb_array_elements(p_payload->'items') loop
   cue:=(row->>'id')::uuid;
   if cue is null or coalesce(length(trim(row->>'speaker')),0) not between 1 and 160 or coalesce(length(trim(row->>'text')),0) not between 1 and 4000
    or (row->>'endMs')::integer > least(14400000,extract(epoch from (coalesce(m.ended_at,now())-m.started_at))*1000+15000) then raise exception 'invalid_captions';end if;
   select * into previous from public.meeting_utterances where meeting_id=mid and id=cue;
   if found and (previous.speaker<>row->>'speaker' or previous.start_ms<>(row->>'startMs')::integer) then raise exception 'caption_conflict';end if;
   insert into public.meeting_utterances(meeting_id,id,speaker,text,start_ms,end_ms,revision)
    values(mid,cue,row->>'speaker',row->>'text',(row->>'startMs')::integer,(row->>'endMs')::integer,(row->>'revision')::integer)
    on conflict(meeting_id,id) do update set text=excluded.text,end_ms=greatest(meeting_utterances.end_ms,excluded.end_ms),revision=excluded.revision,updated_at=now()
     where excluded.revision>meeting_utterances.revision;
  end loop;
  if (select count(*)>5000 or sum(length(text))>1000000 from public.meeting_utterances where meeting_id=mid) then raise exception 'quota_exceeded';end if;
  update public.meeting_devices set last_seen_at=now() where id=device;
  return '{"ok":true}';
 elsif p_action in ('edit','trash','restore') then
  if device is not null then raise exception 'forbidden' using errcode='42501';end if;
  if m.version is distinct from (p_payload->>'version')::integer then raise exception 'version_conflict' using errcode='40001';end if;
  if p_action='edit' then
   if coalesce(length(trim(p_payload->>'title')),0) not between 1 and 160 or coalesce(length(p_payload->>'description'),0)>10000 then raise exception 'invalid_title';end if;
   update public.client_meetings set title=trim(p_payload->>'title'),description=coalesce(p_payload->>'description',''),version=version+1 where id=mid;
  else
   if p_payload->>'confirmed' is distinct from 'true' then raise exception 'confirmation_required';end if;
   if p_action='trash' and (m.status not in ('ready','failed','interrupted') or exists(select 1 from public.meeting_chunks where meeting_id=mid and status in ('pending','processing','uploading'))) then raise exception 'meeting_busy';end if;
   update public.client_meetings set deleted_at=case when p_action='trash' then now() end,deleted_by=case when p_action='trash' then u end,version=version+1 where id=mid;
  end if;
  insert into public.meeting_audit(actor_id,meeting_id,action) values(u,mid,case p_action when 'trash' then 'meeting_trashed' when 'restore' then 'meeting_restored' else 'meeting_edited' end);
  return '{"ok":true}';
 end if;
 return public.meeting_command(p_action,p_payload,p_user,p_session,p_token_hash);
end $$;
revoke all on function public.meeting_command_v2(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.meeting_command_v2(text,jsonb,uuid,uuid,text) to service_role;
commit;
