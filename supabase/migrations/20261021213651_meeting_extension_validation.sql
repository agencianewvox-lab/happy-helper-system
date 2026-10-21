-- Fix PL/pgSQL record/table alias ambiguity found by transactional integration tests.
begin;
revoke all on sequence public.meeting_audit_id_seq from public,anon,authenticated;
create or replace function public.meeting_command(p_action text,p_payload jsonb default '{}',p_user uuid default null,p_session uuid default null,p_token_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; u uuid; master boolean; device uuid; g public.whatsapp_grupos; m public.client_meetings; d public.meeting_devices;
 c public.meeting_chunks; mid uuid; idx integer; task uuid; result jsonb; n integer; hash text;
begin
 a:=public.meeting_actor(p_user,p_session,p_token_hash);u:=(a->>'userId')::uuid;master:=(a->>'isMaster')::boolean;device:=(a->>'deviceId')::uuid;
 if device is not null then update public.meeting_devices set last_seen_at=now() where id=device;end if;
 if p_action='pair' then
  if device is not null then raise exception 'forbidden' using errcode='42501';end if;
  device:=(p_payload->>'deviceId')::uuid; hash:=p_payload->>'challenge';
  if hash is null or hash !~ '^[0-9a-f]{64}$' or coalesce(length(p_payload->>'label'),0) not between 1 and 100 then raise exception 'invalid_pair';end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select * into d from public.meeting_devices where id=device for update;
  if found and d.user_id<>u then raise exception 'forbidden' using errcode='42501';end if;
  if d.status='revoked' then raise exception 'device_revoked' using errcode='42501';end if;
  if not found and (select count(*) from public.meeting_devices where user_id=u)>=10 then raise exception 'quota_exceeded';end if;
  if exists(select 1 from public.meeting_device_sessions where token_hash=hash and device_id=device and user_id=u and auth_session_id=p_session and revoked_at is null and expires_at>now()) then
   return jsonb_build_object('status',d.status);end if;
  insert into public.meeting_devices(id,user_id,label,extension_version,status,approved_at,approved_by)
   values(device,u,p_payload->>'label',left(coalesce(p_payload->>'version','unknown'),30),case when master then 'approved' else 'pending' end,case when master then now() end,case when master then u end)
   on conflict(id) do update set label=excluded.label,extension_version=excluded.extension_version;
  update public.meeting_device_sessions set revoked_at=now() where device_id=device and revoked_at is null;
  insert into public.meeting_device_sessions(token_hash,device_id,user_id,auth_session_id,expires_at) values(hash,device,u,p_session,now()+interval '8 hours');
  insert into public.meeting_audit(actor_id,device_id,action) values(u,device,'session_authorized');
  return jsonb_build_object('status',(select status from public.meeting_devices where id=device),'expiresAt',now()+interval '8 hours');
 elsif p_action='device_update' then
  if not master or device is not null then raise exception 'forbidden' using errcode='42501';end if;
  if p_payload->>'status' not in ('approved','revoked') then raise exception 'invalid_status';end if;
  device:=(p_payload->>'deviceId')::uuid;
  update public.meeting_devices set status=p_payload->>'status',approved_at=now(),approved_by=u where id=device;
  if not found then raise exception 'invalid_id';end if;
  if p_payload->>'status'='revoked' then
   update public.meeting_device_sessions set revoked_at=now() where device_id=device;
   update public.client_meetings set status='interrupted',partial=true,ended_at=now(),error='device_revoked' where device_id=device and status in ('recording','paused');
  end if;
  insert into public.meeting_audit(actor_id,device_id,action) values(u,device,'device_'||(p_payload->>'status'));return '{"ok":true}';
 elsif p_action='logout' then
  if device is null then raise exception 'forbidden';end if;
  update public.meeting_device_sessions set revoked_at=now() where token_hash=p_token_hash;
  update public.client_meetings set status='interrupted',partial=true,ended_at=now(),error='session_expired' where device_id=device and status in ('recording','paused');
  insert into public.meeting_audit(actor_id,device_id,action) values(u,device,'session_ended');return '{"ok":true}';
 elsif p_action='bootstrap' then
  return jsonb_build_object('actor',a,
   'clients',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.nome) order by x.nome),'[]') from public.whatsapp_grupos x where x.archived_at is null and (master or x.manager_user_id=u)),
   'devices',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('user_name',p.full_name) order by x.created_at desc),'[]') from public.meeting_devices x join public.profiles p on p.user_id=x.user_id where master or x.user_id=u),
   'meetings',(select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]') from (
    select r.id,r.client_id,grp.nome client_name,r.title,r.owner_id,p.full_name owner_name,r.status,r.started_at,r.ended_at,r.partial,r.error,r.reviewed_at,r.version,
    (select count(*) from public.meeting_chunks z where z.meeting_id=r.id and z.status='done') transcribed_chunks,
    (select count(*) from public.meeting_chunks z where z.meeting_id=r.id) uploaded_chunks
    from public.client_meetings r join public.whatsapp_grupos grp on grp.id=r.client_id join public.profiles p on p.user_id=r.owner_id
    where (master or (grp.manager_user_id=u and grp.archived_at is null)) and (p_payload->>'clientId' is null or r.client_id=(p_payload->>'clientId')::uuid)
    order by r.started_at desc limit 100) x),
   'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select e.*,p.full_name actor_name from public.meeting_audit e left join public.profiles p on p.user_id=e.actor_id where master or e.actor_id=u order by e.created_at desc limit 100) x));
 elsif p_action='download' then
  if device is not null then raise exception 'forbidden';end if;
  insert into public.meeting_audit(actor_id,action) values(u,'extension_downloaded');return '{"ok":true}';
 elsif p_action='start' then
  if device is null or p_payload->>'consent' is distinct from 'true' then raise exception 'forbidden';end if;
  select * into g from public.whatsapp_grupos where id=(p_payload->>'clientId')::uuid and archived_at is null and (master or manager_user_id=u);
  if not found then raise exception 'wrong_client' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtext(device::text));
  mid:=(p_payload->>'requestId')::uuid;
  select * into m from public.client_meetings where id=mid;
  if found then
   if m.owner_id=u and m.device_id=device and m.client_id=g.id and m.meet_code=p_payload->>'meetCode' then return to_jsonb(m)||jsonb_build_object('client_name',g.nome);end if;
   raise exception 'forbidden';
  end if;
  if (select coalesce(sum(duration_ms),0) from public.meeting_chunks chunk_row join public.client_meetings r on r.id=chunk_row.meeting_id where r.owner_id=u and r.started_at>now()-interval '24 hours')>28800000
   or (select count(*) from public.client_meetings where owner_id=u and started_at>now()-interval '24 hours')>=40 then raise exception 'quota_exceeded';end if;
  insert into public.client_meetings(id,client_id,owner_id,device_id,title,meet_code) values(mid,g.id,u,device,p_payload->>'title',p_payload->>'meetCode') returning * into m;
  insert into public.meeting_audit(actor_id,device_id,meeting_id,action) values(u,device,m.id,'recording_started_consent_confirmed');
  return to_jsonb(m)||jsonb_build_object('client_name',g.nome);
 end if;
 mid:=(p_payload->>'meetingId')::uuid;
 select * into m from public.client_meetings where id=mid for update;
 if not found then raise exception 'wrong_client' using errcode='42501';end if;
 select * into g from public.whatsapp_grupos where id=m.client_id and (master or (manager_user_id=u and archived_at is null));
 if not found then raise exception 'wrong_client' using errcode='42501';end if;
 if p_action in ('heartbeat','reserve_chunk','commit_chunk','stop') and (m.owner_id<>u or (device is not null and m.device_id<>device) or g.archived_at is not null) then raise exception 'forbidden' using errcode='42501';end if;
 if p_action='detail' then
  insert into public.meeting_audit(actor_id,device_id,meeting_id,action) values(u,device,mid,'meeting_viewed');
  return to_jsonb(m)||jsonb_build_object('client_name',g.nome,'chunks',(select coalesce(jsonb_agg(jsonb_build_object('seq',seq,'offset_ms',offset_ms,'duration_ms',duration_ms,'status',status,'transcript',transcript,'error',error) order by seq),'[]') from public.meeting_chunks where meeting_id=mid),'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.meeting_tasks t where meeting_id=mid));
 elsif p_action='heartbeat' then
  if device is null or m.status not in ('recording','paused') then raise exception 'recording_closed';end if;
  if m.started_at<now()-interval '4 hours' then raise exception 'quota_exceeded';end if;
  update public.client_meetings set last_heartbeat_at=now(),status=case when p_payload->>'paused'='true' then 'paused' else 'recording' end where id=mid;
  return '{"ok":true}';
 elsif p_action='reserve_chunk' then
  if device is null or m.partial_finalized or m.status not in ('recording','paused','interrupted','finalizing') or m.started_at<now()-interval '24 hours' then raise exception 'recording_closed';end if;
  idx:=(p_payload->>'seq')::integer;
  if m.expected_chunks is not null and idx>=m.expected_chunks then raise exception 'invalid_chunk';end if;
  select * into c from public.meeting_chunks where meeting_id=mid and seq=idx;
  if found then
   if c.content_hash<>p_payload->>'contentHash' then raise exception 'chunk_conflict';end if;
   return jsonb_build_object('path',c.storage_path,'uploaded',c.status<>'uploading');
  end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  if (select coalesce(sum(z.duration_ms),0) from public.meeting_chunks z join public.client_meetings r on r.id=z.meeting_id where r.owner_id=u and z.created_at>now()-interval '24 hours')+(p_payload->>'durationMs')::integer>28800000 then raise exception 'quota_exceeded';end if;
  insert into public.meeting_chunks(meeting_id,seq,storage_path,content_hash,size_bytes,duration_ms,offset_ms)
   values(mid,idx,mid::text||'/'||idx::text||'.webm',p_payload->>'contentHash',(p_payload->>'sizeBytes')::integer,(p_payload->>'durationMs')::integer,(p_payload->>'offsetMs')::integer) returning * into c;
  return jsonb_build_object('path',c.storage_path,'uploaded',false);
 elsif p_action='commit_chunk' then
  if device is null or m.partial_finalized or m.status not in ('recording','paused','interrupted','finalizing') then raise exception 'recording_closed';end if;
  update public.meeting_chunks set status='pending' where meeting_id=mid and seq=(p_payload->>'seq')::integer and content_hash=p_payload->>'contentHash' and status='uploading';return '{"ok":true}';
 elsif p_action='stop' then
  n:=(p_payload->>'expectedChunks')::integer;
  if n is null or n not between 0 and 240 or exists(select 1 from public.meeting_chunks where meeting_id=mid and seq>=n) then raise exception 'invalid_chunk';end if;
  if m.status in ('ready','processing','failed') then return '{"ok":true}';end if;
  update public.client_meetings set expected_chunks=n,ended_at=coalesce(ended_at,now()),status=case when n=0 then 'failed' else 'finalizing' end,
   error=case when n=0 then 'no_audio' else null end,partial=partial or coalesce((p_payload->>'partial')::boolean,false) where id=mid;
  insert into public.meeting_audit(actor_id,device_id,meeting_id,action) values(u,device,mid,'recording_stopped');return '{"ok":true}';
 elsif p_action='review' then
  if device is not null or m.status<>'ready' then raise exception 'forbidden';end if;
  if m.version is distinct from (p_payload->>'version')::integer then raise exception 'version_conflict' using errcode='40001';end if;
  if coalesce(length(p_payload->>'notes'),0)>20000 then raise exception 'invalid_notes';end if;
  update public.client_meetings set review_notes=p_payload->>'notes',reviewed_at=now(),reviewed_by=u,version=version+1 where id=mid;
  insert into public.meeting_audit(actor_id,meeting_id,action) values(u,mid,'meeting_reviewed');return '{"ok":true}';
 elsif p_action='create_task' then
  if device is not null or m.reviewed_at is null or m.status<>'ready' then raise exception 'review_required';end if;
  idx:=(p_payload->>'index')::integer;
  if idx is null or idx<0 or idx>=jsonb_array_length(coalesce(m.summary->'actions','[]')) then raise exception 'invalid_task';end if;
  select task_id into task from public.meeting_tasks where meeting_id=mid and item_index=idx;
  if found then return jsonb_build_object('taskId',task);end if;
  if coalesce(length(p_payload->>'title'),0) not between 1 and 200 then raise exception 'invalid_title';end if;
  insert into public.tasks(title,description,assigned_to,group_id,priority,status,created_by)
   values(p_payload->>'title','Reunião: '||m.title||E'\nSugestão revisada: '||(m.summary->'actions'->>idx),a->>'name',g.group_id,'normal','pendente',a->>'name') returning id into task;
  insert into public.meeting_tasks values(mid,idx,task);
  insert into public.meeting_audit(actor_id,meeting_id,action) values(u,mid,'task_created');return jsonb_build_object('taskId',task);
 elsif p_action='finalize_partial' then
  if device is not null or m.status not in ('interrupted','failed') or p_payload->>'confirmed' is distinct from 'true' then raise exception 'forbidden';end if;
  if not exists(select 1 from public.meeting_chunks where meeting_id=mid and status='done') then raise exception 'incomplete_audio';end if;
  if exists(select 1 from public.meeting_chunks where meeting_id=mid and status in ('pending','processing')) then raise exception 'incomplete_audio';end if;
  update public.client_meetings set partial=true,partial_finalized=true,expected_chunks=(select coalesce(max(seq)+1,0) from public.meeting_chunks where meeting_id=mid),
   ended_at=coalesce(ended_at,now()),status='finalizing',error=null,summary_attempts=0 where id=mid;
  insert into public.meeting_audit(actor_id,meeting_id,action) values(u,mid,'partial_finalized');return '{"ok":true}';
 elsif p_action='retry' then
  if device is not null or m.status<>'failed' then raise exception 'forbidden';end if;
  if not exists(select 1 from public.meeting_chunks where meeting_id=mid) then raise exception 'no_audio';end if;
  if exists(select 1 from public.meeting_chunks where meeting_id=mid and status='failed' and audio_deleted_at is not null) then raise exception 'audio_expired';end if;
  update public.meeting_chunks set status='pending',attempts=0,error=null,lease_id=null,lease_at=null where meeting_id=mid and status='failed';
  update public.client_meetings set status='finalizing',summary_attempts=0,error=null,lease_id=null,lease_at=null where id=mid;
  insert into public.meeting_audit(actor_id,meeting_id,action) values(u,mid,'processing_retried');return '{"ok":true}';
 end if;
 raise exception 'invalid_action';
exception when unique_violation then raise exception 'active_meeting' using errcode='40001';
end $$;

commit;
