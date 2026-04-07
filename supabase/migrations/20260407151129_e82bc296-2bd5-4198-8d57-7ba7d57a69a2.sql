ALTER TABLE public.whatsapp_grupos 
  ADD COLUMN IF NOT EXISTS plataforma_ads text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS investimento_google_ads numeric DEFAULT NULL;