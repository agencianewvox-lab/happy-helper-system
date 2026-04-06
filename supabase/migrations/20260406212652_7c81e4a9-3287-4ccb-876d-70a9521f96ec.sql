CREATE TABLE public.team_feedback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  group_id TEXT,
  group_name TEXT,
  relevance TEXT NOT NULL DEFAULT 'low',
  extracted_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.team_feedback_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert team_feedback_log" ON public.team_feedback_log FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public read team_feedback_log" ON public.team_feedback_log FOR SELECT TO public USING (true);