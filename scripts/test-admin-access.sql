-- Synthetic fixtures only. Rollback leaves no account, role or client changes.
begin;
do $$
declare owner uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); mgr uuid:=gen_random_uuid(); social uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); gid uuid:=gen_random_uuid();
begin
 insert into auth.users(id) values(owner),(adm),(mgr),(social);
 insert into public.profiles(user_id,full_name,role,is_master) values(owner,'__ADM_TEST_OWNER','admin',true),(adm,'__ADM_TEST_ADMIN','admin',false),(mgr,'__ADM_TEST_MANAGER','gestor',false),(social,'__ADM_TEST_SOCIAL','social_media',false);
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,owner,now(),now());
 insert into public.whatsapp_grupos(id,group_id,nome,manager_user_id) values(gid,'__adm_test_'||gid,'__ADM_TEST_CLIENT',mgr);
 perform set_config('test.owner',owner::text,true);perform set_config('test.adm',adm::text,true);perform set_config('test.mgr',mgr::text,true);perform set_config('test.social',social::text,true);perform set_config('test.sid',sid::text,true);perform set_config('test.gid',gid::text,true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.adm'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare n integer; pid uuid;
begin
 assert app_private.is_master();assert not app_private.is_owner();
 assert app_private.can_access_group('__adm_test_'||current_setting('test.gid'));
 assert exists(select 1 from public.whatsapp_grupos where id=current_setting('test.gid')::uuid);
 update public.profiles set is_master=true where user_id=current_setting('test.adm')::uuid;
 get diagnostics n=row_count;assert n=0,'ADM self-promoted';
 select id into pid from public.profiles where user_id=current_setting('test.mgr')::uuid;
 begin perform public.set_team_role(pid,'admin','gestor');raise exception 'ADM changed roles';exception when insufficient_privilege then null;end;
end; $$;
set local role postgres;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated','session_id',current_setting('test.sid'))::text,true);
set local role authenticated;
do $$
declare pid uuid; owner_pid uuid;
begin
 assert app_private.is_owner();
 select id into pid from public.profiles where user_id=current_setting('test.mgr')::uuid;
 select id into owner_pid from public.profiles where user_id=current_setting('test.owner')::uuid;
 perform public.set_team_role(pid,'admin','gestor');
 assert exists(select 1 from public.profiles where id=pid and role='admin' and not is_master);
 begin perform public.set_team_role(pid,'social_media','gestor');raise exception 'lost concurrent change';exception when serialization_failure then null;end;
 begin perform public.set_team_role(owner_pid,'gestor','admin');raise exception 'owner demoted';exception when insufficient_privilege then null;end;
 perform public.set_team_role(pid,'gestor','admin');
end; $$;
set local role postgres;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.social'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin assert not app_private.is_master();assert not app_private.is_owner();assert not app_private.can_access_group('__adm_test_'||current_setting('test.gid'));end;$$;
set local role postgres;
do $$begin
 assert not has_function_privilege('anon','public.set_team_role(uuid,text,text)','execute');
 assert not has_table_privilege('authenticated','app_private.team_access_audit','select');
 assert (select count(*) from app_private.team_access_audit where target_user_id=current_setting('test.mgr')::uuid and old_role is not null)=2;
end;$$;
rollback;
select 'PASS: ADM portfolio, owner-only provisioning, RLS anti-escalation, concurrency and audit' as result;
