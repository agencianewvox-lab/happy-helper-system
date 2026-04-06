ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS responsavel_master text DEFAULT NULL;
ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS responsavel_socio text DEFAULT NULL;