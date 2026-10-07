-- Independent project: explicit privileges, staff scopes and public write-only forms.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, anon, service_role;

-- These narrow lookups deliberately bypass RLS to avoid recursive profile/group policies.
create or replace function app_private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
   select 1 from public.profiles p join auth.users u on u.id = p.user_id
   where p.user_id = auth.uid() and u.deleted_at is null
     and (u.banned_until is null or u.banned_until <= now())
 );
$$;
create or replace function app_private.is_master() returns boolean
language sql stable security definer set search_path = '' as $$
 select app_private.is_staff() and exists (
   select 1 from public.profiles where user_id = auth.uid() and (is_master or role = 'admin')
 );
$$;
create or replace function app_private.staff_name() returns text
language sql stable security definer set search_path = '' as $$
 select case lower(trim(full_name))
   when 'murillo' then 'Murilo Araújo' when 'murilo' then 'Murilo Araújo'
   when 'netto' then 'Netto Monge' when 'neto' then 'Netto Monge'
   when 'priscilla' then 'Priscilla Borges'
   else full_name end
 from public.profiles where user_id = auth.uid() and app_private.is_staff();
$$;
create or replace function app_private.is_self_name(candidate text) returns boolean
language sql stable security definer set search_path = '' as $$
 select app_private.is_staff() and exists (
   select 1 from public.profiles where user_id = auth.uid()
   and lower(trim(candidate)) in (lower(trim(full_name)), lower(app_private.staff_name()))
 );
$$;
create or replace function app_private.can_access_group(candidate text) returns boolean
language sql stable security definer set search_path = '' as $$
 select app_private.is_staff() and (
   app_private.is_master() or exists (
     select 1 from public.whatsapp_grupos g
     where g.group_id = candidate and app_private.is_self_name(g.gestor_responsavel)
   )
 );
$$;

-- Public links are submission capabilities, never a directory of clients or responses.
-- This lookup intentionally returns only existence and is not exposed as a REST RPC.
create or replace function app_private.is_form_group(candidate text) returns boolean
language sql stable security definer set search_path = '' as $$
 select candidate is not null and exists (
   select 1 from public.whatsapp_grupos where group_id = candidate
 );
$$;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.is_staff(), app_private.is_master(),
 app_private.staff_name(), app_private.is_self_name(text), app_private.can_access_group(text) to authenticated;
grant execute on function app_private.is_form_group(text) to anon, authenticated;

create or replace function app_private.guard_group_assignment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
 if not app_private.is_master() then
   if TG_OP = 'INSERT' then
     if new.gestor_responsavel is null then new.gestor_responsavel := app_private.staff_name(); end if;
     if not app_private.is_self_name(new.gestor_responsavel) or new.ad_account_id is not null then
       raise exception 'Somente o Master pode atribuir outro gestor ou vincular contas de anúncios.' using errcode = '42501';
     end if;
   elsif new.id is distinct from old.id or new.group_id is distinct from old.group_id
      or new.gestor_responsavel is distinct from old.gestor_responsavel
      or new.ad_account_id is distinct from old.ad_account_id then
     raise exception 'Somente o Master pode alterar o vínculo do cliente, gestor ou conta de anúncios.' using errcode = '42501';
   end if;
 end if;
 return new;
end; $$;
revoke all on function app_private.guard_group_assignment() from public, anon, authenticated;
create trigger guard_group_assignment before insert or update on public.whatsapp_grupos
 for each row execute function app_private.guard_group_assignment();

create index if not exists whatsapp_grupos_gestor_idx on public.whatsapp_grupos(gestor_responsavel);
create index if not exists ai_conversations_user_id_idx on public.ai_conversations(user_id);
create index if not exists pending_demand_resolutions_resolved_by_idx on public.pending_demand_resolutions(resolved_by);

-- Master access applies consistently; every other permission is explicit below.
grant select, insert, update, delete on public.ai_chat_messages to authenticated;
create policy master_all on public.ai_chat_messages for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.ai_conversations to authenticated;
create policy master_all on public.ai_conversations for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.ai_prompts_config to authenticated;
create policy master_all on public.ai_prompts_config for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.calendar_events to authenticated;
create policy master_all on public.calendar_events for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.client_notes to authenticated;
create policy master_all on public.client_notes for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.coach_config to authenticated;
create policy master_all on public.coach_config for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.coach_messages to authenticated;
create policy master_all on public.coach_messages for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.daily_feedback_log to authenticated;
create policy master_all on public.daily_feedback_log for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.executive_briefings to authenticated;
create policy master_all on public.executive_briefings for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.master_actions_log to authenticated;
create policy master_all on public.master_actions_log for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.master_notifications to authenticated;
create policy master_all on public.master_notifications for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.nps_prediction_history to authenticated;
create policy master_all on public.nps_prediction_history for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.nps_predictions to authenticated;
create policy master_all on public.nps_predictions for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.nps_surveys to authenticated;
create policy master_all on public.nps_surveys for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.office_direct_messages to authenticated;
create policy master_all on public.office_direct_messages for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.office_messages to authenticated;
create policy master_all on public.office_messages for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.office_presence to authenticated;
create policy master_all on public.office_presence for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.office_rooms to authenticated;
create policy master_all on public.office_rooms for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.office_voice_sessions to authenticated;
create policy master_all on public.office_voice_sessions for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.onboarding_responses to authenticated;
create policy master_all on public.onboarding_responses for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.pending_demand_resolutions to authenticated;
create policy master_all on public.pending_demand_resolutions for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.profiles to authenticated;
create policy master_all on public.profiles for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.system_configs to authenticated;
create policy master_all on public.system_configs for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.tasks to authenticated;
create policy master_all on public.tasks for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.team_feedback_log to authenticated;
create policy master_all on public.team_feedback_log for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.webrtc_signals to authenticated;
create policy master_all on public.webrtc_signals for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.whatsapp_conversas to authenticated;
create policy master_all on public.whatsapp_conversas for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
grant select, insert, update, delete on public.whatsapp_grupos to authenticated;
create policy master_all on public.whatsapp_grupos for all to authenticated using ((select app_private.is_master())) with check ((select app_private.is_master()));
create policy staff_roster on public.profiles for select to authenticated using ((select app_private.is_staff()));
create policy assigned_clients on public.whatsapp_grupos for select to authenticated using (app_private.can_access_group(group_id));
create policy edit_assigned_clients on public.whatsapp_grupos for update to authenticated using (app_private.can_access_group(group_id)) with check (app_private.can_access_group(group_id));
create policy create_assigned_clients on public.whatsapp_grupos for insert to authenticated with check ((select app_private.is_staff()) and app_private.is_self_name(gestor_responsavel));
create policy assigned_read on public.whatsapp_conversas for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.onboarding_responses for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.nps_surveys for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.nps_predictions for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.nps_prediction_history for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.pending_demand_resolutions for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.client_notes for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_read on public.team_feedback_log for select to authenticated using (app_private.can_access_group(group_id));
create policy assigned_insert on public.pending_demand_resolutions for insert to authenticated with check (app_private.can_access_group(group_id));
create policy assigned_update on public.pending_demand_resolutions for update to authenticated using (app_private.can_access_group(group_id)) with check (app_private.can_access_group(group_id));
create policy own_note_insert on public.client_notes for insert to authenticated with check (app_private.can_access_group(group_id) and app_private.is_self_name(author_name));
create policy own_note_delete on public.client_notes for delete to authenticated using (app_private.can_access_group(group_id) and app_private.is_self_name(author_name));
create policy assigned_select on public.tasks for select to authenticated using ((select app_private.is_staff()) and (group_id is null and app_private.is_self_name(assigned_to) or group_id is not null and app_private.can_access_group(group_id)));
create policy assigned_insert on public.tasks for insert to authenticated with check ((select app_private.is_staff()) and (group_id is null and app_private.is_self_name(assigned_to) or group_id is not null and app_private.can_access_group(group_id)));
create policy assigned_update on public.tasks for update to authenticated using ((select app_private.is_staff()) and (group_id is null and app_private.is_self_name(assigned_to) or group_id is not null and app_private.can_access_group(group_id))) with check ((select app_private.is_staff()) and (group_id is null and app_private.is_self_name(assigned_to) or group_id is not null and app_private.can_access_group(group_id)));
create policy assigned_delete on public.tasks for delete to authenticated using ((select app_private.is_staff()) and (group_id is null and app_private.is_self_name(assigned_to) or group_id is not null and app_private.can_access_group(group_id)));
create policy calendar_read on public.calendar_events for select to authenticated using ((select app_private.is_staff()) and (group_id is not null and app_private.can_access_group(group_id) or group_id is null and (app_private.is_self_name(created_by) or (select app_private.staff_name()) = any(participants))));
create policy calendar_insert on public.calendar_events for insert to authenticated with check ((select app_private.is_staff()) and (group_id is not null and app_private.can_access_group(group_id) or group_id is null and (app_private.is_self_name(created_by) or (select app_private.staff_name()) = any(participants))) and app_private.is_self_name(created_by));
create policy calendar_update on public.calendar_events for update to authenticated using ((select app_private.is_staff()) and (group_id is not null and app_private.can_access_group(group_id) or group_id is null and (app_private.is_self_name(created_by) or (select app_private.staff_name()) = any(participants))) and app_private.is_self_name(created_by)) with check ((select app_private.is_staff()) and (group_id is not null and app_private.can_access_group(group_id) or group_id is null and (app_private.is_self_name(created_by) or (select app_private.staff_name()) = any(participants))) and app_private.is_self_name(created_by));
create policy calendar_delete on public.calendar_events for delete to authenticated using ((select app_private.is_staff()) and (group_id is not null and app_private.can_access_group(group_id) or group_id is null and (app_private.is_self_name(created_by) or (select app_private.staff_name()) = any(participants))) and app_private.is_self_name(created_by));
grant insert (id, group_id, survey_type, respondent_name, respondent_email, responses) on public.onboarding_responses to anon;
create policy public_submission on public.onboarding_responses for insert to anon, authenticated with check (app_private.is_form_group(group_id) and created_at between now() - interval '5 minutes' and now() + interval '1 minute' and jsonb_typeof(responses) = 'object' and octet_length(responses::text) <= 131072);
grant insert (id, group_id, score, comment, respondent_name, respondent_email, survey_type, quality_rating, communication_rating, results_rating, manager_rating, improvement_comment, referral_1_name, referral_1_company, referral_1_contact, referral_2_name, referral_2_company, referral_2_contact, referral_3_name, referral_3_company, referral_3_contact) on public.nps_surveys to anon;
create policy public_submission on public.nps_surveys for insert to anon, authenticated with check (app_private.is_form_group(group_id) and created_at between now() - interval '5 minutes' and now() + interval '1 minute');
create policy own_conversations on public.ai_conversations for all to authenticated using ((select app_private.is_staff()) and user_id = (select auth.uid())) with check ((select app_private.is_staff()) and user_id = (select auth.uid()));
create policy own_chat on public.ai_chat_messages for all to authenticated using ((select app_private.is_staff()) and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))) with check ((select app_private.is_staff()) and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy staff_rooms on public.office_rooms for select to authenticated using ((select app_private.is_staff()));
create policy presence_select on public.office_presence for select to authenticated using ((select app_private.is_staff()));
create policy presence_insert on public.office_presence for insert to authenticated with check ((select app_private.is_staff()) and user_id = (select auth.uid()));
create policy presence_update on public.office_presence for update to authenticated using ((select app_private.is_staff()) and user_id = (select auth.uid())) with check ((select app_private.is_staff()) and user_id = (select auth.uid()));
create policy presence_delete on public.office_presence for delete to authenticated using ((select app_private.is_staff()) and user_id = (select auth.uid()));
create policy staff_messages on public.office_messages for select to authenticated using ((select app_private.is_staff()));
create policy own_messages on public.office_messages for insert to authenticated with check ((select app_private.is_staff()) and user_id = (select auth.uid()));
create policy delete_own_messages on public.office_messages for delete to authenticated using ((select app_private.is_staff()) and user_id = (select auth.uid()));
create policy participant_read on public.office_direct_messages for select to authenticated using ((select app_private.is_staff()) and (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid())));
create policy sender_insert on public.office_direct_messages for insert to authenticated with check ((select app_private.is_staff()) and from_user_id = (select auth.uid()));
create policy receiver_read_receipt on public.office_direct_messages for update to authenticated using ((select app_private.is_staff()) and to_user_id = (select auth.uid())) with check ((select app_private.is_staff()) and to_user_id = (select auth.uid()));
create policy participant_select on public.office_voice_sessions for select to authenticated using ((select app_private.is_staff()) and (select auth.uid()) = any(participantes));
create policy participant_insert on public.office_voice_sessions for insert to authenticated with check ((select app_private.is_staff()) and (select auth.uid()) = any(participantes));
create policy participant_update on public.office_voice_sessions for update to authenticated using ((select app_private.is_staff()) and (select auth.uid()) = any(participantes)) with check ((select app_private.is_staff()) and (select auth.uid()) = any(participantes));
create policy participant_select on public.webrtc_signals for select to authenticated using ((select app_private.is_staff()) and (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid())));
create policy participant_delete on public.webrtc_signals for delete to authenticated using ((select app_private.is_staff()) and (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid())));
create policy sender_signal on public.webrtc_signals for insert to authenticated with check ((select app_private.is_staff()) and from_user_id = (select auth.uid()));

-- Presence messaging must not allow a recipient to rewrite sender/content.
revoke update on public.office_direct_messages from authenticated;
grant update (read) on public.office_direct_messages to authenticated;
-- Realtime reads are filtered by these same SELECT policies.
do $$
declare t text;
begin
 foreach t in array array['whatsapp_grupos','whatsapp_conversas','tasks','pending_demand_resolutions','onboarding_responses','office_presence','office_messages','office_direct_messages','office_rooms','webrtc_signals']
 loop
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
