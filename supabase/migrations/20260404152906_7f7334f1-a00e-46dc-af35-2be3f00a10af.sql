
ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS estrelas_dificuldade integer DEFAULT NULL;
ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS estrelas_financeiro integer DEFAULT NULL;
ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS estrelas_temperamento integer DEFAULT NULL;
ALTER TABLE public.whatsapp_grupos DROP COLUMN IF EXISTS estrelas;
ALTER TABLE public.whatsapp_grupos DROP COLUMN IF EXISTS estrelas_motivo;
