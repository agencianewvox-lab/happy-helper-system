-- Independent Supabase application schema. No production cutover.

-- Captured from source catalog; no records, credentials, legacy public grants, or triggers.

set local search_path = public, pg_catalog;

create table public."ai_chat_messages" (
  "id" uuid default gen_random_uuid() not null,
  "role" text not null,
  "content" text not null,
  "created_at" timestamp with time zone default now() not null,
  "conversation_id" uuid
);

alter table public."ai_chat_messages" enable row level security;

revoke all on public."ai_chat_messages" from public, anon, authenticated;

grant select, insert, update, delete on public."ai_chat_messages" to service_role;

create table public."ai_conversations" (
  "id" uuid default gen_random_uuid() not null,
  "folder" text not null,
  "title" text default 'Nova conversa'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "user_id" uuid
);

alter table public."ai_conversations" enable row level security;

revoke all on public."ai_conversations" from public, anon, authenticated;

grant select, insert, update, delete on public."ai_conversations" to service_role;

create table public."ai_prompts_config" (
  "id" uuid default gen_random_uuid() not null,
  "prompt_key" text not null,
  "prompt_label" text not null,
  "prompt_category" text default 'geral'::text not null,
  "prompt_value" text not null,
  "description" text,
  "updated_at" timestamp with time zone default now() not null,
  "updated_by" text
);

alter table public."ai_prompts_config" enable row level security;

revoke all on public."ai_prompts_config" from public, anon, authenticated;

grant select, insert, update, delete on public."ai_prompts_config" to service_role;

create table public."calendar_events" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "description" text,
  "start_time" timestamp with time zone not null,
  "end_time" timestamp with time zone not null,
  "event_type" text default 'reuniao'::text not null,
  "created_by" text not null,
  "participants" text[] default '{}'::text[],
  "group_id" text,
  "location" text,
  "color" text default '#3b82f6'::text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."calendar_events" enable row level security;

revoke all on public."calendar_events" from public, anon, authenticated;

grant select, insert, update, delete on public."calendar_events" to service_role;

create table public."client_notes" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "content" text not null,
  "author_name" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."client_notes" enable row level security;

revoke all on public."client_notes" from public, anon, authenticated;

grant select, insert, update, delete on public."client_notes" to service_role;

create table public."coach_config" (
  "id" uuid default gen_random_uuid() not null,
  "ativo" boolean default true,
  "horario_inicio" time without time zone default '08:30:00'::time without time zone,
  "horario_fim" time without time zone default '17:30:00'::time without time zone,
  "max_mensagens_dia_por_pessoa" integer default 5,
  "intervalo_minimo_minutos" integer default 60,
  "tom" text default 'amigavel'::text,
  "tipos_ativos" text[] default ARRAY['grupo_parado'::text, 'sentimento_caindo'::text, 'pendencia_esquecida'::text, 'frt_alto'::text, 'cliente_elogiou'::text, 'aniversario'::text, 'ads_decolou'::text, 'ads_caiu'::text, 'onboarding_travou'::text, 'parabens_performance'::text, 'cliente_novo'::text, 'padrao_detectado'::text],
  "created_at" timestamp with time zone default now()
);

alter table public."coach_config" enable row level security;

revoke all on public."coach_config" from public, anon, authenticated;

grant select, insert, update, delete on public."coach_config" to service_role;

create table public."coach_messages" (
  "id" uuid default gen_random_uuid() not null,
  "destinatario_nome" text not null,
  "destinatario_telefone" text,
  "mensagem" text not null,
  "tipo" text not null,
  "group_id" text,
  "enviada" boolean default false,
  "enviada_em" timestamp with time zone,
  "resultado" text,
  "created_at" timestamp with time zone default now()
);

alter table public."coach_messages" enable row level security;

revoke all on public."coach_messages" from public, anon, authenticated;

grant select, insert, update, delete on public."coach_messages" to service_role;

create table public."daily_feedback_log" (
  "id" uuid default gen_random_uuid() not null,
  "member_name" text not null,
  "feedback_message" text not null,
  "feedback_date" date default CURRENT_DATE not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."daily_feedback_log" enable row level security;

revoke all on public."daily_feedback_log" from public, anon, authenticated;

grant select, insert, update, delete on public."daily_feedback_log" to service_role;

create table public."executive_briefings" (
  "id" uuid default gen_random_uuid() not null,
  "briefing_date" date not null,
  "conteudo" text not null,
  "dados_base" jsonb default '{}'::jsonb,
  "enviado_alisson" boolean default false not null,
  "enviado_priscilla" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."executive_briefings" enable row level security;

revoke all on public."executive_briefings" from public, anon, authenticated;

grant select, insert, update, delete on public."executive_briefings" to service_role;

create table public."master_actions_log" (
  "id" uuid default gen_random_uuid() not null,
  "executed_by" text not null,
  "action_type" text not null,
  "target_group_id" text,
  "description" text not null,
  "dados_antes" jsonb default '{}'::jsonb,
  "dados_depois" jsonb default '{}'::jsonb,
  "executed_at" timestamp with time zone default now() not null
);

alter table public."master_actions_log" enable row level security;

revoke all on public."master_actions_log" from public, anon, authenticated;

grant select, insert, update, delete on public."master_actions_log" to service_role;

create table public."master_notifications" (
  "id" uuid default gen_random_uuid() not null,
  "destinatario" text not null,
  "tipo" text not null,
  "titulo" text not null,
  "mensagem" text not null,
  "group_id" text,
  "dados_relacionados" jsonb default '{}'::jsonb,
  "enviada_em" timestamp with time zone default now() not null,
  "lida" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."master_notifications" enable row level security;

revoke all on public."master_notifications" from public, anon, authenticated;

grant select, insert, update, delete on public."master_notifications" to service_role;

create table public."nps_prediction_history" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "nps_score" numeric not null,
  "nps_categoria" text not null,
  "recorded_at" timestamp with time zone default now() not null
);

alter table public."nps_prediction_history" enable row level security;

revoke all on public."nps_prediction_history" from public, anon, authenticated;

grant select, insert, update, delete on public."nps_prediction_history" to service_role;

create table public."nps_predictions" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "nps_score" numeric default 0 not null,
  "nps_categoria" text default 'neutro'::text not null,
  "confianca" integer default 0 not null,
  "fatores_positivos" jsonb default '[]'::jsonb not null,
  "fatores_negativos" jsonb default '[]'::jsonb not null,
  "fator_principal" text,
  "recomendacao" text,
  "tendencia" text,
  "score_anterior" numeric,
  "dimension_scores" jsonb default '[]'::jsonb not null,
  "calculated_at" timestamp with time zone default now() not null
);

alter table public."nps_predictions" enable row level security;

revoke all on public."nps_predictions" from public, anon, authenticated;

grant select, insert, update, delete on public."nps_predictions" to service_role;

create table public."nps_surveys" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "score" integer not null,
  "comment" text,
  "respondent_name" text,
  "respondent_email" text,
  "created_at" timestamp with time zone default now() not null,
  "survey_type" text default 'operacao'::text not null,
  "quality_rating" text,
  "communication_rating" text,
  "results_rating" text,
  "manager_rating" text,
  "improvement_comment" text,
  "referral_1_name" text,
  "referral_1_company" text,
  "referral_1_contact" text,
  "referral_2_name" text,
  "referral_2_company" text,
  "referral_2_contact" text,
  "referral_3_name" text,
  "referral_3_company" text,
  "referral_3_contact" text
);

alter table public."nps_surveys" enable row level security;

revoke all on public."nps_surveys" from public, anon, authenticated;

grant select, insert, update, delete on public."nps_surveys" to service_role;

create table public."office_direct_messages" (
  "id" uuid default gen_random_uuid() not null,
  "from_user_id" uuid not null,
  "to_user_id" uuid not null,
  "from_user_name" text not null,
  "content" text not null,
  "read" boolean default false,
  "created_at" timestamp with time zone default now() not null
);

alter table public."office_direct_messages" enable row level security;

revoke all on public."office_direct_messages" from public, anon, authenticated;

grant select, insert, update, delete on public."office_direct_messages" to service_role;

create table public."office_messages" (
  "id" uuid default gen_random_uuid() not null,
  "room_id" uuid not null,
  "user_id" uuid not null,
  "user_name" text not null,
  "user_avatar_color" text default '#3b82f6'::text,
  "content" text not null,
  "tipo" text default 'text'::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."office_messages" enable row level security;

revoke all on public."office_messages" from public, anon, authenticated;

grant select, insert, update, delete on public."office_messages" to service_role;

create table public."office_presence" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "user_name" text not null,
  "x" integer default 5 not null,
  "y" integer default 5 not null,
  "status" text default 'online'::text not null,
  "avatar_color" text default '#3b82f6'::text not null,
  "current_room" text,
  "last_seen" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "room_id" uuid,
  "user_avatar_color" text default '#3b82f6'::text,
  "status_message" text,
  "mic_enabled" boolean default false,
  "joined_room_at" timestamp with time zone,
  "cam_enabled" boolean default false
);

alter table public."office_presence" enable row level security;

revoke all on public."office_presence" from public, anon, authenticated;

grant select, insert, update, delete on public."office_presence" to service_role;

create table public."office_rooms" (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "descricao" text,
  "icone" text default '🏢'::text,
  "cor" text default 'blue'::text,
  "capacidade_max" integer default 10,
  "voz_ativa_padrao" boolean default false,
  "ordem" integer default 0,
  "ativo" boolean default true,
  "created_at" timestamp with time zone default now() not null,
  "locked_by" uuid,
  "locked_by_name" text
);

alter table public."office_rooms" enable row level security;

revoke all on public."office_rooms" from public, anon, authenticated;

grant select, insert, update, delete on public."office_rooms" to service_role;

create table public."office_voice_sessions" (
  "id" uuid default gen_random_uuid() not null,
  "room_id" uuid,
  "participantes" uuid[] default '{}'::uuid[],
  "started_at" timestamp with time zone default now() not null,
  "ended_at" timestamp with time zone
);

alter table public."office_voice_sessions" enable row level security;

revoke all on public."office_voice_sessions" from public, anon, authenticated;

grant select, insert, update, delete on public."office_voice_sessions" to service_role;

create table public."onboarding_responses" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "survey_type" text default 'clinica'::text not null,
  "respondent_name" text,
  "respondent_email" text,
  "responses" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."onboarding_responses" enable row level security;

revoke all on public."onboarding_responses" from public, anon, authenticated;

grant select, insert, update, delete on public."onboarding_responses" to service_role;

create table public."pending_demand_resolutions" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "term" text not null,
  "requested_at" timestamp with time zone not null,
  "resolved" boolean default false not null,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone default now(),
  "created_at" timestamp with time zone default now() not null,
  "status" text default 'pendente'::text not null,
  "due_date" date
);

alter table public."pending_demand_resolutions" enable row level security;

revoke all on public."pending_demand_resolutions" from public, anon, authenticated;

grant select, insert, update, delete on public."pending_demand_resolutions" to service_role;

create table public."profiles" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "full_name" text not null,
  "role" text default 'gestor'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "is_master" boolean default false not null,
  "telefone" text
);

alter table public."profiles" enable row level security;

revoke all on public."profiles" from public, anon, authenticated;

grant select, insert, update, delete on public."profiles" to service_role;

create table public."system_configs" (
  "id" uuid default gen_random_uuid() not null,
  "config_key" text not null,
  "config_label" text not null,
  "config_category" text default 'Geral'::text not null,
  "config_value" text not null,
  "config_type" text default 'text'::text not null,
  "description" text,
  "updated_at" timestamp with time zone default now() not null,
  "updated_by" text
);

alter table public."system_configs" enable row level security;

revoke all on public."system_configs" from public, anon, authenticated;

grant select, insert, update, delete on public."system_configs" to service_role;

create table public."tasks" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "description" text,
  "assigned_to" text not null,
  "group_id" text,
  "status" text default 'pendente'::text not null,
  "priority" text default 'normal'::text not null,
  "due_date" date,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "completed_by" uuid
);

alter table public."tasks" enable row level security;

revoke all on public."tasks" from public, anon, authenticated;

grant select, insert, update, delete on public."tasks" to service_role;

create table public."team_feedback_log" (
  "id" uuid default gen_random_uuid() not null,
  "member_name" text not null,
  "message" text not null,
  "category" text default 'geral'::text not null,
  "group_id" text,
  "group_name" text,
  "relevance" text default 'low'::text not null,
  "extracted_action" text,
  "created_at" timestamp with time zone default now() not null
);

alter table public."team_feedback_log" enable row level security;

revoke all on public."team_feedback_log" from public, anon, authenticated;

grant select, insert, update, delete on public."team_feedback_log" to service_role;

create table public."webrtc_signals" (
  "id" uuid default gen_random_uuid() not null,
  "room_id" uuid not null,
  "from_user_id" uuid not null,
  "to_user_id" uuid not null,
  "signal_type" text not null,
  "signal_data" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

alter table public."webrtc_signals" enable row level security;

revoke all on public."webrtc_signals" from public, anon, authenticated;

grant select, insert, update, delete on public."webrtc_signals" to service_role;

create table public."whatsapp_conversas" (
  "id" uuid default gen_random_uuid() not null,
  "telefone" text,
  "nome_contato" text,
  "mensagem" text,
  "direcao" text default 'entrada'::text,
  "status" text default 'recebida'::text,
  "dados_extras" jsonb default '{}'::jsonb,
  "recebido_em" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "group_id" text
);

alter table public."whatsapp_conversas" enable row level security;

revoke all on public."whatsapp_conversas" from public, anon, authenticated;

grant select, insert, update, delete on public."whatsapp_conversas" to service_role;

create table public."whatsapp_grupos" (
  "id" uuid default gen_random_uuid() not null,
  "group_id" text not null,
  "nome" text not null,
  "categoria" text,
  "created_at" timestamp with time zone default now() not null,
  "plano" text,
  "investimento_ads" numeric,
  "data_entrada" date,
  "aniversario_cliente" date,
  "aniversario_empresa" date,
  "acessos_cliente" text,
  "ad_account_id" text,
  "data_ciclo_ads" date,
  "gestor_responsavel" text,
  "briefing" text,
  "estrelas_dificuldade" integer,
  "estrelas_financeiro" integer,
  "estrelas_temperamento" integer,
  "responsavel_master" text,
  "responsavel_socio" text,
  "plataforma_ads" text,
  "investimento_google_ads" numeric
);

alter table public."whatsapp_grupos" enable row level security;

revoke all on public."whatsapp_grupos" from public, anon, authenticated;

grant select, insert, update, delete on public."whatsapp_grupos" to service_role;

alter table public."whatsapp_conversas" add constraint "whatsapp_conversas_pkey" PRIMARY KEY (id);

alter table public."whatsapp_grupos" add constraint "whatsapp_grupos_pkey" PRIMARY KEY (id);

alter table public."whatsapp_grupos" add constraint "whatsapp_grupos_group_id_key" UNIQUE (group_id);

alter table public."office_direct_messages" add constraint "office_direct_messages_pkey" PRIMARY KEY (id);

alter table public."office_voice_sessions" add constraint "office_voice_sessions_pkey" PRIMARY KEY (id);

alter table public."pending_demand_resolutions" add constraint "pending_demand_resolutions_pkey" PRIMARY KEY (id);

alter table public."pending_demand_resolutions" add constraint "pending_demand_resolutions_group_id_term_requested_at_key" UNIQUE (group_id, term, requested_at);

alter table public."ai_chat_messages" add constraint "ai_chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])));

alter table public."ai_chat_messages" add constraint "ai_chat_messages_pkey" PRIMARY KEY (id);

alter table public."webrtc_signals" add constraint "webrtc_signals_pkey" PRIMARY KEY (id);

alter table public."ai_conversations" add constraint "ai_conversations_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_user_id_key" UNIQUE (user_id);

alter table public."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);

alter table public."coach_messages" add constraint "coach_messages_pkey" PRIMARY KEY (id);

alter table public."coach_config" add constraint "coach_config_pkey" PRIMARY KEY (id);

alter table public."nps_predictions" add constraint "nps_predictions_nps_categoria_check" CHECK ((nps_categoria = ANY (ARRAY['promotor'::text, 'neutro'::text, 'detrator'::text])));

alter table public."nps_predictions" add constraint "nps_predictions_tendencia_check" CHECK ((tendencia = ANY (ARRAY['subindo'::text, 'estavel'::text, 'caindo'::text])));

alter table public."nps_predictions" add constraint "nps_predictions_pkey" PRIMARY KEY (id);

alter table public."nps_predictions" add constraint "nps_predictions_group_id_key" UNIQUE (group_id);

alter table public."nps_prediction_history" add constraint "nps_prediction_history_pkey" PRIMARY KEY (id);

alter table public."calendar_events" add constraint "calendar_events_pkey" PRIMARY KEY (id);

alter table public."nps_surveys" add constraint "nps_surveys_score_check" CHECK (((score >= 0) AND (score <= 10)));

alter table public."nps_surveys" add constraint "nps_surveys_pkey" PRIMARY KEY (id);

alter table public."daily_feedback_log" add constraint "daily_feedback_log_pkey" PRIMARY KEY (id);

alter table public."daily_feedback_log" add constraint "daily_feedback_log_member_name_feedback_date_key" UNIQUE (member_name, feedback_date);

alter table public."client_notes" add constraint "client_notes_pkey" PRIMARY KEY (id);

alter table public."team_feedback_log" add constraint "team_feedback_log_pkey" PRIMARY KEY (id);

alter table public."master_actions_log" add constraint "master_actions_log_pkey" PRIMARY KEY (id);

alter table public."master_notifications" add constraint "master_notifications_pkey" PRIMARY KEY (id);

alter table public."executive_briefings" add constraint "executive_briefings_pkey" PRIMARY KEY (id);

alter table public."executive_briefings" add constraint "executive_briefings_briefing_date_key" UNIQUE (briefing_date);

alter table public."ai_prompts_config" add constraint "ai_prompts_config_pkey" PRIMARY KEY (id);

alter table public."ai_prompts_config" add constraint "ai_prompts_config_prompt_key_key" UNIQUE (prompt_key);

alter table public."system_configs" add constraint "system_configs_pkey" PRIMARY KEY (id);

alter table public."system_configs" add constraint "system_configs_config_key_key" UNIQUE (config_key);

alter table public."onboarding_responses" add constraint "onboarding_responses_pkey" PRIMARY KEY (id);

alter table public."office_presence" add constraint "office_presence_pkey" PRIMARY KEY (id);

alter table public."office_presence" add constraint "office_presence_user_id_key" UNIQUE (user_id);

alter table public."office_rooms" add constraint "office_rooms_pkey" PRIMARY KEY (id);

alter table public."office_rooms" add constraint "office_rooms_nome_key" UNIQUE (nome);

alter table public."office_messages" add constraint "office_messages_tipo_check" CHECK ((tipo = ANY (ARRAY['text'::text, 'system'::text, 'emoji_reaction'::text])));

alter table public."office_messages" add constraint "office_messages_pkey" PRIMARY KEY (id);

alter table public."office_voice_sessions" add constraint "office_voice_sessions_room_id_fkey" FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE SET NULL;

alter table public."pending_demand_resolutions" add constraint "pending_demand_resolutions_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

alter table public."ai_chat_messages" add constraint "ai_chat_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;

alter table public."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."ai_conversations" add constraint "ai_conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."office_presence" add constraint "office_presence_room_id_fkey" FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE SET NULL;

alter table public."office_messages" add constraint "office_messages_room_id_fkey" FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE;

CREATE INDEX idx_nps_history_group_recorded ON public.nps_prediction_history USING btree (group_id, recorded_at DESC);

CREATE INDEX idx_webrtc_signals_to_user ON public.webrtc_signals USING btree (to_user_id, room_id);

CREATE INDEX idx_webrtc_signals_room ON public.webrtc_signals USING btree (room_id);

CREATE INDEX idx_client_notes_group_id ON public.client_notes USING btree (group_id);

CREATE INDEX idx_master_actions_log_executed_at ON public.master_actions_log USING btree (executed_at DESC);

CREATE INDEX idx_master_actions_log_by_user ON public.master_actions_log USING btree (executed_by, executed_at DESC);

CREATE INDEX idx_office_messages_room_created ON public.office_messages USING btree (room_id, created_at DESC);

CREATE INDEX idx_office_dm_users ON public.office_direct_messages USING btree (from_user_id, to_user_id, created_at DESC);

CREATE INDEX idx_ai_prompts_config_key ON public.ai_prompts_config USING btree (prompt_key);

-- Application roles remain denied until the reviewed access-policy migration.
