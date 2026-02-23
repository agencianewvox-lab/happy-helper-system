
-- Tabela para armazenar conversas do WhatsApp recebidas via webhook do n8n
CREATE TABLE public.whatsapp_conversas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telefone TEXT,
  nome_contato TEXT,
  mensagem TEXT,
  direcao TEXT DEFAULT 'entrada',
  status TEXT DEFAULT 'recebida',
  dados_extras JSONB DEFAULT '{}',
  recebido_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;

-- Política pública de leitura (dashboard interno)
CREATE POLICY "Leitura pública das conversas"
ON public.whatsapp_conversas
FOR SELECT
USING (true);

-- Política de inserção via service_role (edge function)
CREATE POLICY "Inserção via service role"
ON public.whatsapp_conversas
FOR INSERT
WITH CHECK (true);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversas;
