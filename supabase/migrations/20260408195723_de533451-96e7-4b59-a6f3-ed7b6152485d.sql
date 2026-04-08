
CREATE TABLE public.onboarding_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id TEXT NOT NULL,
  survey_type TEXT NOT NULL DEFAULT 'clinica',
  respondent_name TEXT,
  respondent_email TEXT,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert onboarding_responses"
  ON public.onboarding_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated read onboarding_responses"
  ON public.onboarding_responses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon read own onboarding"
  ON public.onboarding_responses
  FOR SELECT
  TO anon
  USING (true);
