
CREATE TABLE public.whatsapp_grupos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  categoria text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública dos grupos"
  ON public.whatsapp_grupos FOR SELECT
  USING (true);
