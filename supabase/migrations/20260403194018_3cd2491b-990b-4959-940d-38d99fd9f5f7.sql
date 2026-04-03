ALTER TABLE public.pending_demand_resolutions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';

-- Migrate existing data: resolved=true -> feito, resolved=false -> pendente
UPDATE public.pending_demand_resolutions SET status = 'feito' WHERE resolved = true;
UPDATE public.pending_demand_resolutions SET status = 'pendente' WHERE resolved = false;