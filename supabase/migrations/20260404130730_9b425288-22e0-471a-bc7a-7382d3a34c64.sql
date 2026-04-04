
-- Coach messages table
CREATE TABLE public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_nome text NOT NULL,
  destinatario_telefone text,
  mensagem text NOT NULL,
  tipo text NOT NULL,
  group_id text,
  enviada boolean DEFAULT false,
  enviada_em timestamptz,
  resultado text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read coach_messages" ON public.coach_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert coach_messages" ON public.coach_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update coach_messages" ON public.coach_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access coach_messages" ON public.coach_messages FOR ALL TO public USING (true) WITH CHECK (true);

-- Coach config table
CREATE TABLE public.coach_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo boolean DEFAULT true,
  horario_inicio time DEFAULT '08:30',
  horario_fim time DEFAULT '17:30',
  max_mensagens_dia_por_pessoa integer DEFAULT 5,
  intervalo_minimo_minutos integer DEFAULT 60,
  tom text DEFAULT 'amigavel',
  tipos_ativos text[] DEFAULT ARRAY['grupo_parado','sentimento_caindo','pendencia_esquecida','frt_alto','cliente_elogiou','aniversario','ads_decolou','ads_caiu','onboarding_travou','parabens_performance','cliente_novo','padrao_detectado'],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read coach_config" ON public.coach_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update coach_config" ON public.coach_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access coach_config" ON public.coach_config FOR ALL TO public USING (true) WITH CHECK (true);

-- Insert default config row
INSERT INTO public.coach_config (ativo) VALUES (true);
