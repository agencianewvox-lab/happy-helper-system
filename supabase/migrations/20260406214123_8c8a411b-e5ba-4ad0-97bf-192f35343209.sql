-- Add is_master and telefone to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone text;

-- Create master_actions_log
CREATE TABLE IF NOT EXISTS public.master_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_by text NOT NULL,
  action_type text NOT NULL,
  target_group_id text,
  description text NOT NULL,
  dados_antes jsonb DEFAULT '{}'::jsonb,
  dados_depois jsonb DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_actions_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_master_actions_log_executed_at ON public.master_actions_log (executed_at DESC);
CREATE INDEX idx_master_actions_log_by_user ON public.master_actions_log (executed_by, executed_at DESC);

CREATE POLICY "Masters can read master_actions_log" ON public.master_actions_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_master = true));

CREATE POLICY "Service role insert master_actions_log" ON public.master_actions_log
  FOR INSERT TO public
  WITH CHECK (true);

-- Create master_notifications
CREATE TABLE IF NOT EXISTS public.master_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario text NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  group_id text,
  dados_relacionados jsonb DEFAULT '{}'::jsonb,
  enviada_em timestamptz NOT NULL DEFAULT now(),
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can read master_notifications" ON public.master_notifications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_master = true));

CREATE POLICY "Service role insert master_notifications" ON public.master_notifications
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Masters can update master_notifications" ON public.master_notifications
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_master = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_master = true));

-- Create executive_briefings
CREATE TABLE IF NOT EXISTS public.executive_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date date NOT NULL UNIQUE,
  conteudo text NOT NULL,
  dados_base jsonb DEFAULT '{}'::jsonb,
  enviado_alisson boolean NOT NULL DEFAULT false,
  enviado_priscilla boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.executive_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can read executive_briefings" ON public.executive_briefings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_master = true));

CREATE POLICY "Service role insert executive_briefings" ON public.executive_briefings
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Service role update executive_briefings" ON public.executive_briefings
  FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);