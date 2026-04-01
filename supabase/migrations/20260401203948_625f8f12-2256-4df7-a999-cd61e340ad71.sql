ALTER TABLE public.whatsapp_grupos
  ADD COLUMN plano text DEFAULT NULL,
  ADD COLUMN investimento_ads numeric DEFAULT NULL,
  ADD COLUMN data_entrada date DEFAULT NULL,
  ADD COLUMN aniversario_cliente date DEFAULT NULL,
  ADD COLUMN aniversario_empresa date DEFAULT NULL,
  ADD COLUMN acessos_cliente text DEFAULT NULL;