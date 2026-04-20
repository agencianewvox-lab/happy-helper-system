
-- whatsapp_conversas: remover leitura pública
DROP POLICY IF EXISTS "Leitura pública das conversas" ON public.whatsapp_conversas;
CREATE POLICY "Authenticated read whatsapp_conversas" ON public.whatsapp_conversas
  FOR SELECT TO authenticated USING (true);

-- whatsapp_grupos: remover leitura pública
DROP POLICY IF EXISTS "Leitura pública dos grupos" ON public.whatsapp_grupos;
CREATE POLICY "Authenticated read whatsapp_grupos" ON public.whatsapp_grupos
  FOR SELECT TO authenticated USING (true);

-- tasks: restringir tudo a authenticated
DROP POLICY IF EXISTS "Public read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Public delete tasks" ON public.tasks;
CREATE POLICY "Authenticated read tasks" ON public.tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update tasks" ON public.tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete tasks" ON public.tasks
  FOR DELETE TO authenticated USING (true);

-- ai_conversations: restringir
DROP POLICY IF EXISTS "Public read ai conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Public insert ai conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Public update ai conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Public delete ai conversations" ON public.ai_conversations;
CREATE POLICY "Authenticated read ai_conversations" ON public.ai_conversations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert ai_conversations" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update ai_conversations" ON public.ai_conversations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete ai_conversations" ON public.ai_conversations
  FOR DELETE TO authenticated USING (true);

-- ai_chat_messages: restringir
DROP POLICY IF EXISTS "Public read ai chat messages" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Public insert ai chat messages" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Public delete ai chat messages" ON public.ai_chat_messages;
CREATE POLICY "Authenticated read ai_chat_messages" ON public.ai_chat_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert ai_chat_messages" ON public.ai_chat_messages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete ai_chat_messages" ON public.ai_chat_messages
  FOR DELETE TO authenticated USING (true);

-- nps_predictions: remover leitura pública
DROP POLICY IF EXISTS "Public read nps_predictions" ON public.nps_predictions;
CREATE POLICY "Authenticated read nps_predictions" ON public.nps_predictions
  FOR SELECT TO authenticated USING (true);

-- nps_prediction_history: remover leitura pública
DROP POLICY IF EXISTS "Public read nps_prediction_history" ON public.nps_prediction_history;
CREATE POLICY "Authenticated read nps_prediction_history" ON public.nps_prediction_history
  FOR SELECT TO authenticated USING (true);

-- team_feedback_log: restringir
DROP POLICY IF EXISTS "Public read team_feedback_log" ON public.team_feedback_log;
DROP POLICY IF EXISTS "Public insert team_feedback_log" ON public.team_feedback_log;
CREATE POLICY "Authenticated read team_feedback_log" ON public.team_feedback_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert team_feedback_log" ON public.team_feedback_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- daily_feedback_log: restringir leitura
DROP POLICY IF EXISTS "Public read daily_feedback_log" ON public.daily_feedback_log;
DROP POLICY IF EXISTS "Public insert daily_feedback_log" ON public.daily_feedback_log;
CREATE POLICY "Authenticated read daily_feedback_log" ON public.daily_feedback_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert daily_feedback_log" ON public.daily_feedback_log
  FOR INSERT TO authenticated WITH CHECK (true);
