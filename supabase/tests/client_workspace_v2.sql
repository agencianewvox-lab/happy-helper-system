-- Integration smoke test. All mutations, including Vault writes, are rolled back.
begin;
do $test$
declare master_id uuid; manager_id uuid; social_id uuid; c uuid; other_client uuid;
 w jsonb; response jsonb; credential uuid; original_count bigint;
begin
 select user_id into master_id from public.profiles where is_master or role='admin' limit 1;
 select manager_user_id,id into manager_id,c from public.whatsapp_grupos where manager_user_id is not null and archived_at is null limit 1;
 select id into other_client from public.whatsapp_grupos where manager_user_id is distinct from manager_id and archived_at is null limit 1;
 select user_id into social_id from public.profiles where role='social_media' limit 1;
 if master_id is null or manager_id is null or c is null or other_client is null or social_id is null then raise exception 'Missing fixtures';end if;
 perform set_config('request.jwt.claim.sub',master_id::text,true);
 w:=public.client_workspace_api('read',c);
 if not (w->>'canEditContract')::boolean then raise exception 'Master contract permission failed';end if;
 if (w->'credentials')::text ~ '"(password|login|secret_id|notes)"' then raise exception 'Credential metadata leaked';end if;
 perform public.client_workspace_api('contract',c,jsonb_build_object('version',w->'version','contract',(w->'contract')||'{"description":"TRANSACTIONAL TEST"}'::jsonb));
 begin
   perform public.client_workspace_api('contract',c,jsonb_build_object('version',w->'version','contract',w->'contract'));
   raise exception 'Stale version accepted';
 exception when serialization_failure then null; end;
 perform public.client_workspace_api('credential_save',c,'{"platform":"other","label":"TRANSACTIONAL TEST","login":"fake-login","password":"fake-secret","notes":"fake-note"}');
 select id into credential from app_private.client_credentials where client_id=c and label='TRANSACTIONAL TEST';
 response:=public.client_workspace_api('reveal',c,jsonb_build_object('id',credential));
 if response->>'password' <> 'fake-secret' then raise exception 'Vault encryption round-trip failed';end if;
 if not exists(select 1 from app_private.client_access_audit where credential_id=credential and action='reveal' and actor_id=master_id) then raise exception 'Audit missing';end if;
 perform public.client_workspace_api('archive',c);
 if not exists(select 1 from public.whatsapp_grupos where id=c and archived_at is not null) then raise exception 'Archive failed';end if;
 if public.panel_report_sender_allowed(c,master_id) then raise exception 'Archived sender accepted';end if;
 perform public.client_workspace_api('restore',c);
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 w:=public.client_workspace_api('read',c);
 if (w->>'canEditContract')::boolean or not (w->>'canEdit')::boolean then raise exception 'Manager permission mismatch';end if;
 begin
   perform public.client_workspace_api('read',other_client);raise exception 'Cross-client access accepted';
 exception when insufficient_privilege then null;end;
 begin
   perform public.client_workspace_api('contract',c,jsonb_build_object('version',w->'version','contract',w->'contract'));raise exception 'Manager edited contract';
 exception when insufficient_privilege then null;end;
 begin
   perform public.client_workspace_api('archive',c);raise exception 'Manager archived client';
 exception when insufficient_privilege then null;end;
 -- Social role may read an explicitly assigned operational workspace, not conversations.
 insert into public.social_members(client_id,user_id,can_approve) values(c,social_id,false) on conflict(client_id,user_id) do nothing;
 perform set_config('request.jwt.claim.sub',social_id::text,true);
 w:=public.client_workspace_api('read',c);
 if (w->>'canEdit')::boolean or (w->>'canEditContract')::boolean then raise exception 'Social edit privilege';end if;
 if app_private.can_access_group((select group_id from public.whatsapp_grupos where id=c)) then raise exception 'Social granted commercial access';end if;
 response:=public.client_workspace_api('reveal',c,jsonb_build_object('id',credential));
 if response->>'password'<>'fake-secret' then raise exception 'Assigned social read failed';end if;
 begin
   perform public.client_workspace_api('credential_delete',c,jsonb_build_object('id',credential,'version',1));raise exception 'Social deleted credential';
 exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','app_private.client_credentials','select') or has_table_privilege('authenticated','public.whatsapp_grupos','delete') then raise exception 'Direct protected access granted';end if;
 if has_function_privilege('authenticated','public.claim_panel_report_runs_v2(uuid,integer)','execute') or has_function_privilege('anon','public.client_workspace_api(text,uuid,jsonb)','execute') then raise exception 'Sensitive RPC exposed';end if;
 raise notice 'PASS: roles, isolation, encrypted round-trip, audit, version conflict, archive and restoration';
end $test$;
rollback;
select 'PASS: all test changes rolled back' as result;
