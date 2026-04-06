
CREATE TABLE public.ai_prompts_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL UNIQUE,
  prompt_label text NOT NULL,
  prompt_category text NOT NULL DEFAULT 'geral',
  prompt_value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.ai_prompts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can read ai_prompts_config" ON public.ai_prompts_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

CREATE POLICY "Masters can update ai_prompts_config" ON public.ai_prompts_config
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

CREATE POLICY "Masters can insert ai_prompts_config" ON public.ai_prompts_config
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_master = true));

CREATE POLICY "Service role full access ai_prompts_config" ON public.ai_prompts_config
  FOR ALL TO public
  USING (true) WITH CHECK (true);

CREATE INDEX idx_ai_prompts_config_key ON public.ai_prompts_config(prompt_key);
