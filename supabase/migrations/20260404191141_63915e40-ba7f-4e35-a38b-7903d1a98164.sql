CREATE TABLE public.daily_feedback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL,
  feedback_message text NOT NULL,
  feedback_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_name, feedback_date)
);

ALTER TABLE public.daily_feedback_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read daily_feedback_log" ON public.daily_feedback_log FOR SELECT TO public USING (true);
CREATE POLICY "Public insert daily_feedback_log" ON public.daily_feedback_log FOR INSERT TO public WITH CHECK (true);