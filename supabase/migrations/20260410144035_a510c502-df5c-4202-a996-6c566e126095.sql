-- whatsapp_conversas
CREATE POLICY "Masters can delete conversas"
ON public.whatsapp_conversas FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- client_notes (already has authenticated delete, OK)

-- nps_surveys
CREATE POLICY "Masters can delete nps_surveys"
ON public.nps_surveys FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- nps_predictions
CREATE POLICY "Masters can delete nps_predictions"
ON public.nps_predictions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- nps_prediction_history
CREATE POLICY "Masters can delete nps_prediction_history"
ON public.nps_prediction_history FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- onboarding_responses
CREATE POLICY "Masters can delete onboarding_responses"
ON public.onboarding_responses FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- coach_messages
CREATE POLICY "Masters can delete coach_messages"
ON public.coach_messages FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- master_notifications
CREATE POLICY "Masters can delete master_notifications"
ON public.master_notifications FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- team_feedback_log
CREATE POLICY "Masters can delete team_feedback_log"
ON public.team_feedback_log FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

-- pending_demand_resolutions
CREATE POLICY "Masters can delete pending_demand_resolutions"
ON public.pending_demand_resolutions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));