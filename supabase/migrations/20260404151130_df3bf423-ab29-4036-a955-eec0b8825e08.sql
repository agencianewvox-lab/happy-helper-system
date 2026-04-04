ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS estrelas integer DEFAULT NULL;
ALTER TABLE public.whatsapp_grupos ADD COLUMN IF NOT EXISTS estrelas_motivo text DEFAULT NULL;