
CREATE TABLE public.nps_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 10),
  comment text,
  respondent_name text,
  respondent_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert nps_surveys" ON public.nps_surveys
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read nps_surveys" ON public.nps_surveys
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Public read own survey" ON public.nps_surveys
  FOR SELECT TO anon USING (true);
